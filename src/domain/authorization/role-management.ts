// DD-96・DD-98の変更案を作る。確定時にも、保存層とRulesが現在認可を検査する。

import type {
  AuthorizationSnapshot,
  HumanIdentity,
  RoleGrant,
  StaffRole,
  TemporaryPermission,
  TemporaryProfile,
} from './types.ts';
import { TEMPORARY_PERMISSIONS } from './types.ts';
import { authorizeOnline, requireRecentAuthentication } from './policy.ts';
import { checkScope, isId, nonnegative, positive, requireValue } from '../seats/validation.ts';

export interface RoleChangeRequest {
  schemaVersion: 1;
  environmentId: string;
  performanceId: string;
  operationId: string;
  actorUid: string;
  actorDeviceUid: string;
  targetUid: string;
  expectedRevision: number;
  previousRole: StaffRole;
  nextRole: StaffRole;
  startsAt: number;
  endsAt: number;
  requestedAt: number;
}

export interface GoogleAcceptance {
  schemaVersion: 1;
  environmentId: string;
  performanceId: string;
  operationId: string;
  targetUid: string;
  expectedRevision: number;
  provider: 'google.com';
  authenticatedAt: number;
}

export interface RoleManagementPlan {
  role: RoleGrant;
  profile: TemporaryProfile | null;
  result: {
    schemaVersion: 1;
    environmentId: string;
    performanceId: string;
    status: 'committed' | 'cancelled';
    operationId: string;
    actorUid: string;
    actorDeviceUid: string;
    targetUid: string;
    expectedRevision: number;
    resultingRevision: number;
    kind: 'roleChange' | 'permissionChange';
    previousRole: StaffRole;
    nextRole: StaffRole;
    committedAt: number;
  };
}

/** 変更前後の設定を含め、結果と同じ確定で残す最小の認可監査を作る。 */
export function createAuthorizationAudit(
  plan: RoleManagementPlan,
  previousRole: RoleGrant,
  previousProfile: TemporaryProfile | null,
): RoleManagementPlan['result'] & {
  previousStartsAt: number;
  previousEndsAt: number;
  nextStartsAt: number;
  nextEndsAt: number;
  previousProfileVersion: number;
  nextProfileVersion: number;
  previousPermissions: Record<TemporaryPermission, boolean>;
  nextPermissions: Record<TemporaryPermission, boolean>;
} {
  if (previousRole.role === 'temporary') {
    requireValue(
      previousProfile &&
        previousProfile.humanUid === previousRole.humanUid &&
        previousProfile.roleVersion === previousRole.revision,
      'PREVIOUS_PROFILE_REQUIRED',
    );
  }
  const off = () =>
    Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, false])) as Record<
      TemporaryPermission,
      boolean
    >;
  return {
    ...plan.result,
    previousStartsAt: previousRole.startsAt,
    previousEndsAt: previousRole.endsAt,
    nextStartsAt: plan.role.startsAt,
    nextEndsAt: plan.role.endsAt,
    previousProfileVersion: previousRole.role === 'temporary' ? previousRole.revision : 0,
    nextProfileVersion: plan.profile?.roleVersion ?? 0,
    previousPermissions:
      previousRole.role === 'temporary' ? permissions(previousProfile!.permissions) : off(),
    nextPermissions: plan.profile ? permissions(plan.profile.permissions) : off(),
  };
}

function requireTarget(
  actor: AuthorizationSnapshot,
  target: RoleGrant,
  expectedRevision: number,
  now: number,
): void {
  checkScope(target, actor);
  requireValue(
    target.active === true &&
      positive(target.revision) &&
      target.revision === expectedRevision &&
      target.startsAt <= now &&
      now < target.endsAt,
    'STALE_OR_INACTIVE_TARGET',
  );
}

/** 役割変更の許可表。主担当の変更は、別の引継ぎ操作へ分ける。 */
export function createRoleChangeRequest(
  actor: AuthorizationSnapshot,
  target: RoleGrant,
  input: {
    operationId: string;
    expectedRevision: number;
    nextRole: StaffRole;
    startsAt: number;
    endsAt: number;
  },
  now: number,
): RoleChangeRequest {
  authorizeOnline(actor, 'manageRoles', now);
  requireTarget(actor, target, input.expectedRevision, now);
  requireValue(
    isId(input.operationId) &&
      input.nextRole !== 'owner' &&
      target.role !== 'owner' &&
      ['deputy', 'temporary', 'receptionist'].includes(input.nextRole) &&
      input.nextRole !== target.role,
    'ROLE_CHANGE_FORBIDDEN',
  );
  requireValue(
    actor.role.role === 'owner' ||
      (actor.role.role === 'deputy' &&
        [target.role, input.nextRole].every(
          (role) => role === 'temporary' || role === 'receptionist',
        )),
    'ROLE_CHANGE_FORBIDDEN',
  );
  requireValue(
    nonnegative(input.startsAt) &&
      positive(input.endsAt) &&
      input.startsAt < input.endsAt &&
      now < input.endsAt &&
      (input.nextRole === 'deputy' || input.endsAt <= actor.staffDeadline),
    'INVALID_ROLE_PERIOD',
  );
  return {
    schemaVersion: 1,
    environmentId: actor.environmentId,
    performanceId: actor.performanceId,
    operationId: input.operationId,
    actorUid: actor.role.humanUid,
    actorDeviceUid: actor.deviceAuthUid,
    targetUid: target.humanUid,
    expectedRevision: target.revision,
    previousRole: target.role,
    nextRole: input.nextRole,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    requestedAt: now,
  };
}

/** 代理へ昇格する対象者の本人確認。Google連携済みだけでは証跡を作らない。 */
export function createGoogleAcceptance(
  request: RoleChangeRequest,
  identity: HumanIdentity,
  now: number,
): GoogleAcceptance {
  requireValue(
    request.nextRole === 'deputy' &&
      identity.uid === request.targetUid &&
      identity.emailVerified === true &&
      identity.provider === 'google.com',
    'GOOGLE_IDENTITY_REQUIRED',
  );
  requireRecentAuthentication(identity.authenticatedAt, now);
  return {
    schemaVersion: 1,
    environmentId: request.environmentId,
    performanceId: request.performanceId,
    operationId: request.operationId,
    targetUid: request.targetUid,
    expectedRevision: request.expectedRevision,
    provider: 'google.com',
    authenticatedAt: identity.authenticatedAt,
  };
}

function permissions(
  input: Record<TemporaryPermission, boolean>,
): Record<TemporaryPermission, boolean> {
  requireValue(
    input &&
      Object.keys(input).length === 9 &&
      TEMPORARY_PERMISSIONS.every(
        (key) => Object.hasOwn(input, key) && typeof input[key] === 'boolean',
      ),
    'INVALID_TEMPORARY_PERMISSIONS',
  );
  return structuredClone(input);
}

function result(
  actor: AuthorizationSnapshot,
  target: RoleGrant,
  operationId: string,
  next: RoleGrant,
  kind: RoleManagementPlan['result']['kind'],
  now: number,
): RoleManagementPlan['result'] {
  requireValue(positive(next.revision), 'ROLE_REVISION_OVERFLOW');
  return {
    schemaVersion: 1,
    environmentId: actor.environmentId,
    performanceId: actor.performanceId,
    status: 'committed',
    operationId,
    actorUid: actor.role.humanUid,
    actorDeviceUid: actor.deviceAuthUid,
    targetUid: target.humanUid,
    expectedRevision: target.revision,
    resultingRevision: next.revision,
    kind,
    previousRole: target.role,
    nextRole: next.role,
    committedAt: now,
  };
}

/** 固定した案を現在値でもう一度検査し、役割・プロファイルと結果の一体更新案を作る。 */
export function commitRoleChange(
  actor: AuthorizationSnapshot,
  target: RoleGrant,
  request: RoleChangeRequest,
  acceptance: GoogleAcceptance | null,
  now: number,
  initialPermissions: Record<TemporaryPermission, boolean> = Object.fromEntries(
    TEMPORARY_PERMISSIONS.map((key) => [key, true]),
  ) as Record<TemporaryPermission, boolean>,
): RoleManagementPlan {
  checkScope(request, actor);
  requireValue(
    request.schemaVersion === 1 && Object.keys(request).length === 13,
    'INVALID_ROLE_REQUEST',
  );
  const current = createRoleChangeRequest(
    actor,
    target,
    {
      operationId: request.operationId,
      expectedRevision: request.expectedRevision,
      nextRole: request.nextRole,
      startsAt: request.startsAt,
      endsAt: request.endsAt,
    },
    now,
  );
  requireValue(
    current.actorUid === request.actorUid &&
      current.actorDeviceUid === request.actorDeviceUid &&
      current.targetUid === request.targetUid &&
      current.previousRole === request.previousRole &&
      nonnegative(request.requestedAt) &&
      request.requestedAt <= now,
    'ROLE_REQUEST_MISMATCH',
  );
  if (request.nextRole === 'deputy') {
    requireValue(acceptance, 'GOOGLE_ACCEPTANCE_REQUIRED');
    checkScope(acceptance, actor);
    requireValue(
      acceptance.schemaVersion === 1 &&
        Object.keys(acceptance).length === 8 &&
        acceptance.operationId === request.operationId &&
        acceptance.targetUid === request.targetUid &&
        acceptance.expectedRevision === request.expectedRevision &&
        acceptance.provider === 'google.com',
      'GOOGLE_ACCEPTANCE_MISMATCH',
    );
    requireRecentAuthentication(acceptance.authenticatedAt, now);
  }
  const role: RoleGrant = {
    ...target,
    role: request.nextRole,
    revision: target.revision + 1,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    lastOperationId: request.operationId,
  };
  const profile: TemporaryProfile | null =
    role.role === 'temporary'
      ? {
          schemaVersion: 1,
          humanUid: role.humanUid,
          roleVersion: role.revision,
          status: 'active',
          validFrom: role.startsAt,
          validUntil: role.endsAt,
          permissions: permissions(initialPermissions),
        }
      : null;
  return {
    role,
    profile,
    result: result(actor, target, request.operationId, role, 'roleChange', now),
  };
}

/** 同じ役割でも共通版を1進める。取消しでは全OFFの新しい不変プロファイルを作る。 */
export function changeTemporaryPermissions(
  actor: AuthorizationSnapshot,
  target: RoleGrant,
  input: {
    operationId: string;
    expectedRevision: number;
    revoke: boolean;
    validFrom: number;
    validUntil: number;
    permissions: Record<TemporaryPermission, boolean>;
  },
  now: number,
): RoleManagementPlan {
  authorizeOnline(actor, 'manageTemporaryPermissions', now);
  requireTarget(actor, target, input.expectedRevision, now);
  requireValue(
    target.role === 'temporary' && isId(input.operationId) && typeof input.revoke === 'boolean',
    'TEMPORARY_TARGET_REQUIRED',
  );
  requireValue(
    nonnegative(input.validFrom) &&
      positive(input.validUntil) &&
      target.startsAt <= input.validFrom &&
      input.validFrom < input.validUntil &&
      input.validUntil <= target.endsAt &&
      input.validUntil <= actor.staffDeadline &&
      now < input.validUntil,
    'INVALID_PROFILE_PERIOD',
  );
  const configured = permissions(input.permissions);
  const role = {
    ...target,
    revision: target.revision + 1,
    lastOperationId: input.operationId,
  };
  const profile: TemporaryProfile = {
    schemaVersion: 1,
    humanUid: target.humanUid,
    roleVersion: role.revision,
    status: input.revoke ? 'revoked' : 'active',
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    permissions: input.revoke
      ? (Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, false])) as Record<
          TemporaryPermission,
          boolean
        >)
      : configured,
  };
  return {
    role,
    profile,
    result: result(actor, target, input.operationId, role, 'permissionChange', now),
  };
}

/** 未確定の案を取り消す。役割と設定は変えず、同じIDに終端結果を残す。 */
export function cancelAuthorizationChange(
  actor: AuthorizationSnapshot,
  target: RoleGrant,
  operationId: string,
  expectedRevision: number,
  kind: RoleManagementPlan['result']['kind'],
  previousProfile: TemporaryProfile | null,
  now: number,
): RoleManagementPlan {
  authorizeOnline(actor, kind === 'roleChange' ? 'manageRoles' : 'manageTemporaryPermissions', now);
  requireTarget(actor, target, expectedRevision, now);
  requireValue(
    isId(operationId) && (kind === 'roleChange' || target.role === 'temporary'),
    'INVALID_OPERATION',
  );
  return {
    role: { ...target },
    profile: previousProfile,
    result: { ...result(actor, target, operationId, target, kind, now), status: 'cancelled' },
  };
}
