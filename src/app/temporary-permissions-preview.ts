// 臨時管理者の設定を架空データで確認する。通信・実登録や業務権限の変更は行わない。

import { createDeviceManagementPreview } from './device-management-preview.ts';
import type { Scope } from '../domain/seats/types.ts';
import type { RoleGrant, TemporaryProfile } from '../domain/authorization/types.ts';
import { TEMPORARY_PERMISSIONS } from '../domain/authorization/types.ts';
import { changeTemporaryPermissions } from '../domain/authorization/role-management.ts';
import { createAuthorizationAudit, cancelAuthorizationChange } from '../domain/authorization/role-management.ts';
import type { TemporaryPermissionsUiPort, PendingPermission, PermissionOutcome } from './temporary-permissions-types.ts';

/** 検証用の管理者と臨時管理者を用意し、共通の業務計算で見本だけを変更する。 */
export function createTemporaryPermissionsPreview(scope: Scope): TemporaryPermissionsUiPort {
  const source = createDeviceManagementPreview(scope);
  const now = Date.now(), endsAt = now + 3 * 3600_000;
  let role: RoleGrant = { ...scope, humanUid: 'preview-temporary-staff', role: 'temporary', active: true, revision: 1, startsAt: now - 1000, endsAt };
  let profile: TemporaryProfile = { schemaVersion: 1, humanUid: role.humanUid, roleVersion: 1, status: 'active',
    validFrom: now - 1000, validUntil: now + 2 * 3600_000, permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map(key => [key, true])) as TemporaryProfile['permissions'] };
  const saved = new Map<string, PendingPermission>(), results = new Map<string, PermissionOutcome>();

  return {
    /** 見本の現在設定と未確定の固定入力を返す。 */
    async load() {
      const current = await source.load();
      const pending = [...saved.values()].filter(item => !results.has(item.input.operationId));
      return structuredClone({ snapshot: current.snapshot, serverNow: Date.now(), targets: [{ role, profile }],
        pending: pending.filter(item => item.input.expectedRevision === role.revision),
        obsolete: pending.filter(item => item.input.expectedRevision !== role.revision) });
    },

    /** 見本の固定入力を、現在の役割条件で検査して保持する。 */
    async prepare(change) {
      const current = await source.load();
      if (change.targetUid !== role.humanUid) throw Error('TARGET_ROLE_MISSING');
      changeTemporaryPermissions(current.snapshot, role, change.input, Date.now());
      saved.set(change.input.operationId, structuredClone(change));
    },

    /** 共通計算と監査形式を使い、見本の役割版・設定を一度だけ更新する。 */
    async commit(id) {
      const prior = results.get(id); if (prior) return prior;
      const change = saved.get(id); if (!change) throw Error('FIXED_OPERATION_REQUIRED');
      const current = await source.load();
      const plan = changeTemporaryPermissions(current.snapshot, role, change.input, Date.now());
      createAuthorizationAudit(plan, role, profile);
      role = plan.role; profile = plan.profile!; results.set(id, 'committed');
      return 'committed';
    },

    /** 未確定の見本入力だけを取り消し、現在設定を変更しない。 */
    async cancel(id) {
      const prior = results.get(id); if (prior) return prior;
      const change = saved.get(id); if (!change) throw Error('FIXED_OPERATION_REQUIRED');
      const current = await source.load();
      cancelAuthorizationChange(current.snapshot, role, id, change.input.expectedRevision, 'permissionChange', profile, Date.now());
      results.set(id, 'cancelled'); return 'cancelled';
    },

    /** 見本の既知結果だけを返し、照会では送信しない。 */
    receipt: async id => results.get(id) ?? null,

    /** 見本の認可が失効した通知を画面へ渡す。 */
    onInvalidate: listener => source.onInvalidate(listener),

    /** 見本のメモリーだけを片付け、製品の保存領域を変更しない。 */
    dispose: () => { source.dispose(); saved.clear(); results.clear(); },
  };
}
