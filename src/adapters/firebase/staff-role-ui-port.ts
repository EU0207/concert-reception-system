// 現在認可と暗号化された固定入力を、公演限定スタッフの役割変更画面へ接続する。

import type { createAuthorizationPort } from './authorization-port.ts';
import type { DeviceKeyScope } from '../../storage/device-vault.ts';
import { ensureDeviceKey } from '../../storage/device-vault.ts';
import { createAuthorizationOperationJournal } from '../../storage/authorization-operations.ts';
import { authorizeOnline, RECENT_AUTH_WINDOW } from '../../domain/authorization/policy.ts';
import { requireValue } from '../../domain/seats/validation.ts';
import { createRoleChangeRequest, validateTemporaryPermissions } from '../../domain/authorization/role-management.ts';
import type { RoleChangeRequest } from '../../domain/authorization/role-management.ts';
import type { StaffRoleUiPort, StaffRoleView, PendingStaffRole } from '../../app/staff-role-types.ts';

/** 準備済み端末の鍵を使い、設定の一回確定・取消しと再起動後の回収を提供する。 */
export function createStaffRoleUiPort(
  authorization: Awaited<ReturnType<typeof createAuthorizationPort>>, binding: DeviceKeyScope,
): StaffRoleUiPort {
  const journal = createAuthorizationOperationJournal(binding), known = new Set<string>();
  const listeners = new Set<() => void>();
  let current: StaffRoleView | undefined, locked = true, disposed = false, generation = 0, loadedAt = 0;
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
    authorizeOnline(current.snapshot, 'manageRoles', current.serverNow + Math.max(0, Math.floor(performance.now() - loadedAt)));
  }

  /** 現在設定と保存済み入力を照合し、自動再送せずに未確定・旧版を分ける。 */
  async function load(): Promise<StaffRoleView> {
    requireValue(!disposed, 'AUTHORIZATION_DISPOSED');
    clearTimeout(expiry); locked = true;
    const version = ++generation;
    const result = await authorization.roles.listStaffRoles(), actor = result.snapshot;
    requireValue(version === generation && !disposed && actor.environmentId === binding.environmentId &&
      actor.performanceId === binding.performanceId && actor.role.humanUid === binding.humanUid &&
      actor.deviceAuthUid === binding.deviceUid && actor.device.storageEpoch === binding.storageEpoch, 'KEY_BINDING_MISMATCH');
    current = { ...result, pending: [], obsolete: [] }; loadedAt = performance.now(); locked = false;
    try {
      for (const id of await journal.list(assertAuthorized)) {
        const saved = await journal.read(id, assertAuthorized) as { kind?: string; request?: RoleChangeRequest; initialPermissions?: PendingStaffRole['input']['initialPermissions'] } | null;
        if (saved?.kind !== 'roleChange') continue;
        const request = saved.request;
        requireValue(request?.operationId === id, 'FIXED_OPERATION_REQUIRED');
        // Google本人確認が必要な代理への変更は、この画面から再送しない。
        if (!['temporary', 'receptionist'].includes(request.nextRole) || !['temporary', 'receptionist'].includes(request.previousRole)) continue;
        known.add(id);
        const outcome = await authorization.roles.receipt('roleChange', id);
        assertAuthorized();
        if (outcome) continue;
        const pending = { targetUid: request.targetUid, input: { operationId: id, expectedRevision: request.expectedRevision,
          nextRole: request.nextRole, startsAt: request.startsAt, endsAt: request.endsAt, initialPermissions: saved.initialPermissions } };
        const role = current.targets.find(item => item.role.humanUid === request.targetUid)?.role;
        (role?.revision === request.expectedRevision && (request.nextRole !== 'temporary' || saved.initialPermissions) ? current.pending : current.obsolete).push(pending);
      }
      assertAuthorized();
      // 対象者の任期終了は表示で反映し、操作者自身の認可失効とは分ける。
      const until = Math.min(actor.role.endsAt, actor.session.expiresAt, actor.session.humanAuthTime + RECENT_AUTH_WINDOW + 1);
      const remaining = until - current.serverNow - Math.max(0, Math.floor(performance.now() - loadedAt));
      requireValue(remaining > 0, 'AUTHORIZATION_EXPIRED');
      expiry = setTimeout(invalidate, remaining);
      return structuredClone({ ...current, serverNow: current.serverNow + Math.max(0, Math.floor(performance.now() - loadedAt)) });
    } catch (cause) { locked = true; current = undefined; throw cause; }
  }

  return {
    load,

    /** 既存鍵を確認し、固定入力の保存が成功してから送信を許す。 */
    async prepare(change) {
      assertAuthorized(); await ensureDeviceKey(binding, false); assertAuthorized();
      const role = current!.targets.find(item => item.role.humanUid === change.targetUid)?.role;
      requireValue(role && ['temporary', 'receptionist'].includes(role.role) && ['temporary', 'receptionist'].includes(change.input.nextRole), 'ROLE_CHANGE_FORBIDDEN');
      if (change.input.nextRole === 'temporary') validateTemporaryPermissions(change.input.initialPermissions!);
      createRoleChangeRequest(current!.snapshot, role, change.input, current!.serverNow + Math.max(0, Math.floor(performance.now() - loadedAt)));
      await authorization.roles.saveRoleInput(change.targetUid, change.input, journal, assertAuthorized);
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
      return (await authorization.roles.receipt('roleChange', id))?.status ?? null;
    },

    /** 現在の認可が失効したことを画面へ通知する。 */
    onInvalidate: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },

    /** 画面の購読だけを終了し、暗号化された入力と鍵は保持する。 */
    dispose() { disposed = true; locked = true; generation++; clearTimeout(expiry); unsubscribe(); listeners.clear(); current = undefined; },
  };
}
