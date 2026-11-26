// 端末管理画面と保存窓口の契約。認可・台帳と未完了の固定入力を扱う。

import type { AuthorizationSnapshot } from '../domain/authorization/types.ts';
import type { DeviceInventory, DeviceChangeInput } from '../domain/authorization/device-safety.ts';

export interface DeviceManagementView {
  snapshot: AuthorizationSnapshot;
  serverNow: number;
  inventory: DeviceInventory;
  pending: DeviceChangeInput[];
  obsolete: DeviceChangeInput[];
}

export interface DeviceManagementUiPort {
  load(): Promise<DeviceManagementView>;
  prepare(input: DeviceChangeInput): Promise<void>;
  commit(operationId: string): Promise<void>;
  receipt(operationId: string): Promise<boolean>;
  onInvalidate(listener: () => void): () => void;
  dispose(): void;
}
