// 端末の承認変更へ鍵の置換や準備完了を便乗させないよう、既存の登録台帳だけを更新する。
import { get, ref, update, serverTimestamp } from 'firebase/database';
import type { Database } from 'firebase/database';
import type {
  AuthorizationSnapshot,
  HumanIdentity,
  RoleGrant,
  DeviceGrant,
} from '../../domain/authorization/types.ts';
import { createDeviceChangePlan } from '../../domain/authorization/device-safety.ts';
import type { DeviceChangeInput } from '../../domain/authorization/device-safety.ts';
import type { AuthorizationOperationJournal } from '../../storage/authorization-operations.ts';
import { isId, requireValue } from '../../domain/seats/validation.ts';

interface Context {
  root: string;
  deviceDatabase: Database;
  verify(): Promise<HumanIdentity>;
  fetchCurrent(): Promise<{ snapshot: AuthorizationSnapshot; serverNow: number }>;
}
type Result = ReturnType<typeof createDeviceChangePlan>['operation'];

export function createDeviceManagementPort(context: Context) {
  const read = async (path: string) =>
    (await get(ref(context.deviceDatabase, `${context.root}/${path}`))).val();
  async function inventory() {
    const [roles, devices] = (await Promise.all([read('roles'), read('devices')])) as [
      Record<string, RoleGrant>,
      Record<string, DeviceGrant>,
    ];
    requireValue(roles && devices, 'DEVICE_INVENTORY_REQUIRED');
    return { roles: Object.values(roles), devices: Object.values(devices) };
  }
  async function receipt(id: string): Promise<Result | null> {
    requireValue(isId(id), 'INVALID_OPERATION_ID');
    await context.verify();
    return read(`deviceAuthorizationOperations/${id}`);
  }
  async function prepare(
    input: DeviceChangeInput,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<void> {
    const { snapshot, serverNow } = await context.fetchCurrent();
    createDeviceChangePlan(snapshot, await inventory(), input, serverNow);
    await journal.save(input.operationId, { kind: 'deviceChange', input }, assertAuthorized);
  }
  async function commit(
    id: string,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<Result> {
    const saved = (await journal.read(id, assertAuthorized)) as {
      kind: string;
      input: DeviceChangeInput;
    } | null;
    requireValue(
      saved?.kind === 'deviceChange' && saved.input.operationId === id,
      'FIXED_OPERATION_REQUIRED',
    );
    const prior = await receipt(id);
    if (prior) return prior;
    const { snapshot, serverNow } = await context.fetchCurrent();
    const plan = createDeviceChangePlan(snapshot, await inventory(), saved.input, serverNow);
    assertAuthorized();
    await update(ref(context.deviceDatabase, context.root), {
      [`devices/${saved.input.targetDeviceUid}`]: plan.device,
      [`deviceAuthorizationOperations/${id}`]: {
        ...plan.operation,
        committedAt: serverTimestamp(),
      },
    });
    const stored = await receipt(id);
    requireValue(
      stored &&
        stored.operationId === id &&
        stored.kind === saved.input.kind &&
        stored.targetDeviceUid === saved.input.targetDeviceUid &&
        stored.resultingRevision === plan.device.revision,
      'OPERATION_RESULT_MISMATCH',
    );
    // 自端末の停止・廃止は通常認可を失効する。業務へ戻さず確定結果だけを返す。
    return stored;
  }
  return { prepare, commit, receipt };
}
