// 画面と保存処理の共通判定。最終的なオンライン許可はRTDB Rulesも検査する。

import {
  checkScope,
  isId,
  nonnegative,
  positive,
  requireValue,
} from "../seats/validation.ts";
import {
  COMMON_OPERATIONS,
  MANAGEMENT_OPERATIONS,
  TEMPORARY_PERMISSIONS,
} from "./types.ts";
import type {
  AuthorizationSnapshot,
  AuthorizedOperation,
  HumanIdentity,
  HumanProvider,
  OfflinePermission,
  PersonSession,
  StaffRole,
  TemporaryProfile,
} from "./types.ts";

export const RECENT_AUTH_WINDOW = 15 * 60 * 1000;
export const SESSION_LIFETIME = 12 * 60 * 60 * 1000;
const roles: StaffRole[] = ["owner", "deputy", "temporary", "receptionist"];
const states = ["preparing", "operating", "stopped", "ended", "closed"];

/** RTDBの子キーとして使用できる、空でない本人・端末UIDか調べる。 */
export function validUid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[.#$\[\]/\u0000-\u001f\u007f]/u.test(value)
  );
}

export function providerFor(role: StaffRole): HumanProvider {
  return role === "owner" || role === "deputy" ? "google.com" : "password";
}

export function requireRecentAuthentication(
  authenticatedAt: number,
  now: number,
): void {
  requireValue(
    nonnegative(now) &&
      nonnegative(authenticatedAt) &&
      authenticatedAt <= now &&
      now - authenticatedAt <= RECENT_AUTH_WINDOW,
    "RECENT_AUTH_REQUIRED",
  );
}

/** 現在の本人・端末・セッションの所属と期限を、操作の種類に先立って検査する。 */
export function validateAuthorization(
  snapshot: AuthorizationSnapshot,
  now: number,
  mode: "online" | "offline" = "online",
): void {
  requireValue(
    isId(snapshot.environmentId) &&
      isId(snapshot.performanceId) &&
      nonnegative(now) &&
      nonnegative(snapshot.staffDeadline),
    "INVALID_AUTHORIZATION_SCOPE",
  );
  const { role, device, session } = snapshot;
  for (const item of [role, device, session]) checkScope(item, snapshot);
  requireValue(
    validUid(snapshot.deviceAuthUid) &&
      validUid(role.humanUid) &&
      snapshot.deviceAuthUid !== role.humanUid,
    "INVALID_PRINCIPAL_BINDING",
  );
  requireValue(
    device.schemaVersion === 2 &&
      session.schemaVersion === 2 &&
      device.deviceUid === snapshot.deviceAuthUid &&
      session.deviceUid === snapshot.deviceAuthUid &&
      device.humanUid === role.humanUid &&
      session.humanUid === role.humanUid,
    "PRINCIPAL_MISMATCH",
  );
  requireValue(
    roles.includes(role.role) &&
      role.active === true &&
      positive(role.revision) &&
      nonnegative(role.startsAt) &&
      positive(role.endsAt) &&
      role.startsAt <= now &&
      now < role.endsAt,
    "ROLE_EXPIRED_OR_INACTIVE",
  );
  requireValue(
    device.active === true &&
      device.approved === true &&
      device.retired === false &&
      isId(device.storageEpoch),
    "DEVICE_UNAVAILABLE",
  );
  requireValue(
    session.active === true &&
      session.emailVerified === true &&
      positive(session.revision) &&
      positive(session.roleRevision) &&
      nonnegative(session.issuedAt) &&
      session.issuedAt <= now &&
      positive(session.expiresAt) &&
      session.issuedAt < session.expiresAt &&
      (mode === "offline" || now < session.expiresAt) &&
      session.expiresAt <= session.issuedAt + SESSION_LIFETIME &&
      nonnegative(session.humanAuthTime) &&
      session.humanAuthTime <= session.issuedAt,
    "SESSION_EXPIRED_OR_INVALID",
  );
  requireValue(
    session.authProvider === providerFor(role.role),
    "AUTH_PROVIDER_MISMATCH",
  );
  requireValue(states.includes(snapshot.state), "INVALID_PERFORMANCE_STATE");
  if (role.role === "temporary" || role.role === "receptionist") {
    requireValue(now < snapshot.staffDeadline, "STAFF_DEADLINE_EXPIRED");
  }
}

/** プロファイルがなくても全ONを補わず、不正・旧版・期限切れを拒否する。 */
export function validateTemporaryProfile(
  profile: TemporaryProfile,
  snapshot: AuthorizationSnapshot,
  now: number,
): void {
  const { role } = snapshot;
  requireValue(
    profile &&
      profile.schemaVersion === 1 &&
      profile.humanUid === role.humanUid &&
      profile.roleVersion === role.revision &&
      ["active", "revoked"].includes(profile.status),
    "INVALID_TEMPORARY_PROFILE",
  );
  requireValue(
    nonnegative(profile.validFrom) &&
      positive(profile.validUntil) &&
      role.startsAt <= profile.validFrom &&
      profile.validFrom < profile.validUntil &&
      profile.validUntil <= role.endsAt &&
      profile.validUntil <= snapshot.staffDeadline &&
      profile.validFrom <= now &&
      now < profile.validUntil,
    "TEMPORARY_PROFILE_EXPIRED",
  );
  requireValue(
    profile.permissions &&
      Object.keys(profile.permissions).length === 9 &&
      TEMPORARY_PERMISSIONS.every(
        (key) =>
          Object.hasOwn(profile.permissions, key) &&
          typeof profile.permissions[key] === "boolean",
      ),
    "INVALID_TEMPORARY_PERMISSIONS",
  );
  if (profile.status === "revoked") {
    requireValue(
      TEMPORARY_PERMISSIONS.every((key) => profile.permissions[key] === false),
      "INVALID_REVOKED_PROFILE",
    );
  }
}

/** 権限追加の準備前は、検証済みの旧準備と現在役割の共通受付範囲だけを許可する。 */
function requirePreparation(
  snapshot: AuthorizationSnapshot,
  common: boolean,
): void {
  const { role, device, session } = snapshot;
  requireValue(
    positive(device.preparedRoleRevision) &&
      session.roleRevision === device.preparedRoleRevision,
    "DEVICE_NOT_PREPARED",
  );
  if (
    device.preparedRoleRevision === role.revision &&
    device.preparedRole === role.role
  )
    return;
  const baseline =
    common &&
    device.preparedRoleRevision < role.revision &&
    role.role === "temporary" &&
    (device.preparedRole === "receptionist" ||
      device.preparedRole === "temporary");
  requireValue(baseline, "ROLE_PREPARATION_REQUIRED");
}

/** 役割ごとの上限を判断する。理由・監査など個々の業務条件は呼出元でも確認する。 */
export function authorizeOnline(
  snapshot: AuthorizationSnapshot,
  operation: AuthorizedOperation,
  now: number,
): void {
  validateAuthorization(snapshot, now);
  authorizeOperation(snapshot, operation, now);
}

function authorizeOperation(
  snapshot: AuthorizationSnapshot,
  operation: AuthorizedOperation,
  now: number,
): void {
  const common = (COMMON_OPERATIONS as readonly string[]).includes(operation);
  const temporary = (TEMPORARY_PERMISSIONS as readonly string[]).includes(
    operation,
  );
  const management = (MANAGEMENT_OPERATIONS as readonly string[]).includes(
    operation,
  );
  requireValue(common || temporary || management, "UNKNOWN_OPERATION");
  requirePreparation(snapshot, common);
  if (operation === "qrReception")
    requireValue(snapshot.state === "operating", "RECEPTION_NOT_OPERATING");
  if (common) return;
  const role = snapshot.role.role;
  if (role === "owner" || role === "deputy") {
    if (operation === "handoverOwner")
      requireValue(role === "owner", "OWNER_REQUIRED");
    if (
      [
        "manageRoles",
        "manageTemporaryPermissions",
        "manageDevices",
        "closePerformance",
        "backupRestore",
        "exportManagement",
        "handoverOwner",
        "manageCustomFields",
      ].includes(operation)
    ) {
      requireRecentAuthentication(snapshot.session.humanAuthTime, now);
    }
    return;
  }
  requireValue(role === "temporary" && temporary, "ROLE_FORBIDDEN");
  requireValue(
    snapshot.state === "operating" || snapshot.state === "stopped",
    "DAY_MANAGEMENT_ENDED",
  );
  const profile = snapshot.temporaryProfile;
  requireValue(profile, "TEMPORARY_PROFILE_REQUIRED");
  validateTemporaryProfile(profile, snapshot, now);
  requireValue(
    profile.status === "active" &&
      profile.permissions[operation as (typeof TEMPORARY_PERMISSIONS)[number]],
    "TEMPORARY_OPERATION_DISABLED",
  );
}

/** 本人Authの観測値から期限付き証跡を作る。サーバー時刻とRulesで再検証する。 */
export function createPersonSession(
  snapshot: Pick<
    AuthorizationSnapshot,
    "environmentId" | "performanceId" | "role" | "device"
  >,
  identity: HumanIdentity,
  now: number,
  expiresAt: number,
  previous: PersonSession | null = null,
): PersonSession {
  const { role, device } = snapshot;
  checkScope(role, snapshot);
  checkScope(device, snapshot);
  requireValue(
    isId(snapshot.environmentId) &&
      isId(snapshot.performanceId) &&
      nonnegative(now) &&
      role.active === true &&
      positive(role.revision) &&
      roles.includes(role.role) &&
      nonnegative(role.startsAt) &&
      role.startsAt <= now &&
      now < role.endsAt,
    "ROLE_EXPIRED_OR_INACTIVE",
  );
  requireValue(
    identity.uid === role.humanUid &&
      identity.uid === device.humanUid &&
      identity.uid !== device.deviceUid &&
      identity.emailVerified === true &&
      identity.provider === providerFor(role.role),
    "HUMAN_IDENTITY_REQUIRED",
  );
  requireValue(
    nonnegative(identity.authenticatedAt) && identity.authenticatedAt <= now,
    "INVALID_AUTHENTICATION_TIME",
  );
  requireValue(
    positive(expiresAt) &&
      now < expiresAt &&
      expiresAt <= now + SESSION_LIFETIME &&
      expiresAt <= role.endsAt,
    "INVALID_SESSION_EXPIRY",
  );
  requireValue(
    device.active && device.approved && !device.retired,
    "DEVICE_UNAVAILABLE",
  );
  if (previous) {
    checkScope(previous, snapshot);
    requireValue(
      previous.deviceUid === device.deviceUid &&
        previous.humanUid === identity.uid &&
        nonnegative(previous.revision),
      "PRINCIPAL_MISMATCH",
    );
  }
  const next: PersonSession = {
    schemaVersion: 2,
    environmentId: snapshot.environmentId,
    performanceId: snapshot.performanceId,
    deviceUid: device.deviceUid,
    humanUid: identity.uid,
    active: true,
    emailVerified: true,
    authProvider: identity.provider,
    roleRevision: role.revision,
    revision: (previous?.revision ?? 0) + 1,
    issuedAt: now,
    expiresAt,
    humanAuthTime: identity.authenticatedAt,
  };
  requireValue(positive(next.revision), "SESSION_REVISION_OVERFLOW");
  return next;
}

/** 通信復帰の検査が済んでいない間は、保存済み許可の範囲だけで受付する。 */
export function authorizeOffline(
  snapshot: AuthorizationSnapshot,
  permit: OfflinePermission,
  restoredHumanUid: string,
  operation: AuthorizedOperation,
  now: number,
  appVersion: string,
): void {
  checkScope(permit, snapshot);
  requireValue(
    permit.deviceUid === snapshot.deviceAuthUid &&
      permit.humanUid === restoredHumanUid &&
      permit.humanUid === snapshot.role.humanUid &&
      permit.storageEpoch === snapshot.device.storageEpoch &&
      permit.roleRevision === snapshot.role.revision &&
      permit.appVersion === appVersion &&
      nonnegative(permit.dataRevision),
    "OFFLINE_BINDING_MISMATCH",
  );
  requireValue(
    nonnegative(permit.issuedAt) &&
      permit.issuedAt <= now &&
      positive(permit.expiresAt) &&
      now < permit.expiresAt &&
      permit.expiresAt <= snapshot.staffDeadline,
    "OFFLINE_PERMISSION_EXPIRED",
  );
  requireValue(
    !MANAGEMENT_OPERATIONS.includes(
      operation as (typeof MANAGEMENT_OPERATIONS)[number],
    ),
    "ONLINE_REQUIRED",
  );
  validateAuthorization(snapshot, now, "offline");
  authorizeOperation(snapshot, operation, now);
}
