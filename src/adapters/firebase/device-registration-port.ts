// 本人の確認前に承認端末を作らないよう、匿名の仮登録と本人Authの結合を分ける。
import { get, ref, set, update, serverTimestamp } from 'firebase/database';
import type { Database } from 'firebase/database';
import type { Scope } from '../../domain/seats/types.ts';
import type { DeviceGrant, HumanIdentity, RoleGrant } from '../../domain/authorization/types.ts';
import {
  createDeviceRegistrationRequest,
  bindRegisteredHuman,
} from '../../domain/authorization/device-registration.ts';
import type {
  DeviceRegistrationRequest,
  DeviceRegistrationProof,
} from '../../domain/authorization/device-registration.ts';
import { requireValue } from '../../domain/seats/validation.ts';

interface Context {
  root: string;
  scope: Scope;
  deviceUid: string;
  humanDatabase: Database;
  deviceDatabase: Database;
  verify(): Promise<HumanIdentity>;
  serverNow(): Promise<number>;
}

export function createDeviceRegistrationPort(context: Context) {
  const read = async (database: Database, path: string) =>
    (await get(ref(database, `${context.root}/${path}`))).val();
  async function request(): Promise<DeviceRegistrationRequest> {
    const human = await context.verify();
    const [device, previous] = (await Promise.all([
      read(context.deviceDatabase, `devices/${context.deviceUid}`),
      read(context.deviceDatabase, `deviceRegistrationRequests/${context.deviceUid}`),
    ])) as [DeviceGrant | null, DeviceRegistrationRequest | null];
    requireValue(
      !device || (device.active === false && device.approved === false && device.retired === false),
      'DEVICE_ALREADY_REGISTERED',
    );
    // 既存行の欠落を新規登録へ読み替えると、保存済みの鍵や記録の主体を失うため止める。
    requireValue(!device || previous, 'REGISTERED_REQUEST_MISSING');
    const now = await context.serverNow();
    const next = createDeviceRegistrationRequest(
      context.scope,
      context.deviceUid,
      human.uid,
      previous?.storageEpoch ?? crypto.randomUUID(),
      now,
      previous,
    );
    await set(
      ref(
        context.deviceDatabase,
        `${context.root}/deviceRegistrationRequests/${context.deviceUid}`,
      ),
      // 時刻推定の誤差で上限を超えないよう、要求の期限は上限より1秒短くする。
      { ...next, expiresAt: next.expiresAt - 1000, requestedAt: serverTimestamp() },
    );
    const stored = (await read(
      context.deviceDatabase,
      `deviceRegistrationRequests/${context.deviceUid}`,
    )) as DeviceRegistrationRequest;
    requireValue(
      stored &&
        stored.revision === next.revision &&
        stored.storageEpoch === next.storageEpoch &&
        stored.humanUid === human.uid,
      'REGISTRATION_RESULT_MISMATCH',
    );
    return stored;
  }
  async function bindHuman(): Promise<DeviceRegistrationProof> {
    const human = await context.verify();
    const [request, role, previous, device] = (await Promise.all([
      read(context.humanDatabase, `deviceRegistrationRequests/${context.deviceUid}`),
      read(context.humanDatabase, `roles/${human.uid}`),
      read(context.deviceDatabase, `deviceRegistrationProofs/${context.deviceUid}`),
      read(context.deviceDatabase, `devices/${context.deviceUid}`),
    ])) as [
      DeviceRegistrationRequest | null,
      RoleGrant | null,
      DeviceRegistrationProof | null,
      DeviceGrant | null,
    ];
    requireValue(request && role, 'REGISTRATION_OR_ROLE_MISSING');
    const now = Math.max(await context.serverNow(), request.requestedAt);
    const next = bindRegisteredHuman(request, human, role, now, previous);
    const changes: Record<string, unknown> = {
      [`deviceRegistrationProofs/${context.deviceUid}`]: {
        ...next.proof,
        issuedAt: serverTimestamp(),
      },
    };
    if (!device) changes[`devices/${context.deviceUid}`] = next.device;
    else
      requireValue(
        device.active === false &&
          device.approved === false &&
          device.retired === false &&
          device.storageEpoch === request.storageEpoch &&
          device.humanUid === human.uid,
        'DEVICE_ALREADY_REGISTERED',
      );
    await update(ref(context.humanDatabase, context.root), changes);
    const stored = (await read(
      context.humanDatabase,
      `deviceRegistrationProofs/${context.deviceUid}`,
    )) as DeviceRegistrationProof;
    requireValue(
      stored &&
        stored.revision === next.proof.revision &&
        stored.humanUid === human.uid &&
        stored.storageEpoch === request.storageEpoch &&
        stored.roleRevision === role.revision,
      'REGISTRATION_RESULT_MISMATCH',
    );
    return stored;
  }
  return { request, bindHuman };
}
