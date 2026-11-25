// 端末管理の表示を架空データで確認する。外部通信・実際の登録や業務認可は行わない。

import type { Scope } from '../domain/seats/types.ts';
import type { AuthorizationSnapshot, DeviceGrant, RoleGrant } from '../domain/authorization/types.ts';
import { authorizeOnline } from '../domain/authorization/policy.ts';
import { createDeviceChangePlan } from '../domain/authorization/device-safety.ts';
import type { DeviceChangeInput } from '../domain/authorization/device-safety.ts';
import type { DeviceManagementUiPort } from './device-management-types.ts';

/** 一つの架空公演で承認待ち・有効な端末と、管理端末の保護を再現する。 */
export function createDeviceManagementPreview(scope: Scope): DeviceManagementUiPort {
  const now = Date.now(), expires = now + 4 * 3600_000;
  const roles: RoleGrant[] = [['preview-owner', 'owner'], ['preview-deputy', 'deputy'], ['preview-staff', 'receptionist']].map(([uid, role]) =>
    ({ ...scope, humanUid: uid!, role: role as RoleGrant['role'], active: true, revision: 1, startsAt: now - 1000, endsAt: expires }));
  const devices: DeviceGrant[] = [
    ['preview-current', 'preview-owner', 'owner', true], ['preview-deputy-device', 'preview-deputy', 'deputy', true],
    ['preview-pending', 'preview-staff', 'receptionist', false], ['preview-reception', 'preview-staff', 'receptionist', true],
  ].map(([uid, human, role, approved]) => ({ ...scope, schemaVersion: 2, deviceUid: uid as string,
    humanUid: human as string, storageEpoch: crypto.randomUUID(), active: approved as boolean, approved: approved as boolean,
    retired: false, preparedRole: approved ? role as DeviceGrant['preparedRole'] : null, preparedRoleRevision: approved ? 1 : 0, revision: 1 }));
  const actor: AuthorizationSnapshot = { ...scope, deviceAuthUid: devices[0]!.deviceUid, role: roles[0]!, device: devices[0]!,
    state: 'preparing', staffDeadline: expires,
    session: { ...scope, schemaVersion: 2, deviceUid: devices[0]!.deviceUid, humanUid: roles[0]!.humanUid,
      active: true, emailVerified: true, authProvider: 'google.com', roleRevision: 1, revision: 1,
      issuedAt: now, expiresAt: expires, humanAuthTime: now } };
  const saved = new Map<string, DeviceChangeInput>(), results = new Set<string>(), listeners = new Set<() => void>();

  return {
    /** 見本の現在台帳を返し、実際の準備完了や利用権限として保存しない。 */
    async load() {
      actor.device = devices.find(item => item.deviceUid === actor.deviceAuthUid)!;
      authorizeOnline(actor, 'manageDevices', Date.now());
      const inputs = [...saved.values()].filter(item => !results.has(item.operationId));
      const obsolete = inputs.filter(item => devices.find(device => device.deviceUid === item.targetDeviceUid)?.revision !== item.expectedRevision);
      return structuredClone({ snapshot: actor, serverNow: Date.now(), inventory: { roles, devices },
        pending: inputs.filter(item => !obsolete.includes(item)), obsolete });
    },

    /** 共通の業務判定を使い、見本の固定入力だけをメモリーへ保持する。 */
    async prepare(input) { createDeviceChangePlan(actor, { roles, devices }, input, Date.now()); saved.set(input.operationId, structuredClone(input)); },

    /** 見本の台帳だけを更新する。自端末の停止・廃止では画面へ失効を通知する。 */
    async commit(id) {
      if (results.has(id)) return;
      const input = saved.get(id);
      if (!input) throw Error('FIXED_OPERATION_REQUIRED');
      const plan = createDeviceChangePlan(actor, { roles, devices }, input, Date.now());
      devices.splice(devices.findIndex(item => item.deviceUid === input.targetDeviceUid), 1, plan.device);
      results.add(id);
      if (input.targetDeviceUid === actor.deviceAuthUid && !plan.device.active) for (const listener of listeners) listener();
    },

    receipt: async (id) => results.has(id),
    onInvalidate: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { listeners.clear(); saved.clear(); results.clear(); },
  };
}
