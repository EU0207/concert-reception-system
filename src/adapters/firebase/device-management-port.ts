// 既存端末の承認・停止・停止解除と廃止を保存し、同じ操作IDの結果を照会する。

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
import { authorizeOnline } from '../../domain/authorization/policy.ts';

interface Context {
  root: string;
  deviceDatabase: Database;
  verify(): Promise<HumanIdentity>;
  fetchCurrent(): Promise<{ snapshot: AuthorizationSnapshot; serverNow: number }>;
}

type Result = ReturnType<typeof createDeviceChangePlan>['operation'];

/** 端末の承認・停止・停止解除と廃止を保存する窓口を作る。 */
export function createDeviceManagementPort(context: Context) {
  /** 公演内の指定パスから、端末Authで現在値を読む。 */
  const read = async (path: string) =>
    (await get(ref(context.deviceDatabase, `${context.root}/${path}`))).val();

  /** 現在の役割と端末台帳を取得する。 */
  async function inventory() {
    const [roles, devices] = (await Promise.all([read('roles'), read('devices')])) as [
      Record<string, RoleGrant>,
      Record<string, DeviceGrant>,
    ];

    requireValue(roles && devices, 'DEVICE_INVENTORY_REQUIRED');

    return { roles: Object.values(roles), devices: Object.values(devices) };
  }

  /** 同じ操作IDで確定済みの端末変更結果を取得する。 */
  async function receipt(id: string): Promise<Result | null> {
    requireValue(isId(id), 'INVALID_OPERATION_ID');
    await context.verify();

    return read(`deviceAuthorizationOperations/${id}`);
  }

  /** 現在認可を確認し、端末変更の固定入力を暗号化保存する。 */
  async function prepare(
    input: DeviceChangeInput,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<void> {
    const { snapshot, serverNow } = await context.fetchCurrent();

    createDeviceChangePlan(snapshot, await inventory(), input, serverNow);
    await journal.save(input.operationId, { kind: 'deviceChange', input }, assertAuthorized);
  }

  /** 固定入力を再確認し、端末状態と変更結果を一体保存する。 */
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

    // 自端末の廃止は通常認可を失効する。業務へ戻さず確定結果だけを返す。
    return stored;
  }

  /** 現在認可を検査し、管理者にだけ対象公演の台帳を返す。 */
  async function list() {
    const current = await context.fetchCurrent();
    authorizeOnline(current.snapshot, 'manageDevices', current.serverNow);
    const devices = await inventory();
    return { ...current, inventory: devices };
  }

  return { prepare, commit, receipt, list };
}
