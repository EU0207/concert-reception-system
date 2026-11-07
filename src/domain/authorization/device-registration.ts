// 端末の仮登録・本人証明と追加端末リンクの型を定め、登録の判定とトークン処理を行う。

import type { Scope } from '../seats/types.ts';
import type { DeviceGrant, HumanIdentity, RoleGrant } from './types.ts';
import { checkScope, isId, nonnegative, positive, requireValue } from '../seats/validation.ts';
import {
  providerFor,
  requireRecentAuthentication,
  validUid,
  RECENT_AUTH_WINDOW,
} from './policy.ts';

// # 本文：登録の型・本人確認とトークン処理

export const REGISTRATION_LIFETIME = 15 * 60 * 1000;
// 独立した期限設定を増やさないよう、承認済みの再認証15分をリンクの上限にも使う。
export const OWNER_DEVICE_LINK_LIFETIME = RECENT_AUTH_WINDOW;

export interface DeviceRegistrationRequest extends Scope {
  schemaVersion: 1;
  deviceUid: string;
  humanUid: string;
  storageEpoch: string;
  revision: number;
  requestedAt: number;
  expiresAt: number;
}
export interface DeviceRegistrationProof extends Scope {
  schemaVersion: 1;
  deviceUid: string;
  humanUid: string;
  storageEpoch: string;
  roleRevision: number;
  authProvider: HumanIdentity['provider'];
  emailVerified: true;
  humanAuthTime: number;
  issuedAt: number;
  revision: number;
}
export interface OwnerDeviceLink extends Scope {
  schemaVersion: 1;
  operationId: string;
  purpose: 'owner-device';
  ownerUid: string;
  ownerRoleRevision: number;
  issuerDeviceUid: string;
  targetDeviceUid: string;
  storageEpoch: string;
  issuedAt: number;
  expiresAt: number;
  status: 'pending' | 'consumed' | 'cancelled';
  revision: number;
  consumedAt?: number;
  cancelledAt?: number;
}

/** 本人・端末と保存領域を結んだ、期限付きの仮登録を作る。 */
export function createDeviceRegistrationRequest(
  scope: Scope,
  deviceUid: string,
  humanUid: string,
  storageEpoch: string,
  now: number,
  previous: DeviceRegistrationRequest | null = null,
): DeviceRegistrationRequest {
  // 一度結んだ本人・保存領域を取り替えると旧記録の主体がずれるため、更新でも固定する。

  requireValue(
    isId(scope.environmentId) &&
      isId(scope.performanceId) &&
      isId(storageEpoch) &&
      validUid(deviceUid) &&
      validUid(humanUid) &&
      deviceUid !== humanUid &&
      nonnegative(now),
    'INVALID_DEVICE_REGISTRATION',
  );

  if (previous) {
    checkScope(previous, scope);
    requireValue(
      previous.schemaVersion === 1 &&
        previous.deviceUid === deviceUid &&
        previous.humanUid === humanUid &&
        previous.storageEpoch === storageEpoch &&
        positive(previous.revision),
      'REGISTRATION_BINDING_MISMATCH',
    );
  }

  const revision = (previous?.revision ?? 0) + 1;

  requireValue(
    positive(revision) && positive(now + REGISTRATION_LIFETIME),
    'REGISTRATION_REVISION_OVERFLOW',
  );

  return {
    ...scope,
    schemaVersion: 1,
    deviceUid,
    humanUid,
    storageEpoch,
    revision,
    requestedAt: now,
    expiresAt: now + REGISTRATION_LIFETIME,
  };
}

/** 現在役割と本人確認を照合し、承認待ち端末と本人証明を作る。 */
export function bindRegisteredHuman(
  request: DeviceRegistrationRequest,
  identity: HumanIdentity,
  role: RoleGrant,
  now: number,
  previous: DeviceRegistrationProof | null = null,
): {
  device: DeviceGrant;
  proof: DeviceRegistrationProof;
} {
  // 匿名端末の仮登録は本人を証明しないため、確認済みの本人Authで別の証跡を作る。

  checkScope(role, request);
  requireValue(
    request.schemaVersion === 1 &&
      nonnegative(request.requestedAt) &&
      request.requestedAt <= now &&
      now < request.expiresAt &&
      request.expiresAt <= request.requestedAt + REGISTRATION_LIFETIME,
    'REGISTRATION_EXPIRED',
  );
  requireValue(
    identity.uid === request.humanUid &&
      role.humanUid === identity.uid &&
      role.active === true &&
      positive(role.revision) &&
      role.startsAt <= now &&
      now < role.endsAt &&
      identity.emailVerified === true &&
      identity.provider === providerFor(role.role) &&
      nonnegative(identity.authenticatedAt) &&
      identity.authenticatedAt <= now,
    'REGISTRATION_HUMAN_REQUIRED',
  );

  if (role.role === 'owner') requireRecentAuthentication(identity.authenticatedAt, now);
  if (previous) {
    checkScope(previous, request);
    requireValue(
      previous.deviceUid === request.deviceUid &&
        previous.humanUid === identity.uid &&
        previous.storageEpoch === request.storageEpoch &&
        positive(previous.revision),
      'REGISTRATION_BINDING_MISMATCH',
    );
  }

  const revision = (previous?.revision ?? 0) + 1;

  requireValue(positive(revision), 'REGISTRATION_REVISION_OVERFLOW');

  const device: DeviceGrant = {
    environmentId: request.environmentId,
    performanceId: request.performanceId,
    schemaVersion: 2,
    deviceUid: request.deviceUid,
    humanUid: identity.uid,
    storageEpoch: request.storageEpoch,
    active: false,
    approved: false,
    retired: false,
    preparedRole: null,
    preparedRoleRevision: 0,
    revision: 1,
  };
  const proof: DeviceRegistrationProof = {
    environmentId: request.environmentId,
    performanceId: request.performanceId,
    schemaVersion: 1,
    deviceUid: request.deviceUid,
    humanUid: identity.uid,
    storageEpoch: request.storageEpoch,
    roleRevision: role.revision,
    authProvider: identity.provider,
    emailVerified: true,
    humanAuthTime: identity.authenticatedAt,
    issuedAt: now,
    revision,
  };

  return { device, proof };
}

/** 32バイトのトークンを、URLで使えるBase64url文字列へ変換する。 */
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** トークンの形式を確認し、照合用のSHA-256値を作る。 */
export async function ownerDeviceLinkDigest(token: string): Promise<string> {
  requireValue(/^[A-Za-z0-9_-]{43}$/.test(token), 'INVALID_OWNER_DEVICE_TOKEN');

  const decoded = Uint8Array.from(
    atob(token.replaceAll('-', '+').replaceAll('_', '/') + '='),
    (char) => char.charCodeAt(0),
  );

  requireValue(decoded.length === 32 && encode(decoded) === token, 'INVALID_OWNER_DEVICE_TOKEN');

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 推測困難なトークンと、保存用の照合値を生成する。 */
export async function createOwnerDeviceToken(): Promise<{ token: string; digest: string }> {
  const token = encode(crypto.getRandomValues(new Uint8Array(32)));

  return { token, digest: await ownerDeviceLinkDigest(token) };
}

/** 追加端末リンクからトークンを取り出し、URLの断片を除去する。 */
export function takeOwnerDeviceToken(url: URL, stripFragment: () => void): string | null {
  if (!url.hash.startsWith('#owner-device-link=')) return null;

  const token = url.hash.slice('#owner-device-link='.length);

  stripFragment();
  requireValue(/^[A-Za-z0-9_-]{43}$/.test(token), 'INVALID_OWNER_DEVICE_TOKEN');

  return token;
}
