// 臨時管理者の設定画面と、固定入力の保全・送信窓口の契約を定める。

import type { AuthorizationSnapshot, RoleGrant, TemporaryProfile } from '../domain/authorization/types.ts';
import type { changeTemporaryPermissions } from '../domain/authorization/role-management.ts';

export type PermissionInput = Parameters<typeof changeTemporaryPermissions>[2];
export interface PendingPermission { targetUid: string; input: PermissionInput }
export interface PermissionView {
  snapshot: AuthorizationSnapshot;
  serverNow: number;
  targets: { role: RoleGrant; profile: TemporaryProfile | null }[];
  pending: PendingPermission[];
  obsolete: PendingPermission[];
}
export type PermissionOutcome = 'committed' | 'cancelled';
export interface TemporaryPermissionsUiPort {
  load(): Promise<PermissionView>;
  prepare(change: PendingPermission): Promise<void>;
  commit(id: string): Promise<PermissionOutcome>;
  cancel(id: string): Promise<PermissionOutcome>;
  receipt(id: string): Promise<PermissionOutcome | null>;
  onInvalidate(listener: () => void): () => void;
  dispose(): void;
}
