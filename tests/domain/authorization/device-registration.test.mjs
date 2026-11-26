import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeviceRegistrationRequest,
  bindRegisteredHuman,
  createOwnerDeviceToken,
  ownerDeviceLinkDigest,
  takeOwnerDeviceToken,
} from '../../../src/domain/authorization/device-registration.ts';
import { now, scope, snapshot } from './fixtures.mjs';

test('AUTH110-T08 仮登録は権限を付けず、同じ本人・端末・保存領域へだけ更新する', () => {
  const current = snapshot('receptionist');
  const first = createDeviceRegistrationRequest(
    scope,
    current.deviceAuthUid,
    current.role.humanUid,
    current.device.storageEpoch,
    now,
  );
  const identity = {
    uid: current.role.humanUid,
    emailVerified: true,
    provider: 'password',
    authenticatedAt: now - 1000,
  };
  const bound = bindRegisteredHuman(first, identity, current.role, now);
  assert.equal(bound.device.approved, false);
  assert.equal(bound.device.active, false);
  assert.equal(bound.device.preparedRoleRevision, 0);
  assert.equal(bound.proof.roleRevision, 1);
  const renewed = createDeviceRegistrationRequest(
    scope,
    current.deviceAuthUid,
    current.role.humanUid,
    first.storageEpoch,
    now,
    first,
  );
  assert.equal(renewed.revision, 2);
  assert.equal(renewed.storageEpoch, first.storageEpoch);
  assert.throws(() =>
    createDeviceRegistrationRequest(
      scope,
      current.deviceAuthUid,
      'other-human',
      first.storageEpoch,
      now,
      first,
    ),
  );
  for (const patch of [{ uid: 'other' }, { emailVerified: false }, { provider: 'google.com' }]) {
    assert.throws(() => bindRegisteredHuman(first, { ...identity, ...patch }, current.role, now));
  }
  assert.throws(() => bindRegisteredHuman(first, identity, current.role, first.expiresAt));
});

test('AUTH110-T09 管理者の登録にはGoogleの最近の本人確認を必要とする', () => {
  const current = snapshot();
  const request = createDeviceRegistrationRequest(
    scope,
    current.deviceAuthUid,
    current.role.humanUid,
    current.device.storageEpoch,
    now,
  );
  const identity = {
    uid: current.role.humanUid,
    emailVerified: true,
    provider: 'google.com',
    authenticatedAt: now - 900000,
  };
  bindRegisteredHuman(request, identity, current.role, now);
  assert.throws(() =>
    bindRegisteredHuman(request, { ...identity, authenticatedAt: now - 900001 }, current.role, now),
  );
});

test('AUTH110-T10 追加端末用の乱数をダイジェストへ変換し、URLの履歴から先に除く', async () => {
  const { token, digest } = await createOwnerDeviceToken();
  assert.equal(token.length, 43);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(await ownerDeviceLinkDigest(token), digest);
  let stripped = 0;
  assert.equal(
    takeOwnerDeviceToken(
      new URL('https://example.invalid/#owner-device-link=' + token),
      () => stripped++,
    ),
    token,
  );
  assert.equal(stripped, 1);
  assert.throws(() =>
    takeOwnerDeviceToken(
      new URL('https://example.invalid/#owner-device-link=bad'),
      () => stripped++,
    ),
  );
  assert.equal(stripped, 2);
  await assert.rejects(ownerDeviceLinkDigest('bad'));
});
