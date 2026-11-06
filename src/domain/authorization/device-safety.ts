// CONF-066・069の確定前検査。保存層も現在の台帳を使い、同じ条件を再検査する。

import type { AuthorizationSnapshot, DeviceGrant, RoleGrant } from './types.ts';
import { authorizeOnline, validUid } from './policy.ts';
import { checkScope, requireValue, isId, positive } from '../seats/validation.ts';

export interface DeviceInventory {
  roles: RoleGrant[];
  devices: DeviceGrant[];
}

/** 有効な主担当は公演につき1人。複数端末と複数の主担当を混同しない。 */
function owner(inventory: DeviceInventory, snapshot: AuthorizationSnapshot): RoleGrant {
  for (const item of [...inventory.roles, ...inventory.devices]) checkScope(item, snapshot);
  const owners = inventory.roles.filter((role) => role.active && role.role === 'owner');
  const currentOwner = owners[0];
  requireValue(
    owners.length === 1 && currentOwner && validUid(currentOwner.humanUid),
    'UNIQUE_OWNER_REQUIRED',
  );
  return currentOwner;
}

function prepared(device: DeviceGrant, role: RoleGrant, now: number): boolean {
  return (
    device.schemaVersion === 2 &&
    device.active === true &&
    device.approved === true &&
    device.retired === false &&
    role.active === true &&
    role.startsAt <= now &&
    now < role.endsAt &&
    device.preparedRole === role.role &&
    device.preparedRoleRevision === role.revision
  );
}

/** 廃止と自己データ削除の両方で、別の利用可能な管理端末を必要とする。 */
export function requireReplacementDevice(
  actor: AuthorizationSnapshot,
  inventory: DeviceInventory,
  targetDeviceUid: string,
  now: number,
): DeviceGrant {
  authorizeOnline(actor, 'manageDevices', now);
  const currentOwner = owner(inventory, actor);
  const target = inventory.devices.find((device) => device.deviceUid === targetDeviceUid);
  requireValue(target, 'TARGET_DEVICE_MISSING');
  const targetRole = inventory.roles.find((role) => role.humanUid === target.humanUid);
  requireValue(targetRole, 'TARGET_ROLE_MISSING');
  requireValue(
    targetRole.role === 'owner' || targetRole.role === 'deputy',
    'MANAGEMENT_DEVICE_REQUIRED',
  );
  const replacement = inventory.devices.find((device) => {
    if (device.deviceUid === targetDeviceUid) return false;
    const role = inventory.roles.find((item) => item.humanUid === device.humanUid);
    if (!role || !prepared(device, role, now)) return false;
    return targetRole.role === 'owner'
      ? role.role === 'owner' && role.humanUid === currentOwner.humanUid
      : role.role === 'owner' || role.role === 'deputy';
  });
  requireValue(
    replacement,
    targetRole.role === 'owner' ? 'REPLACEMENT_OWNER_DEVICE_REQUIRED' : 'LAST_MANAGEMENT_DEVICE',
  );
  return replacement;
}

/** 代理だけで引継ぎを始めさせない。後任のGoogle本人確認と受諾も必要とする。 */
export function requireOwnerHandover(
  actor: AuthorizationSnapshot,
  inventory: DeviceInventory,
  successorUid: string,
  acceptance: { humanUid: string; provider: string; authenticatedAt: number; accepted: boolean },
  now: number,
): void {
  authorizeOnline(actor, 'handoverOwner', now);
  const currentOwner = owner(inventory, actor);
  requireValue(
    currentOwner.humanUid === actor.role.humanUid && successorUid !== currentOwner.humanUid,
    'CURRENT_OWNER_REQUIRED',
  );
  const successor = inventory.roles.find((role) => role.humanUid === successorUid);
  requireValue(
    successor &&
      successor.role === 'deputy' &&
      successor.active &&
      successor.startsAt <= now &&
      now < successor.endsAt,
    'ACTIVE_DEPUTY_REQUIRED',
  );
  requireValue(
    acceptance.humanUid === successorUid &&
      acceptance.accepted === true &&
      acceptance.provider === 'google.com' &&
      Number.isSafeInteger(acceptance.authenticatedAt) &&
      acceptance.authenticatedAt <= now &&
      now - acceptance.authenticatedAt <= 900000,
    'SUCCESSOR_ACCEPTANCE_REQUIRED',
  );
  requireValue(
    inventory.devices.some(
      (device) => device.humanUid === successorUid && prepared(device, successor, now),
    ),
    'SUCCESSOR_PREPARED_DEVICE_REQUIRED',
  );
}

/** 未受領・隔離・不明結果を残したまま、鍵や暗号文を回収しない。 */
export function requireLocalDataDeletion(input: {
  onlineConfirmed: boolean;
  allReceived: boolean;
  pending: number;
  quarantined: number;
  unknown: number;
  closed: boolean;
  retirementApproved: boolean;
  independentlyConfirmedTwice: boolean;
}): void {
  requireValue(
    input.onlineConfirmed === true &&
      input.allReceived === true &&
      [input.pending, input.quarantined, input.unknown].every((count) => count === 0) &&
      (input.closed === true || input.retirementApproved === true) &&
      input.independentlyConfirmedTwice === true,
    'LOCAL_DATA_MUST_BE_RETAINED',
  );
}

export interface DeviceChangeInput {
  operationId: string;
  targetDeviceUid: string;
  expectedRevision: number;
  kind: 'approve' | 'stop' | 'resume' | 'retire';
  replacementDeviceUid: string;
}

/** 停止は削除と区別する。準備版と鍵の識別子を変更案へ便乗させない。 */
export function createDeviceChangePlan(
  actor: AuthorizationSnapshot,
  inventory: DeviceInventory,
  input: DeviceChangeInput,
  now: number,
) {
  authorizeOnline(actor, 'manageDevices', now);
  requireValue(
    validUid(input.targetDeviceUid) &&
      isId(input.operationId) &&
      ['approve', 'stop', 'resume', 'retire'].includes(input.kind),
    'INVALID_DEVICE_OPERATION',
  );
  for (const item of [...inventory.roles, ...inventory.devices]) checkScope(item, actor);
  const before = inventory.devices.find((device) => device.deviceUid === input.targetDeviceUid);
  requireValue(
    before &&
      before.retired === false &&
      positive(input.expectedRevision) &&
      (before.revision ?? 1) === input.expectedRevision,
    'STALE_OR_RETIRED_DEVICE',
  );
  const targetRole = inventory.roles.find((role) => role.humanUid === before.humanUid);
  requireValue(targetRole, 'TARGET_ROLE_MISSING');
  if (input.kind === 'approve') {
    requireValue(before.approved === false, 'DEVICE_ALREADY_APPROVED');
    // 主担当の追加端末は一回限りの所持確認を要するため、通常の承認へ混ぜない。
    requireValue(targetRole.role !== 'owner', 'OWNER_DEVICE_PAIRING_REQUIRED');
  }
  if (input.kind === 'stop')
    requireValue(before.approved === true && before.active === true, 'DEVICE_NOT_ACTIVE');
  if (input.kind === 'resume')
    requireValue(before.approved === true && before.active === false, 'DEVICE_NOT_STOPPED');
  if (input.kind === 'retire' && ['owner', 'deputy'].includes(targetRole.role)) {
    requireValue(validUid(input.replacementDeviceUid), 'REPLACEMENT_DEVICE_REQUIRED');
    requireReplacementDevice(
      actor,
      {
        ...inventory,
        devices: inventory.devices.filter(
          (device) =>
            device.deviceUid === input.targetDeviceUid ||
            device.deviceUid === input.replacementDeviceUid,
        ),
      },
      input.targetDeviceUid,
      now,
    );
  }
  const device: DeviceGrant = {
    ...before,
    active: input.kind === 'approve' || input.kind === 'resume',
    approved: input.kind === 'approve' ? true : before.approved,
    retired: input.kind === 'retire',
    revision: input.expectedRevision + 1,
    lastOperationId: input.operationId,
  };
  requireValue(positive(device.revision), 'DEVICE_REVISION_OVERFLOW');
  const operation = {
    schemaVersion: 1,
    environmentId: actor.environmentId,
    performanceId: actor.performanceId,
    ...input,
    actorUid: actor.role.humanUid,
    actorDeviceUid: actor.deviceAuthUid,
    resultingRevision: device.revision,
    committedAt: now,
    previousActive: before.active,
    previousApproved: before.approved,
    previousRetired: before.retired,
    nextActive: device.active,
    nextApproved: device.approved,
    nextRetired: device.retired,
  };
  return { device, operation };
}
