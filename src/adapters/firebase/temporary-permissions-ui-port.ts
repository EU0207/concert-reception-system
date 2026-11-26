// 現在認可と暗号化された固定入力を、臨時管理者の権限設定画面へ接続する。

import type { createAuthorizationPort } from './authorization-port.ts';
import type { DeviceKeyScope } from '../../storage/device-vault.ts';
import { ensureDeviceKey } from '../../storage/device-vault.ts';
import { createAuthorizationOperationJournal } from '../../storage/authorization-operations.ts';
import { authorizeOnline, RECENT_AUTH_WINDOW } from '../../domain/authorization/policy.ts';
import { requireValue } from '../../domain/seats/validation.ts';
import type { TemporaryPermissionsUiPort, PermissionView, PendingPermission } from '../../app/temporary-permissions-types.ts';

/** 準備済み端末の鍵を使い、設定の一回確定・取消しと再起動後の回収を提供する。 */
export function createTemporaryPermissionsUiPort(
  authorization: Awaited<ReturnType<typeof createAuthorizationPort>>, binding: DeviceKeyScope,
): TemporaryPermissionsUiPort {
  const journal = createAuthorizationOperationJournal(binding), known = new Set<string>();
  const listeners = new Set<() => void>();
  let current: PermissionView | undefined, locked = true, disposed = false, generation = 0, loadedAt = 0;
  let expiry: ReturnType<typeof setTimeout> | undefined;

  /** 通信断・失効では平文の設定を破棄し、遅い応答も無効にする。 */
  function invalidate() {
    clearTimeout(expiry); locked = true; current = undefined; generation++;
    for (const listener of listeners) listener();
  }

  const unsubscribe = authorization.onInvalidate(invalidate);

  /** 本人・端末・保存領域と、期限を含む現在認可を照合する。 */
  function assertAuthorized() {
    requireValue(!disposed && !locked && current, 'AUTHORIZATION_RECHECK_REQUIRED');
    const identity = authorization.identity();
    requireValue(identity.human?.uid === binding.humanUid && identity.deviceUid === binding.deviceUid, 'PRINCIPAL_CHANGED');
    authorizeOnline(current.snapshot, 'manageTemporaryPermissions', current.serverNow + Math.max(0, Math.floor(performance.now() - loadedAt)));
  }

  /** 現在設定と保存済み入力を照合し、自動再送せずに未確定・旧版を分ける。 */
  async function load(): Promise<PermissionView> {
    requireValue(!disposed, 'AUTHORIZATION_DISPOSED');
    clearTimeout(expiry); locked = true;
    const version = ++generation;
    const result = await authorization.roles.listTemporaryPermissions(), actor = result.snapshot;
    requireValue(version === generation && !disposed && actor.environmentId === binding.environmentId &&
      actor.performanceId === binding.performanceId && actor.role.humanUid === binding.humanUid &&
      actor.deviceAuthUid === binding.deviceUid && actor.device.storageEpoch === binding.storageEpoch, 'KEY_BINDING_MISMATCH');
    current = { ...result, pending: [], obsolete: [] }; loadedAt = performance.now(); locked = false;
    try {
      for (const id of await journal.list(assertAuthorized)) {
        const saved = await journal.read(id, assertAuthorized) as { kind?: string; targetUid?: string; input?: PendingPermission['input'] } | null;
        if (saved?.kind !== 'permissionChange') continue;
        requireValue(saved.targetUid && saved.input?.operationId === id, 'FIXED_OPERATION_REQUIRED');
        known.add(id);
        const outcome = await authorization.roles.receipt('permissionChange', id);
        assertAuthorized();
        if (outcome) continue;
        const pending = { targetUid: saved.targetUid, input: saved.input };
        const role = current.targets.find(item => item.role.humanUid === saved.targetUid)?.role;
        (role?.revision === saved.input.expectedRevision ? current.pending : current.obsolete).push(pending);
      }
      assertAuthorized();
      const boundaries = result.targets.flatMap(({ role, profile }) => [role.startsAt, role.endsAt, profile?.validFrom, profile?.validUntil])
        .filter((value): value is number => typeof value === 'number' && value > current!.serverNow);
      const until = Math.min(actor.role.endsAt, actor.session.expiresAt, actor.session.humanAuthTime + RECENT_AUTH_WINDOW + 1, ...boundaries);
      const remaining = until - current.serverNow - Math.max(0, Math.floor(performance.now() - loadedAt));
      requireValue(remaining > 0, 'AUTHORIZATION_EXPIRED');
      expiry = setTimeout(invalidate, remaining);
      return structuredClone(current);
    } catch (cause) { locked = true; current = undefined; throw cause; }
  }

  return {
    load,
    /** 既存鍵を確認し、固定入力の保存が成功してから送信を許す。 */
    async prepare(change) {
      assertAuthorized(); await ensureDeviceKey(binding, false); assertAuthorized();
      await authorization.roles.savePermissionInput(change.targetUid, change.input, journal, assertAuthorized);
      known.add(change.input.operationId);
    },
    /** 同じIDの入力だけを現在の認可・版で再検査して確定する。 */
    async commit(id) {
      assertAuthorized(); requireValue(known.has(id), 'FIXED_OPERATION_REQUIRED');
      return (await authorization.roles.commit(id, journal, assertAuthorized)).status;
    },
    /** 保存済みの未確定案を、既存の結果・監査の一体更新で取り消す。 */
    async cancel(id) {
      assertAuthorized(); requireValue(known.has(id), 'FIXED_OPERATION_REQUIRED');
      return (await authorization.roles.cancel(id, journal, assertAuthorized)).status;
    },
    /** 既知のIDを照会し、結果照会から変更を送信しない。 */
    async receipt(id) {
      requireValue(!disposed && known.has(id), 'FIXED_OPERATION_REQUIRED');
      return (await authorization.roles.receipt('permissionChange', id))?.status ?? null;
    },
    /** 現在の認可が失効したことを画面へ通知する。 */
    onInvalidate: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },

    /** 画面の購読だけを終了し、暗号化された入力と鍵は保持する。 */
    dispose() { disposed = true; locked = true; generation++; clearTimeout(expiry); unsubscribe(); listeners.clear(); current = undefined; },
  };
}
