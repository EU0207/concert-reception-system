// 本人・端末認可の公開窓口。Firebase SDKに依存しない判定を公開する。

// # 公開する型と関数

export type * from './types.ts';

export { COMMON_OPERATIONS, MANAGEMENT_OPERATIONS, TEMPORARY_PERMISSIONS } from './types.ts';
export {
  authorizeOnline,
  authorizeOffline,
  createPersonSession,
  validateAuthorization,
  validateTemporaryProfile,
  providerFor,
  requireRecentAuthentication,
  validUid,
  RECENT_AUTH_WINDOW,
  SESSION_LIFETIME,
} from './policy.ts';
export { offlineDeadline } from './deadline.ts';
export type { RoleChangeRequest, GoogleAcceptance, RoleManagementPlan } from './role-management.ts';
export {
  createRoleChangeRequest,
  createGoogleAcceptance,
  commitRoleChange,
  changeTemporaryPermissions,
  createAuthorizationAudit,
} from './role-management.ts';
export {
  requireReplacementDevice,
  requireOwnerHandover,
  requireLocalDataDeletion,
  createDeviceChangePlan,
} from './device-safety.ts';
export type { DeviceInventory } from './device-safety.ts';
