// 主担当の引継ぎを扱う。現主担当の開始と後任の受諾を照合し、役割と結果を保存する。

import { get, ref, set, update, serverTimestamp } from 'firebase/database';
import type { Database } from 'firebase/database';
import type {
  AuthorizationSnapshot,
  HumanIdentity,
  RoleGrant,
  DeviceGrant,
} from '../../domain/authorization/types.ts';
import {
  authorizeOnline,
  requireRecentAuthentication,
  validUid,
} from '../../domain/authorization/policy.ts';
import { requireOwnerHandover } from '../../domain/authorization/device-safety.ts';
import type { AuthorizationOperationJournal } from '../../storage/authorization-operations.ts';
import { isId, positive, requireValue } from '../../domain/seats/validation.ts';

interface HandoverRequest {
  schemaVersion: 1;
  environmentId: string;
  performanceId: string;
  operationId: string;
  actorUid: string;
  actorDeviceUid: string;
  targetUid: string;
  actorExpectedRevision: number;
  targetExpectedRevision: number;
  previousOwnerDisposition: 'deputy' | 'inactive';
  successorDeviceUid: string;
  requestedAt: number;
}
interface HandoverAcceptance {
  schemaVersion: 1;
  environmentId: string;
  performanceId: string;
  operationId: string;
  targetUid: string;
  targetExpectedRevision: number;
  provider: 'google.com';
  authenticatedAt: number;
  accepted: true;
}

type HandoverResult = Omit<HandoverRequest, 'requestedAt'> & {
  actorResultingRevision: number;
  targetResultingRevision: number;
  committedAt: number;
};

interface Context {
  root: string;
  humanDatabase: Database;
  deviceDatabase: Database;
  verify(): Promise<HumanIdentity>;
  serverNow(): Promise<number>;
  fetchCurrent(): Promise<{ snapshot: AuthorizationSnapshot; serverNow: number }>;
}

/** 主担当引継ぎの案・後任の受諾と一体確定を扱う窓口を作る。 */
export function createOwnerHandoverPort(context: Context) {
  /** 指定したDBから、公演内の引継ぎ情報を取得する。 */
  const read = async (database: Database, path: string) =>
    (await get(ref(database, `${context.root}/${path}`))).val();

  /** 操作IDが対応するUUID形式か検証する。 */
  const checkedId = (id: string) => requireValue(isId(id), 'INVALID_OPERATION_ID');

  /** 同じ操作IDの主担当引継ぎ結果を照会する。 */
  async function receipt(id: string): Promise<HandoverResult | null> {
    checkedId(id);
    await context.verify();

    return read(context.deviceDatabase, `ownerHandoverResults/${id}`);
  }

  /** 後任と対象端末を確認し、引継ぎの固定入力を保存する。 */
  async function prepare(
    input: {
      operationId: string;
      targetUid: string;
      successorDeviceUid: string;
      previousOwnerDisposition: 'deputy' | 'inactive';
    },
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<HandoverRequest> {
    checkedId(input.operationId);
    requireValue(
      validUid(input.targetUid) &&
        validUid(input.successorDeviceUid) &&
        ['deputy', 'inactive'].includes(input.previousOwnerDisposition),
      'INVALID_HANDOVER_INPUT',
    );

    const { snapshot, serverNow } = await context.fetchCurrent();

    authorizeOnline(snapshot, 'handoverOwner', serverNow);

    const target = (await read(context.deviceDatabase, `roles/${input.targetUid}`)) as RoleGrant;

    requireValue(
      target &&
        target.humanUid === input.targetUid &&
        target.role === 'deputy' &&
        target.active &&
        target.startsAt <= serverNow &&
        serverNow < target.endsAt &&
        positive(target.revision),
      'ACTIVE_DEPUTY_REQUIRED',
    );

    const request: HandoverRequest = {
      schemaVersion: 1,
      environmentId: snapshot.environmentId,
      performanceId: snapshot.performanceId,
      operationId: input.operationId,
      actorUid: snapshot.role.humanUid,
      actorDeviceUid: snapshot.deviceAuthUid,
      targetUid: input.targetUid,
      actorExpectedRevision: snapshot.role.revision,
      targetExpectedRevision: target.revision,
      previousOwnerDisposition: input.previousOwnerDisposition,
      successorDeviceUid: input.successorDeviceUid,
      requestedAt: serverNow,
    };

    await journal.save(input.operationId, { kind: 'ownerHandover', request }, assertAuthorized);
    assertAuthorized();

    const path = `ownerHandoverRequests/${input.operationId}`;

    if (!(await read(context.deviceDatabase, path)))
      await set(ref(context.deviceDatabase, `${context.root}/${path}`), {
        ...request,
        requestedAt: serverTimestamp(),
      });

    const stored = (await read(context.deviceDatabase, path)) as HandoverRequest;

    requireValue(
      stored &&
        Object.entries(request).every(
          ([key, value]) => key === 'requestedAt' || stored[key as keyof HandoverRequest] === value,
        ),
      'HANDOVER_REQUEST_MISMATCH',
    );

    return stored;
  }

  /** 後任本人のGoogle認証で、引継ぎの受諾を保存する。 */
  async function accept(id: string): Promise<HandoverAcceptance> {
    checkedId(id);

    const human = await context.verify(),
      now = await context.serverNow();
    const request = (await read(
      context.humanDatabase,
      `ownerHandoverRequests/${id}`,
    )) as HandoverRequest;

    requireValue(
      request &&
        request.targetUid === human.uid &&
        human.emailVerified &&
        human.provider === 'google.com',
      'SUCCESSOR_IDENTITY_REQUIRED',
    );
    requireRecentAuthentication(human.authenticatedAt, now);

    const acceptance: HandoverAcceptance = {
      schemaVersion: 1,
      environmentId: request.environmentId,
      performanceId: request.performanceId,
      operationId: id,
      targetUid: human.uid,
      targetExpectedRevision: request.targetExpectedRevision,
      provider: 'google.com',
      authenticatedAt: human.authenticatedAt,
      accepted: true,
    };

    await set(
      ref(context.humanDatabase, `${context.root}/ownerHandoverAcceptances/${id}`),
      acceptance,
    );

    return acceptance;
  }

  /** 現在認可と受諾を照合し、主担当UIDと役割・結果を一体保存する。 */
  async function commit(
    id: string,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<HandoverResult> {
    checkedId(id);

    const fixed = (await journal.read(id, assertAuthorized)) as {
      kind: string;
      request: HandoverRequest;
    } | null;

    requireValue(
      fixed?.kind === 'ownerHandover' && fixed.request.operationId === id,
      'FIXED_OPERATION_REQUIRED',
    );

    const prior = await receipt(id);

    if (prior) return prior;

    const { snapshot, serverNow } = await context.fetchCurrent();
    const request = (await read(
      context.deviceDatabase,
      `ownerHandoverRequests/${id}`,
    )) as HandoverRequest;

    requireValue(
      request &&
        Object.entries(fixed.request).every(
          ([key, value]) =>
            key === 'requestedAt' || request[key as keyof HandoverRequest] === value,
        ),
      'HANDOVER_REQUEST_MISMATCH',
    );

    const [roles, devices, acceptance] = (await Promise.all([
      read(context.deviceDatabase, 'roles'),
      read(context.deviceDatabase, 'devices'),
      read(context.deviceDatabase, `ownerHandoverAcceptances/${id}`),
    ])) as [Record<string, RoleGrant>, Record<string, DeviceGrant>, HandoverAcceptance | null];

    requireValue(
      acceptance &&
        acceptance.operationId === id &&
        acceptance.targetUid === request.targetUid &&
        acceptance.targetExpectedRevision === request.targetExpectedRevision,
      'SUCCESSOR_ACCEPTANCE_REQUIRED',
    );
    // 指定した後任端末だけを検査し、別端末の準備完了を流用しない。
    requireOwnerHandover(
      snapshot,
      {
        roles: Object.values(roles),
        devices: Object.values(devices).filter(
          (device) => device.deviceUid === request.successorDeviceUid,
        ),
      },
      request.targetUid,
      {
        humanUid: acceptance.targetUid,
        provider: acceptance.provider,
        authenticatedAt: acceptance.authenticatedAt,
        accepted: acceptance.accepted,
      },
      serverNow,
    );

    const before = roles[request.actorUid],
      target = roles[request.targetUid];

    requireValue(
      before &&
        target &&
        before.revision === request.actorExpectedRevision &&
        target.revision === request.targetExpectedRevision,
      'STALE_ROLE_REVISION',
    );

    const afterOwner = {
      ...before,
      role: request.previousOwnerDisposition === 'deputy' ? 'deputy' : 'owner',
      active: request.previousOwnerDisposition === 'deputy',
      revision: before.revision + 1,
      lastOperationId: id,
    };
    const afterTarget = {
      ...target,
      role: 'owner',
      revision: target.revision + 1,
      lastOperationId: id,
    };

    requireValue(
      positive(afterOwner.revision) && positive(afterTarget.revision),
      'ROLE_REVISION_OVERFLOW',
    );

    const { requestedAt, ...fixedResult } = request;
    const result = {
      ...fixedResult,
      actorResultingRevision: afterOwner.revision,
      targetResultingRevision: afterTarget.revision,
      committedAt: serverTimestamp(),
    };

    assertAuthorized();
    await update(ref(context.deviceDatabase, context.root), {
      [`roles/${request.actorUid}`]: afterOwner,
      [`roles/${request.targetUid}`]: afterTarget,
      'control/ownerUid': request.targetUid,
      'control/ownerHandoverOperationId': id,
      [`ownerHandoverResults/${id}`]: result,
      [`ownerHandoverAudit/${id}`]: result,
    });

    // 引継ぎで旧認可は失効する。通常業務を再開せず、最小の確定結果だけを照会する。
    const stored = await receipt(id);

    requireValue(
      stored &&
        stored.operationId === id &&
        stored.targetUid === request.targetUid &&
        stored.targetResultingRevision === afterTarget.revision,
      'OPERATION_RESULT_MISMATCH',
    );

    return stored;
  }

  return { prepare, accept, commit, receipt };
}
