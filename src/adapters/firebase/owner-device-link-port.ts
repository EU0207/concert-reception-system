// 主担当の追加端末リンクを扱う。発行・読取りと承認、取消しと監査を保存する。

import { get, ref, update, serverTimestamp } from 'firebase/database';
import type { Database } from 'firebase/database';
import type {
  AuthorizationSnapshot,
  DeviceGrant,
  HumanIdentity,
} from '../../domain/authorization/types.ts';
import type { OwnerDeviceLink } from '../../domain/authorization/device-registration.ts';
import {
  createOwnerDeviceToken,
  ownerDeviceLinkDigest,
  OWNER_DEVICE_LINK_LIFETIME,
} from '../../domain/authorization/device-registration.ts';
import {
  authorizeOnline,
  requireRecentAuthentication,
  validUid,
} from '../../domain/authorization/policy.ts';
import { checkScope, isId, requireValue } from '../../domain/seats/validation.ts';
import type { AuthorizationOperationJournal } from '../../storage/authorization-operations.ts';

interface Reader {
  schemaVersion: 1;
  environmentId: string;
  performanceId: string;
  operationId: string;
  linkDigest: string;
  ownerUid: string;
  targetDeviceUid: string;
  storageEpoch: string;
  readAt: number;
}
interface PairingResult {
  schemaVersion: 1;
  environmentId: string;
  performanceId: string;
  operationId: string;
  linkDigest: string;
  ownerUid: string;
  issuerDeviceUid: string;
  targetDeviceUid: string;
  storageEpoch: string;
  status: 'approved';
  expectedRevision: 1;
  resultingRevision: 2;
  approvedAt: number;
}
interface Context {
  root: string;
  deviceUid: string;
  deviceDatabase: Database;
  verify(): Promise<HumanIdentity>;
  serverNow(): Promise<number>;
  refreshProof(): Promise<void>;
  fetchCurrent(): Promise<{ snapshot: AuthorizationSnapshot; serverNow: number }>;
}

/** 追加端末リンクの監査に共通する項目と記録時刻を組み立てる。 */
const audit = (link: OwnerDeviceLink, event: string, reporterDeviceUid: string) => ({
  schemaVersion: link.schemaVersion,
  environmentId: link.environmentId,
  performanceId: link.performanceId,
  operationId: link.operationId,
  purpose: link.purpose,
  ownerUid: link.ownerUid,
  ownerRoleRevision: link.ownerRoleRevision,
  issuerDeviceUid: link.issuerDeviceUid,
  targetDeviceUid: link.targetDeviceUid,
  storageEpoch: link.storageEpoch,
  issuedAt: link.issuedAt,
  expiresAt: link.expiresAt,
  event,
  recordedAt: serverTimestamp(),
  reporterDeviceUid,
});

/** 主担当の追加端末リンクを発行・読取り・承認する窓口を作る。 */
export function createOwnerDeviceLinkPort(context: Context) {
  /** 現在の端末を記録者とする監査情報を作る。 */
  const makeAudit = (link: OwnerDeviceLink, event: string) => audit(link, event, context.deviceUid);

  /** 端末Authで、公演内のリンク関連情報を取得する。 */
  const read = async (path: string) =>
    (await get(ref(context.deviceDatabase, `${context.root}/${path}`))).val();

  /** 同じ操作IDで、追加端末の承認結果を照会する。 */
  async function receipt(operationId: string): Promise<PairingResult | null> {
    requireValue(isId(operationId), 'INVALID_OPERATION_ID');
    await context.verify();

    return read(`ownerDeviceLinkResults/${operationId}`);
  }

  /** 既存主担当端末から、一回限りの追加端末リンクを発行する。 */
  async function issue(
    targetDeviceUid: string,
    operationId: string,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<{ token: string; digest: string; link: OwnerDeviceLink }> {
    requireValue(
      validUid(targetDeviceUid) && targetDeviceUid !== context.deviceUid && isId(operationId),
      'INVALID_OWNER_DEVICE_TARGET',
    );

    const { snapshot, serverNow } = await context.fetchCurrent();

    authorizeOnline(snapshot, 'manageDevices', serverNow);
    requireValue(snapshot.role.role === 'owner', 'OWNER_REQUIRED');
    requireValue(
      !(await journal.read(operationId, assertAuthorized)),
      'OWNER_DEVICE_LINK_ALREADY_ISSUED',
    );

    const target = (await read(`devices/${targetDeviceUid}`)) as DeviceGrant | null;

    requireValue(
      target &&
        target.humanUid === snapshot.role.humanUid &&
        target.active === false &&
        target.approved === false &&
        target.retired === false &&
        target.revision === 1 &&
        target.preparedRoleRevision === 0,
      'PENDING_OWNER_DEVICE_REQUIRED',
    );
    checkScope(target, snapshot);

    const { token, digest } = await createOwnerDeviceToken();
    const link: OwnerDeviceLink = {
      schemaVersion: 1,
      environmentId: snapshot.environmentId,
      performanceId: snapshot.performanceId,
      operationId,
      purpose: 'owner-device',
      ownerUid: snapshot.role.humanUid,
      ownerRoleRevision: snapshot.role.revision,
      issuerDeviceUid: context.deviceUid,
      targetDeviceUid,
      storageEpoch: target.storageEpoch,
      issuedAt: serverNow,
      expiresAt: serverNow + OWNER_DEVICE_LINK_LIFETIME - 1000,
      status: 'pending',
      revision: 1,
    };

    // 平文トークンを保存すると、リンク漏えい時の保護を失うため、操作記録にも含めない。
    await journal.save(operationId, { kind: 'ownerDeviceLink', digest, link }, assertAuthorized);
    assertAuthorized();

    const storedLink = { ...link, issuedAt: serverTimestamp() };

    await update(ref(context.deviceDatabase, context.root), {
      [`ownerDeviceLinks/${digest}`]: storedLink,
      [`ownerDeviceLinkIssues/${operationId}`]: {
        schemaVersion: link.schemaVersion,
        environmentId: link.environmentId,
        performanceId: link.performanceId,
        operationId,
        linkDigest: digest,
        ownerUid: link.ownerUid,
        issuerDeviceUid: link.issuerDeviceUid,
        targetDeviceUid,
        storageEpoch: link.storageEpoch,
        issuedAt: serverTimestamp(),
      },
      [`ownerDeviceLinkAudit/${digest}/issued`]: {
        ...makeAudit(link, 'issued'),
        issuedAt: serverTimestamp(),
      },
    });

    const stored = (await read(`ownerDeviceLinks/${digest}`)) as OwnerDeviceLink;

    requireValue(
      stored &&
        stored.operationId === operationId &&
        stored.targetDeviceUid === targetDeviceUid &&
        stored.status === 'pending',
      'OWNER_LINK_RESULT_MISMATCH',
    );
    assertAuthorized();

    return { token, digest, link: stored };
  }

  /** 読み取ったトークンを照合し、対象端末の読取り証跡を保存する。 */
  async function readToken(token: string): Promise<Reader> {
    const human = await context.verify(),
      digest = await ownerDeviceLinkDigest(token);
    const link = (await read(`ownerDeviceLinks/${digest}`)) as OwnerDeviceLink | null;
    const now = await context.serverNow();

    requireValue(
      link &&
        link.purpose === 'owner-device' &&
        link.ownerUid === human.uid &&
        human.provider === 'google.com' &&
        link.targetDeviceUid === context.deviceUid,
      'OWNER_LINK_BINDING_MISMATCH',
    );
    requireValue(
      link.status === 'pending' && link.issuedAt <= now && now < link.expiresAt,
      'OWNER_LINK_UNAVAILABLE',
    );
    requireRecentAuthentication(human.authenticatedAt, now);

    const previous = (await read(
      `ownerDeviceLinkReaders/${context.deviceUid}/${link.operationId}`,
    )) as Reader | null;

    if (previous) {
      requireValue(
        previous.linkDigest === digest && previous.storageEpoch === link.storageEpoch,
        'OWNER_LINK_RESULT_MISMATCH',
      );

      return previous;
    }

    await context.refreshProof();

    const reader = {
      schemaVersion: 1,
      environmentId: link.environmentId,
      performanceId: link.performanceId,
      operationId: link.operationId,
      linkDigest: digest,
      ownerUid: link.ownerUid,
      targetDeviceUid: context.deviceUid,
      storageEpoch: link.storageEpoch,
      readAt: serverTimestamp(),
    };

    await update(ref(context.deviceDatabase, context.root), {
      [`ownerDeviceLinkReaders/${context.deviceUid}/${link.operationId}`]: reader,
      [`ownerDeviceLinkAudit/${digest}/read`]: makeAudit(link, 'read'),
    });

    return (await read(
      `ownerDeviceLinkReaders/${context.deviceUid}/${link.operationId}`,
    )) as Reader;
  }

  /** 現在の端末が読み取ったリンクの再開用情報を取得する。 */
  async function listReadLinks(): Promise<Reader[]> {
    await context.verify();

    return Object.values(
      (await read(`ownerDeviceLinkReaders/${context.deviceUid}`)) ?? {},
    ) as Reader[];
  }

  /** 未使用リンクと本人証明を確認し、端末承認と結果・監査を一体保存する。 */
  async function approve(operationId: string): Promise<PairingResult> {
    requireValue(isId(operationId), 'INVALID_OPERATION_ID');

    const human = await context.verify();
    const reader = (await read(
      `ownerDeviceLinkReaders/${context.deviceUid}/${operationId}`,
    )) as Reader | null;

    requireValue(
      reader && reader.ownerUid === human.uid && reader.targetDeviceUid === context.deviceUid,
      'OWNER_LINK_READ_REQUIRED',
    );

    const prior = await receipt(operationId);

    if (prior) return prior;

    const link = (await read(`ownerDeviceLinks/${reader.linkDigest}`)) as OwnerDeviceLink;
    const now = await context.serverNow();

    requireValue(
      human.provider === 'google.com' &&
        link &&
        link.status === 'pending' &&
        link.operationId === operationId &&
        link.storageEpoch === reader.storageEpoch &&
        now < link.expiresAt,
      'OWNER_LINK_UNAVAILABLE',
    );
    requireRecentAuthentication(human.authenticatedAt, now);
    await context.refreshProof();

    const device = (await read(`devices/${context.deviceUid}`)) as DeviceGrant;

    requireValue(
      device &&
        device.active === false &&
        device.approved === false &&
        device.retired === false &&
        device.humanUid === human.uid &&
        device.storageEpoch === link.storageEpoch &&
        device.revision === 1,
      'PENDING_OWNER_DEVICE_REQUIRED',
    );

    const result = {
      schemaVersion: 1,
      environmentId: link.environmentId,
      performanceId: link.performanceId,
      operationId,
      linkDigest: reader.linkDigest,
      ownerUid: human.uid,
      issuerDeviceUid: link.issuerDeviceUid,
      targetDeviceUid: context.deviceUid,
      storageEpoch: link.storageEpoch,
      status: 'approved',
      expectedRevision: 1,
      resultingRevision: 2,
      approvedAt: serverTimestamp(),
    };

    await update(ref(context.deviceDatabase, context.root), {
      [`devices/${context.deviceUid}`]: {
        ...device,
        active: true,
        approved: true,
        revision: 2,
        lastOperationId: operationId,
      },
      [`ownerDeviceLinks/${reader.linkDigest}`]: {
        ...link,
        status: 'consumed',
        revision: 2,
        consumedAt: serverTimestamp(),
      },
      [`ownerDeviceLinkResults/${operationId}`]: result,
      [`ownerDeviceLinkAudit/${reader.linkDigest}/approved`]: makeAudit(link, 'approved'),
    });

    const stored = await receipt(operationId);

    requireValue(
      stored &&
        stored.operationId === operationId &&
        stored.status === 'approved' &&
        stored.targetDeviceUid === context.deviceUid &&
        stored.storageEpoch === link.storageEpoch,
      'OWNER_LINK_RESULT_MISMATCH',
    );

    return stored;
  }

  /** 暗号化した操作記録から、発行したリンクの現在状態を照会する。 */
  async function issued(
    operationId: string,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<{ digest: string; link: OwnerDeviceLink }> {
    const saved = (await journal.read(operationId, assertAuthorized)) as {
      kind: string;
      digest: string;
    } | null;

    requireValue(saved?.kind === 'ownerDeviceLink', 'FIXED_OPERATION_REQUIRED');
    await context.verify();

    const link = (await read(`ownerDeviceLinks/${saved.digest}`)) as OwnerDeviceLink;

    requireValue(link && link.operationId === operationId, 'OWNER_LINK_RESULT_MISMATCH');

    return { digest: saved.digest, link };
  }

  /** 発行済みの未使用リンクを取り消し、監査と一体保存する。 */
  async function cancel(
    operationId: string,
    journal: AuthorizationOperationJournal,
    assertAuthorized: () => void,
  ): Promise<void> {
    const { digest, link } = await issued(operationId, journal, assertAuthorized);

    requireValue(link.status === 'pending', 'OWNER_LINK_UNAVAILABLE');
    assertAuthorized();
    await update(ref(context.deviceDatabase, context.root), {
      [`ownerDeviceLinks/${digest}`]: {
        ...link,
        status: 'cancelled',
        revision: 2,
        cancelledAt: serverTimestamp(),
      },
      [`ownerDeviceLinkAudit/${digest}/cancelled`]: makeAudit(link, 'cancelled'),
    });
  }

  /** 期限を過ぎたリンクについて、期限切れの監査を記録する。 */
  async function recordExpired(digest: string): Promise<void> {
    requireValue(/^[0-9a-f]{64}$/.test(digest), 'INVALID_LINK_DIGEST');
    await context.verify();

    const link = (await read(`ownerDeviceLinks/${digest}`)) as OwnerDeviceLink;

    requireValue(
      link && link.status === 'pending' && (await context.serverNow()) >= link.expiresAt,
      'OWNER_LINK_NOT_EXPIRED',
    );

    if (!(await read(`ownerDeviceLinkAudit/${digest}/expired`)))
      await update(ref(context.deviceDatabase, context.root), {
        [`ownerDeviceLinkAudit/${digest}/expired`]: makeAudit(link, 'expired'),
      });
  }

  /** 固定の理由区分で、リンク拒否の監査を記録する。 */
  async function recordRejection(digest: string, reasonCode: string): Promise<void> {
    requireValue(
      /^[0-9a-f]{64}$/.test(digest) &&
        [
          'identity_mismatch',
          'expired',
          'stopped',
          'scope_mismatch',
          'cancelled',
          'already_used',
          'permission_denied',
          'unknown',
        ].includes(reasonCode),
      'INVALID_LINK_DIAGNOSTIC',
    );
    await context.verify();

    const link = (await read(`ownerDeviceLinks/${digest}`)) as OwnerDeviceLink;

    requireValue(link, 'OWNER_LINK_MISSING');

    // 認証エラーの本文には資格情報が含まれ得るため、記録は固定の診断区分だけにする。
    if (!(await read(`ownerDeviceLinkAudit/${digest}/rejected`)))
      await update(ref(context.deviceDatabase, context.root), {
        [`ownerDeviceLinkAudit/${digest}/rejected`]: { ...makeAudit(link, 'rejected'), reasonCode },
      });
  }

  return {
    issue,
    readToken,
    listReadLinks,
    approve,
    receipt,
    issued,
    cancel,
    recordExpired,
    recordRejection,
  };
}
