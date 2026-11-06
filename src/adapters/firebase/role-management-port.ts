// 応答喪失で役割を二重変更しないよう、入力を保全し、同じ操作IDの結果を照会する。

import { get, ref, set, update, serverTimestamp } from 'firebase/database';
import type { Database } from 'firebase/database';
import {
  createRoleChangeRequest,
  createGoogleAcceptance,
  commitRoleChange,
  changeTemporaryPermissions,
  createAuthorizationAudit,
  cancelAuthorizationChange,
} from '../../domain/authorization/role-management.ts';
import type {
  RoleChangeRequest,
  GoogleAcceptance,
  RoleManagementPlan,
} from '../../domain/authorization/role-management.ts';
import type {
  AuthorizationSnapshot,
  HumanIdentity,
  RoleGrant,
  TemporaryProfile,
} from '../../domain/authorization/types.ts';
import type { AuthorizationOperationJournal } from '../../storage/authorization-operations.ts';
import { isId, requireValue } from '../../domain/seats/validation.ts';
import { validUid } from '../../domain/authorization/policy.ts';

interface Context {
  humanDatabase: Database;
  deviceDatabase: Database;
  root: string;
  verify(): Promise<HumanIdentity>;
  serverNow(): Promise<number>;
  fetchCurrent(): Promise<{ snapshot: AuthorizationSnapshot; serverNow: number }>;
}
type PermissionInput = Parameters<typeof changeTemporaryPermissions>[2];
type RoleInput = Parameters<typeof createRoleChangeRequest>[2];
type SavedOperation =
  | { kind: 'roleChange'; request: RoleChangeRequest }
  | { kind: 'permissionChange'; targetUid: string; input: PermissionInput; requestedAt: number };

/** 通信中の失効や保存失敗を通過させないため、認可の再検査と暗号化保全を必須にする。 */
export function createRoleManagementPort(context: Context) {
  const read = async (database: Database, path: string) =>
    (await get(ref(database, `${context.root}/${path}`))).val();
  const operationId = (id: string) => requireValue(isId(id), 'INVALID_OPERATION_ID');
  async function target(uid: string): Promise<RoleGrant> {
    requireValue(validUid(uid), 'INVALID_TARGET_UID');
    const role = (await read(context.deviceDatabase, `roles/${uid}`)) as RoleGrant | null;
    requireValue(role && role.humanUid === uid, 'TARGET_ROLE_MISSING');
    return role;
  }
  async function previousProfile(role: RoleGrant): Promise<TemporaryProfile | null> {
    if (role.role !== 'temporary') return null;
    return await read(
      context.deviceDatabase,
      `temporaryPermissionProfiles/${role.humanUid}/${role.revision}`,
    );
  }
  async function receipt(
    kind: SavedOperation['kind'],
    id: string,
  ): Promise<RoleManagementPlan['result'] | null> {
    operationId(id);
    await context.verify();
    const stored = await read(
      context.deviceDatabase,
      `${kind === 'roleChange' ? 'roleChangeResults' : 'temporaryPermissionOperations'}/${id}`,
    );
    return kind === 'roleChange' ? stored : (stored?.result ?? null);
  }
  async function saveRoleRequest(
    uid: string,
    input: RoleInput,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<RoleChangeRequest> {
    const { snapshot, serverNow } = await context.fetchCurrent();
    const request = createRoleChangeRequest(snapshot, await target(uid), input, serverNow);
    await journal.save(request.operationId, { kind: 'roleChange', request }, assertAuthorized);
    assertAuthorized();
    // 本文の固定後に初めて要求する。応答不明でもjournalを消さず同じIDを照会する。
    const prior = await read(context.deviceDatabase, `roleChangeRequests/${request.operationId}`);
    if (!prior)
      await set(
        ref(context.deviceDatabase, `${context.root}/roleChangeRequests/${request.operationId}`),
        { ...request, requestedAt: serverTimestamp() },
      );
    const stored = (await read(
      context.deviceDatabase,
      `roleChangeRequests/${request.operationId}`,
    )) as RoleChangeRequest;
    requireValue(
      stored &&
        Object.entries(request).every(
          ([key, value]) =>
            key === 'requestedAt' || stored[key as keyof RoleChangeRequest] === value,
        ),
      'ROLE_REQUEST_MISMATCH',
    );
    return stored;
  }
  async function acceptGoogle(id: string): Promise<GoogleAcceptance> {
    operationId(id);
    const human = await context.verify();
    const request = (await read(
      context.humanDatabase,
      `roleChangeRequests/${id}`,
    )) as RoleChangeRequest;
    requireValue(request, 'ROLE_REQUEST_MISSING');
    const acceptance = createGoogleAcceptance(request, human, await context.serverNow());
    await set(
      ref(context.humanDatabase, `${context.root}/roleChangeAcceptances/${id}`),
      acceptance,
    );
    return acceptance;
  }
  async function savePermissionInput(
    uid: string,
    input: PermissionInput,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<void> {
    const { snapshot, serverNow } = await context.fetchCurrent();
    changeTemporaryPermissions(snapshot, await target(uid), input, serverNow);
    await journal.save(
      input.operationId,
      { kind: 'permissionChange', targetUid: uid, input, requestedAt: serverNow },
      assertAuthorized,
    );
  }
  async function commit(
    id: string,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<RoleManagementPlan['result']> {
    operationId(id);
    const saved = (await journal.read(id, assertAuthorized)) as SavedOperation | null;
    requireValue(
      saved && ['roleChange', 'permissionChange'].includes(saved.kind),
      'FIXED_OPERATION_REQUIRED',
    );
    const current = await receipt(saved.kind, id);
    if (current) {
      requireValue(
        current.operationId === id &&
          current.status === 'committed' &&
          current.targetUid ===
            (saved.kind === 'roleChange' ? saved.request.targetUid : saved.targetUid),
        'OPERATION_RESULT_MISMATCH',
      );
      assertAuthorized();
      return current;
    }
    const { snapshot, serverNow } = await context.fetchCurrent();
    const uid = saved.kind === 'roleChange' ? saved.request.targetUid : saved.targetUid;
    const before = await target(uid),
      oldProfile = await previousProfile(before);
    let plan: RoleManagementPlan;
    let request: RoleChangeRequest | null = null;
    if (saved.kind === 'roleChange') {
      request = (await read(
        context.deviceDatabase,
        `roleChangeRequests/${id}`,
      )) as RoleChangeRequest;
      requireValue(
        request &&
          Object.entries(saved.request).every(
            ([key, value]) =>
              key === 'requestedAt' || request![key as keyof RoleChangeRequest] === value,
          ),
        'ROLE_REQUEST_MISMATCH',
      );
      const acceptance =
        request.nextRole === 'deputy'
          ? ((await read(
              context.deviceDatabase,
              `roleChangeAcceptances/${id}`,
            )) as GoogleAcceptance | null)
          : null;
      plan = commitRoleChange(snapshot, before, request, acceptance, serverNow);
    } else plan = changeTemporaryPermissions(snapshot, before, saved.input, serverNow);
    const audit = createAuthorizationAudit(plan, before, oldProfile);
    const result = { ...plan.result, committedAt: serverTimestamp() };
    const updates: Record<string, unknown> = {
      [`roles/${uid}`]: plan.role,
      [`authorizationAudit/${id}`]: { ...audit, committedAt: serverTimestamp() },
    };
    if (plan.profile)
      updates[`temporaryPermissionProfiles/${uid}/${plan.role.revision}`] = plan.profile;
    if (saved.kind === 'roleChange') updates[`roleChangeResults/${id}`] = result;
    else
      updates[`temporaryPermissionOperations/${id}`] = {
        request: {
          ...snapshotScope(snapshot),
          schemaVersion: 1,
          operationId: id,
          actorUid: snapshot.role.humanUid,
          actorDeviceUid: snapshot.deviceAuthUid,
          targetUid: uid,
          expectedRevision: saved.input.expectedRevision,
          validFrom: saved.input.validFrom,
          validUntil: saved.input.validUntil,
          revoke: saved.input.revoke,
          permissions: saved.input.permissions,
          requestedAt: saved.requestedAt,
        },
        result,
      };
    assertAuthorized();
    await update(ref(context.deviceDatabase, context.root), updates);
    const stored = await receipt(saved.kind, id);
    requireValue(
      stored &&
        stored.status === 'committed' &&
        stored.operationId === id &&
        stored.targetUid === uid &&
        stored.resultingRevision === plan.role.revision,
      'OPERATION_RESULT_MISMATCH',
    );
    assertAuthorized();
    return stored;
  }
  async function cancel(
    id: string,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<RoleManagementPlan['result']> {
    operationId(id);
    const saved = (await journal.read(id, assertAuthorized)) as SavedOperation | null;
    requireValue(
      saved && ['roleChange', 'permissionChange'].includes(saved.kind),
      'FIXED_OPERATION_REQUIRED',
    );
    const prior = await receipt(saved.kind, id);
    if (prior) return prior;
    const { snapshot, serverNow } = await context.fetchCurrent();
    const uid = saved.kind === 'roleChange' ? saved.request.targetUid : saved.targetUid;
    const before = await target(uid),
      oldProfile = await previousProfile(before);
    const expectedRevision =
      saved.kind === 'roleChange' ? saved.request.expectedRevision : saved.input.expectedRevision;
    const plan = cancelAuthorizationChange(
      snapshot,
      before,
      id,
      expectedRevision,
      saved.kind,
      oldProfile,
      serverNow,
    );
    const audit = createAuthorizationAudit(plan, before, oldProfile);
    const result = { ...plan.result, committedAt: serverTimestamp() };
    const updates: Record<string, unknown> = {
      [`authorizationAudit/${id}`]: { ...audit, committedAt: serverTimestamp() },
    };
    if (saved.kind === 'roleChange') updates[`roleChangeResults/${id}`] = result;
    else
      updates[`temporaryPermissionOperations/${id}`] = {
        request: {
          ...snapshotScope(snapshot),
          schemaVersion: 1,
          operationId: id,
          actorUid: snapshot.role.humanUid,
          actorDeviceUid: snapshot.deviceAuthUid,
          targetUid: uid,
          expectedRevision,
          validFrom: saved.input.validFrom,
          validUntil: saved.input.validUntil,
          revoke: saved.input.revoke,
          permissions: saved.input.permissions,
          requestedAt: saved.requestedAt,
        },
        result,
      };
    assertAuthorized();
    await update(ref(context.deviceDatabase, context.root), updates);
    const stored = await receipt(saved.kind, id);
    requireValue(
      stored && stored.status === 'cancelled' && stored.operationId === id,
      'OPERATION_RESULT_MISMATCH',
    );
    assertAuthorized();
    return stored;
  }
  return { target, saveRoleRequest, acceptGoogle, savePermissionInput, commit, cancel, receipt };
}

function snapshotScope(snapshot: AuthorizationSnapshot) {
  return { environmentId: snapshot.environmentId, performanceId: snapshot.performanceId };
}
