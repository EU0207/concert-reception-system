// 管理者の追加端末リンク基盤を、既存端末と新端末の画面へ接続する。

import type { createAuthorizationPort } from './authorization-port.ts';
import type { DeviceKeyScope } from '../../storage/device-vault.ts';
import { ensureDeviceKey } from '../../storage/device-vault.ts';
import { createAuthorizationOperationJournal } from '../../storage/authorization-operations.ts';
import { authorizeOnline, RECENT_AUTH_WINDOW } from '../../domain/authorization/policy.ts';
import type { OwnerDeviceLink } from '../../domain/authorization/device-registration.ts';
import { ownerDeviceLinkDigest } from '../../domain/authorization/device-registration.ts';
import { requireValue } from '../../domain/seats/validation.ts';
import type { OwnerDeviceUiPort, OwnerDeviceView } from '../../app/owner-device-types.ts';

/** 既存鍵による発行元と、未承認の新端末を別の権限経路で扱う。 */
export function createOwnerDeviceUiPort(authorization: Awaited<ReturnType<typeof createAuthorizationPort>>,
  binding: DeviceKeyScope, mode: OwnerDeviceView['mode']): OwnerDeviceUiPort {
  const journal = createAuthorizationOperationJournal(binding), listeners = new Set<() => void>();
  const known = new Set<string>(), readers = new Set<string>();
  let current: OwnerDeviceView | undefined, assertIssuer: (() => void) | undefined;
  let disposed = false, generation = 0, expiry: ReturnType<typeof setTimeout> | undefined;

  /** 失効・通信断では表示と送信を止め、保存済みの発行情報は保持する。 */
  function invalidate() {
    clearTimeout(expiry); current = undefined; assertIssuer = undefined; generation++;
    for (const listener of listeners) listener();
  }

  const unsubscribe = authorization.onInvalidate(invalidate);

  /** 画面が有効で、本人・端末が保存領域の主体から変わっていないか確認する。 */
  function assertIdentity() {
    const identity = authorization.identity();
    requireValue(!disposed && current && identity.human?.uid === binding.humanUid && identity.deviceUid === binding.deviceUid,
      'AUTHORIZATION_RECHECK_REQUIRED');
    requireValue(identity.human.provider === 'google.com', 'GOOGLE_AUTH_REQUIRED');
  }

  /** 現在認可と期限を確認し、発行結果または読取り証跡を自動送信せず回収する。 */
  async function readView(): Promise<OwnerDeviceView> {
    requireValue(!disposed, 'AUTHORIZATION_DISPOSED');
    clearTimeout(expiry); current = undefined; assertIssuer = undefined;
    const version = ++generation;
    let view: OwnerDeviceView;
    if (mode === 'issuer') {
      const { snapshot, inventory, serverNow } = await authorization.devices.list(), started = performance.now();
      requireValue(snapshot.role.role === 'owner' && snapshot.role.humanUid === binding.humanUid &&
        snapshot.deviceAuthUid === binding.deviceUid && snapshot.device.storageEpoch === binding.storageEpoch, 'OWNER_REQUIRED');
      view = { ...binding, mode, deviceUid: binding.deviceUid, serverNow,
        validUntil: Math.min(snapshot.role.endsAt, snapshot.session.expiresAt, snapshot.session.humanAuthTime + RECENT_AUTH_WINDOW + 1),
        targets: inventory.devices.filter(d => d.humanUid === binding.humanUid && !d.active && !d.approved && !d.retired &&
          d.revision === 1 && d.preparedRoleRevision === 0 && d.deviceUid !== binding.deviceUid).map(d => d.deviceUid), issues: [], readers: [] };
      current = view;
      assertIssuer = () => { assertIdentity(); authorizeOnline(snapshot, 'manageDevices', serverNow + Math.floor(performance.now() - started)); };
      assertIssuer();
      for (const id of await journal.list(assertIssuer)) {
        const saved = await journal.read(id, assertIssuer) as { kind?: string; link?: OwnerDeviceLink } | null;
        if (saved?.kind !== 'ownerDeviceLink' || !saved.link) continue;
        known.add(id);
        const link = await authorization.ownerDeviceLinks.inspectIssue(id, journal, assertIssuer);
        view.issues.push({ operationId: id, targetDeviceUid: saved.link.targetDeviceUid, expiresAt: saved.link.expiresAt,
          status: link?.status ?? 'not-issued' });
      }
      view.serverNow += Math.max(0, Math.floor(performance.now() - started));
    } else {
      // 未承認端末は管理一覧・業務本文を取得せず、自端末の読取り証跡だけを扱う。
      const timing = await authorization.ownerDeviceLinks.receiverState();
      const links = await authorization.ownerDeviceLinks.listReadLinks(), identity = authorization.identity();
      requireValue(identity.human?.provider === 'google.com', 'GOOGLE_AUTH_REQUIRED');
      view = { ...binding, ...timing, mode, deviceUid: binding.deviceUid, targets: [], issues: [], readers: [] };
      current = view; assertIdentity();
      for (const reader of links) {
        requireValue(reader.targetDeviceUid === binding.deviceUid && reader.storageEpoch === binding.storageEpoch, 'KEY_BINDING_MISMATCH');
        readers.add(reader.operationId);
        view.readers.push({ operationId: reader.operationId, approved: Boolean(await authorization.ownerDeviceLinks.receipt(reader.operationId)) });
      }
    }
    requireValue(!disposed && version === generation, 'AUTHORIZATION_RECHECK_REQUIRED');
    assertIdentity(); assertIssuer?.();
    if (Number.isFinite(view.validUntil)) {
      requireValue(view.validUntil > view.serverNow, 'AUTHORIZATION_EXPIRED');
      expiry = setTimeout(invalidate, Math.min(view.validUntil - view.serverNow, 2_147_483_647));
    }
    return structuredClone(view);
  }

  /** 取得失敗後に途中の台帳で送信できないよう、現在値を必ず無効にする。 */
  async function load(): Promise<OwnerDeviceView> {
    try { return await readView(); }
    catch (cause) { clearTimeout(expiry); current = undefined; assertIssuer = undefined; generation++; throw cause; }
  }

  /** 既存の専用監査へ固定区分だけを送り、拒否の記録失敗を承認成功にはしない。 */
  async function recordRejection(digest: string) {
    try { await authorization.ownerDeviceLinks.recordExpired(digest); return; } catch { /* 期限切れ以外は拒否区分へ進む。 */ }
    try { await authorization.ownerDeviceLinks.recordRejection(digest, 'unknown'); } catch { /* 権限がない場合、監査送信も拒否される。 */ }
  }

  return {
    load,

    /** 一回限りの発行を行い、平文トークンは呼出し元への応答以外に保持しない。 */
    async issue(target, id) {
      requireValue(mode === 'issuer' && assertIssuer && current?.targets.includes(target), 'PENDING_OWNER_DEVICE_REQUIRED');
      assertIssuer(); await ensureDeviceKey(binding, false); assertIssuer();
      known.add(id);
      return authorization.ownerDeviceLinks.issue(target, id, journal, assertIssuer);
    },

    /** 発行元の固定入力と現在認可で、未使用リンクを取り消す。 */
    async cancel(id) {
      requireValue(mode === 'issuer' && known.has(id) && assertIssuer, 'FIXED_OPERATION_REQUIRED');
      assertIssuer(); await authorization.ownerDeviceLinks.cancel(id, journal, assertIssuer); assertIssuer();
    },

    /** 新端末でリンクを照合して操作IDを返し、平文を保存しない。 */
    async read(token) {
      requireValue(mode === 'receiver', 'OWNER_LINK_BINDING_MISMATCH'); assertIdentity();
      const digest = await ownerDeviceLinkDigest(token);
      try {
        const reader = await authorization.ownerDeviceLinks.readToken(token);
        assertIdentity(); readers.add(reader.operationId);
        return reader.operationId;
      } catch (cause) { await recordRejection(digest); throw cause; }
    },

    /** 読取り済みの同じIDを承認し、応答喪失時も基盤の結果照会へ接続する。 */
    async approve(id) {
      requireValue(mode === 'receiver' && readers.has(id), 'OWNER_LINK_READ_REQUIRED'); assertIdentity();
      await authorization.ownerDeviceLinks.approve(id);
      // 自端末の承認で旧認可は失効する。確定結果を業務利用の認可へ読み替えない。
      const identity = authorization.identity();
      requireValue(!disposed && identity.human?.uid === binding.humanUid && identity.deviceUid === binding.deviceUid,
        'PRINCIPAL_CHANGED');
    },

    onInvalidate: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },

    /** 画面の購読だけを終了し、発行記録と鍵を削除しない。 */
    dispose() { disposed = true; clearTimeout(expiry); generation++; current = undefined; assertIssuer = undefined; unsubscribe(); listeners.clear(); },
  };
}
