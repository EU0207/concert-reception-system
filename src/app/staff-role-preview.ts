// 架空の一般受付・臨時管理者で任命と解除を確認する。実認証・実権限は変更しない。

import { createDeviceManagementPreview } from './device-management-preview.ts';
import type { Scope } from '../domain/seats/types.ts';
import type { RoleGrant, TemporaryProfile, TemporaryPermission } from '../domain/authorization/types.ts';
import { createRoleChangeRequest, commitRoleChange, createAuthorizationAudit, cancelAuthorizationChange, validateTemporaryPermissions } from '../domain/authorization/role-management.ts';
import type { RoleChangeRequest } from '../domain/authorization/role-management.ts';
import type { StaffRoleUiPort, StaffRoleOutcome } from './staff-role-types.ts';

/** 共通の役割計算を使い、見本の状態だけを一回ずつ変更する。 */
export function createStaffRolePreview(scope: Scope): StaffRoleUiPort {
  const source = createDeviceManagementPreview(scope), now = Date.now();
  let role: RoleGrant = { ...scope, humanUid: 'preview-reception-staff', role: 'receptionist', active: true, revision: 1, startsAt: now - 1000, endsAt: now + 3 * 3600_000 };
  let profile: TemporaryProfile | null = null;
  const saved = new Map<string, { request: RoleChangeRequest; initialPermissions?: Record<TemporaryPermission, boolean> | undefined }>(), results = new Map<string, StaffRoleOutcome>();

  return {
    /** 未確定案は再送せず、現在版と照合して返す。 */
    async load() {
      const current = await source.load();
      const changes = [...saved.values()].filter(item => !results.has(item.request.operationId)).map(({ request, initialPermissions }) => ({ targetUid: request.targetUid,
        input: { operationId: request.operationId, expectedRevision: request.expectedRevision, nextRole: request.nextRole, startsAt: request.startsAt, endsAt: request.endsAt, initialPermissions } }));
      return structuredClone({ snapshot: current.snapshot, serverNow: Date.now(), targets: [{ role, profile }],
        pending: changes.filter(item => item.input.expectedRevision === role.revision), obsolete: changes.filter(item => item.input.expectedRevision !== role.revision) });
    },

    /** 現在役割で検査した案を、見本のメモリーへ固定する。 */
    async prepare(change) {
      if (change.targetUid !== role.humanUid) throw Error('TARGET_ROLE_MISSING');
      const current = await source.load();
      const request = createRoleChangeRequest(current.snapshot, role, change.input, Date.now());
      if (saved.has(request.operationId)) throw Error('FIXED_OPERATION_REQUIRED');
      const initialPermissions = request.nextRole === 'temporary' ? validateTemporaryPermissions(change.input.initialPermissions!) : undefined;
      saved.set(request.operationId, { request, initialPermissions });
    },

    /** 役割・初期設定と監査の計算結果を、同じIDで一度だけ反映する。 */
    async commit(id) {
      const prior = results.get(id); if (prior) return prior;
      const change = saved.get(id); if (!change) throw Error('FIXED_OPERATION_REQUIRED');
      const current = await source.load(), plan = commitRoleChange(current.snapshot, role, change.request, null, Date.now(), change.initialPermissions);
      createAuthorizationAudit(plan, role, profile);
      role = plan.role; profile = plan.profile; results.set(id, 'committed'); return 'committed';
    },

    /** 未確定案の取消しでは現在の役割・設定を変更しない。 */
    async cancel(id) {
      const prior = results.get(id); if (prior) return prior;
      const request = saved.get(id)?.request; if (!request) throw Error('FIXED_OPERATION_REQUIRED');
      const current = await source.load();
      cancelAuthorizationChange(current.snapshot, role, id, request.expectedRevision, 'roleChange', profile, Date.now());
      results.set(id, 'cancelled'); return 'cancelled';
    },

    /** 見本の既知結果だけを照会する。 */
    receipt: async id => results.get(id) ?? null,

    /** 見本の認可失効を通知する。 */
    onInvalidate: listener => source.onInvalidate(listener),

    /** 見本と購読を片付け、製品の保存領域を変更しない。 */
    dispose: () => { source.dispose(); saved.clear(); results.clear(); },
  };
}
