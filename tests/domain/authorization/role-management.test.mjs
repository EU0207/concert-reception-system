import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoleChangeRequest,
  createGoogleAcceptance,
  commitRoleChange,
  changeTemporaryPermissions,
  TEMPORARY_PERMISSIONS,
} from '../../../src/domain/authorization/index.ts';
import { now, snapshot } from './fixtures.mjs';

const operationId = '00000000-0000-4000-8000-000000000004';
const input = (nextRole) => ({
  operationId,
  expectedRevision: 1,
  nextRole,
  startsAt: now,
  endsAt: now + 86400000,
});
const target = (role) => ({
  ...snapshot(role).role,
  humanUid: 'fictional-target',
});

test('DD96-T01・02 主担当の6方向と代理の2方向だけを許可する', () => {
  const roles = ['owner', 'deputy', 'temporary', 'receptionist'];
  let allowed = 0;
  for (const actorRole of roles)
    for (const from of roles)
      for (const to of roles) {
        const actor = snapshot(actorRole);
        const permitted =
          from !== to &&
          from !== 'owner' &&
          to !== 'owner' &&
          (actorRole === 'owner' ||
            (actorRole === 'deputy' &&
              [from, to].every((role) => role === 'temporary' || role === 'receptionist')));
        if (permitted) {
          createRoleChangeRequest(actor, target(from), input(to), now);
          allowed++;
        } else assert.throws(() => createRoleChangeRequest(actor, target(from), input(to), now));
      }
  assert.equal(allowed, 8);
});

test('DD96-T03～07 代理への昇格には同じUID・変更案・版のGoogle証跡を求める', () => {
  const actor = snapshot(),
    person = target('receptionist');
  const request = createRoleChangeRequest(actor, person, input('deputy'), now);
  const identity = {
    uid: person.humanUid,
    emailVerified: true,
    provider: 'google.com',
    authenticatedAt: now - 900000,
  };
  const acceptance = createGoogleAcceptance(request, identity, now);
  assert.equal(commitRoleChange(actor, person, request, acceptance, now).role.revision, 2);
  assert.throws(() => commitRoleChange(actor, person, request, null, now));
  for (const patch of [
    { uid: 'other' },
    { provider: 'password' },
    { emailVerified: false },
    { authenticatedAt: now - 900001 },
    { authenticatedAt: now + 1 },
  ]) {
    assert.throws(() => createGoogleAcceptance(request, { ...identity, ...patch }, now));
  }
  for (const patch of [
    { operationId: person.performanceId },
    { targetUid: 'other' },
    { expectedRevision: 2 },
    { authenticatedAt: now - 900001 },
  ]) {
    assert.throws(() => commitRoleChange(actor, person, request, { ...acceptance, ...patch }, now));
  }
  const inactive = snapshot();
  inactive.device.active = false;
  assert.throws(() => commitRoleChange(inactive, person, request, acceptance, now));
  assert.throws(() =>
    commitRoleChange(actor, { ...person, revision: 2 }, request, acceptance, now),
  );
  assert.throws(() =>
    commitRoleChange(
      actor,
      person,
      { ...request, actorDeviceUid: 'other-device' },
      acceptance,
      now,
    ),
  );
});

test('DD98-T01・02 臨時への任命では役割と9項目を一体の案にし、元入力を変えない', () => {
  const actor = snapshot('deputy'),
    person = target('receptionist');
  const before = structuredClone(person);
  const request = createRoleChangeRequest(actor, person, input('temporary'), now);
  const plan = commitRoleChange(actor, person, request, null, now);
  assert.deepEqual(person, before);
  assert.equal(plan.role.humanUid, person.humanUid);
  assert.equal(plan.role.revision, 2);
  assert.equal(plan.profile.roleVersion, 2);
  assert.equal(Object.values(plan.profile.permissions).every(Boolean), true);
  assert.equal(plan.result.operationId, operationId);
  assert.equal(plan.result.resultingRevision, 2);
  const missing = Object.fromEntries(TEMPORARY_PERMISSIONS.slice(1).map((key) => [key, true]));
  assert.throws(() => commitRoleChange(actor, person, request, null, now, missing));
});

test('DD98-T05・08・09・17 設定取消しは新しい全OFF版を作り、期間・版・再認証を検査する', () => {
  const actor = snapshot(),
    person = target('temporary');
  const permissions = Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, true]));
  const command = {
    operationId,
    expectedRevision: 1,
    revoke: true,
    validFrom: now,
    validUntil: now + 60000,
    permissions,
  };
  const plan = changeTemporaryPermissions(actor, person, command, now);
  assert.equal(plan.profile.status, 'revoked');
  assert.equal(Object.values(plan.profile.permissions).some(Boolean), false);
  assert.equal(plan.role.role, 'temporary');
  assert.equal(plan.role.revision, 2);
  assert.equal(Object.values(command.permissions).every(Boolean), true);
  for (const patch of [
    { expectedRevision: 2 },
    { validFrom: now - 100000 },
    { validUntil: now },
    { validUntil: person.endsAt + 1 },
    { permissions: { ...permissions, extra: true } },
  ]) {
    assert.throws(() => changeTemporaryPermissions(actor, person, { ...command, ...patch }, now));
  }
  const stale = snapshot();
  stale.session.humanAuthTime = now - 900001;
  stale.session.issuedAt = now - 900001;
  assert.throws(() => changeTemporaryPermissions(stale, person, command, now));
  assert.throws(() => changeTemporaryPermissions(actor, target('deputy'), command, now));
  assert.throws(() => changeTemporaryPermissions(snapshot('temporary'), person, command, now));
});
