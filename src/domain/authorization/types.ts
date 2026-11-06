// 本人・端末・役割の認可契約。トークン本体やパスワードは保持しない。

import type { Scope } from '../seats/types.ts';

export type StaffRole = 'owner' | 'deputy' | 'temporary' | 'receptionist';
export type HumanProvider = 'google.com' | 'password';
export type PerformanceState = 'preparing' | 'operating' | 'stopped' | 'ended' | 'closed';

/** オンラインはSDK、オフラインは検証済みの準備結果から本人の確認値を得る。 */
export interface HumanIdentity {
  uid: string;
  emailVerified: boolean;
  provider: HumanProvider;
  authenticatedAt: number;
}

/** サーバーが保持する現在の役割。revisionが設計上の役割版に相当する。 */
export interface RoleGrant extends Scope {
  humanUid: string;
  role: StaffRole;
  active: boolean;
  revision: number;
  startsAt: number;
  endsAt: number;
  /** 変更結果と監査を一体確定した操作。初期割当では未設定。 */
  lastOperationId?: string;
}

/** 準備済みの役割は、検証済みの端末準備結果から確定する。 */
export interface DeviceGrant extends Scope {
  schemaVersion: 2;
  deviceUid: string;
  humanUid: string;
  active: boolean;
  approved: boolean;
  retired: boolean;
  storageEpoch: string;
  preparedRole: StaffRole | null;
  preparedRoleRevision: number;
  revision?: number;
  lastOperationId?: string;
}

/** 本人Authだけが発行・失効する、端末別の期限付き証跡。 */
export interface PersonSession extends Scope {
  schemaVersion: 2;
  deviceUid: string;
  humanUid: string;
  active: boolean;
  emailVerified: boolean;
  authProvider: HumanProvider;
  roleRevision: number;
  revision: number;
  issuedAt: number;
  expiresAt: number;
  humanAuthTime: number;
}

/** DD-98で固定された9項目。未知のキーは許可項目に加えない。 */
export const TEMPORARY_PERMISSIONS = [
  'exceptionManage',
  'manualReception',
  'arrivalCorrection',
  'seatDisplayNameEdit',
  'receptionConflictResolve',
  'rereadManagementMemo',
  'dayManagementRead',
  'staffNoticeManage',
  'dayAuditRead',
] as const;
export type TemporaryPermission = (typeof TEMPORARY_PERMISSIONS)[number];

export interface TemporaryProfile {
  schemaVersion: 1;
  humanUid: string;
  roleVersion: number;
  status: 'active' | 'revoked';
  validFrom: number;
  validUntil: number;
  permissions: Record<TemporaryPermission, boolean>;
}

export const COMMON_OPERATIONS = [
  'qrReception',
  'receptionRead',
  'ownResultRead',
  'exceptionRead',
  'exceptionPropose',
  'exceptionStatusUpdate',
  'ownRereadMemo',
  'staffNoticeRead',
  'ownNoticeAcknowledge',
] as const;

export const MANAGEMENT_OPERATIONS = [
  'editSeatLayout',
  'editAssignments',
  'manageCustomers',
  'manageTickets',
  'exportManagement',
  'manageCustomFields',
  'controlReception',
  'closePerformance',
  'manageRoles',
  'manageTemporaryPermissions',
  'manageDevices',
  'backupRestore',
  'authAuditRead',
  'quarantineDecide',
  'correctClosedActuals',
  'handoverOwner',
] as const;

export type AuthorizedOperation =
  | (typeof COMMON_OPERATIONS)[number]
  | TemporaryPermission
  | (typeof MANAGEMENT_OPERATIONS)[number];

/** 要求本文の自己申告ではなく、保存層が現在値を取得して組み立てる。 */
export interface AuthorizationSnapshot extends Scope {
  deviceAuthUid: string;
  role: RoleGrant;
  device: DeviceGrant;
  session: PersonSession;
  state: PerformanceState;
  staffDeadline: number;
  temporaryProfile?: TemporaryProfile;
}

/** オフライン準備が完了した端末だけに保存する許可。 */
export interface OfflinePermission extends Scope {
  deviceUid: string;
  humanUid: string;
  storageEpoch: string;
  roleRevision: number;
  issuedAt: number;
  expiresAt: number;
  appVersion: string;
  dataRevision: number;
}
