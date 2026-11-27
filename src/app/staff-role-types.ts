// 一般受付と臨時管理者の任命・解除画面と、保存・送信窓口の契約を定める。

import type { AuthorizationSnapshot, RoleGrant, TemporaryProfile, TemporaryPermission } from '../domain/authorization/types.ts';
import type { createRoleChangeRequest } from '../domain/authorization/role-management.ts';

export type StaffRoleInput = Parameters<typeof createRoleChangeRequest>[2] & { initialPermissions?: Record<TemporaryPermission, boolean> | undefined };
export interface PendingStaffRole { targetUid: string; input: StaffRoleInput }
export interface StaffRoleView {
  snapshot: AuthorizationSnapshot;
  serverNow: number;
  targets: { role: RoleGrant; profile: TemporaryProfile | null }[];
  pending: PendingStaffRole[];
  obsolete: PendingStaffRole[];
}
export type StaffRoleOutcome = 'committed' | 'cancelled';
export interface StaffRoleUiPort {
  load(): Promise<StaffRoleView>;
  prepare(change: PendingStaffRole): Promise<void>;
  commit(id: string): Promise<StaffRoleOutcome>;
  cancel(id: string): Promise<StaffRoleOutcome>;
  receipt(id: string): Promise<StaffRoleOutcome | null>;
  onInvalidate(listener: () => void): () => void;
  dispose(): void;
}
