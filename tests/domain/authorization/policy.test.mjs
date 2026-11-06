import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeOnline,
  authorizeOffline,
  createPersonSession,
  offlineDeadline,
  requireRecentAuthentication,
  TEMPORARY_PERMISSIONS,
  MANAGEMENT_OPERATIONS,
} from '../../../src/domain/authorization/index.ts';

const now = Date.parse('2026-11-06T00:00:00Z');
const scope = {
  environmentId: '00000000-0000-4000-8000-000000000001',
  performanceId: '00000000-0000-4000-8000-000000000002',
};

function snapshot(role = 'owner') {
  return {
    ...scope,
    deviceAuthUid: 'fictional-device-a',
    state: 'operating',
    staffDeadline: now + 172800000,
    role: {
      ...scope,
      humanUid: 'fictional-human',
      role,
      active: true,
      revision: 1,
      startsAt: now - 1000,
      endsAt: now + 172800000,
    },
    device: {
      ...scope,
      schemaVersion: 2,
      deviceUid: 'fictional-device-a',
      humanUid: 'fictional-human',
      active: true,
      approved: true,
      retired: false,
      storageEpoch: '00000000-0000-4000-8000-000000000003',
      preparedRole: role,
      preparedRoleRevision: 1,
    },
    session: {
      ...scope,
      schemaVersion: 2,
      deviceUid: 'fictional-device-a',
      humanUid: 'fictional-human',
      active: true,
      emailVerified: true,
      authProvider: ['owner', 'deputy'].includes(role) ? 'google.com' : 'password',
      roleRevision: 1,
      revision: 1,
      issuedAt: now - 1000,
      expiresAt: now + 3600000,
      humanAuthTime: now - 1000,
    },
    temporaryProfile: {
      schemaVersion: 1,
      humanUid: 'fictional-human',
      roleVersion: 1,
      status: 'active',
      validFrom: now - 1000,
      validUntil: now + 86400000,
      permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, true])),
    },
  };
}

test('AUTH110-T01 本人・端末を分け、別環境・別公演・自己申告と停止を拒否する', () => {
  authorizeOnline(snapshot(), 'editAssignments', now);
  for (const mutate of [
    (s) => {
      s.deviceAuthUid = s.role.humanUid;
    },
    (s) => {
      s.deviceAuthUid = 'fictional-device-b';
    },
    (s) => {
      s.device.humanUid = 'other-human';
    },
    (s) => {
      s.session.humanUid = 'other-human';
    },
    (s) => {
      s.role.environmentId = s.role.performanceId;
    },
    (s) => {
      s.session.performanceId = s.session.environmentId;
    },
    (s) => {
      s.role.active = false;
    },
    (s) => {
      s.device.active = false;
    },
    (s) => {
      s.device.approved = false;
    },
    (s) => {
      s.device.retired = true;
    },
    (s) => {
      s.session.active = false;
    },
    (s) => {
      s.session.emailVerified = false;
    },
    (s) => {
      s.session.authProvider = 'password';
    },
    (s) => {
      s.session.expiresAt = now;
    },
    (s) => {
      s.role.endsAt = now;
    },
    (s) => {
      s.role.startsAt = now + 1;
    },
    (s) => {
      s.device.preparedRoleRevision = 0;
    },
  ]) {
    const current = snapshot();
    mutate(current);
    assert.throws(() => authorizeOnline(current, 'editAssignments', now));
    authorizeOnline(snapshot(), 'editAssignments', now);
  }
});

test('AUTH110-T02 再認証15分ちょうどは有効。超過と未来を拒否する', () => {
  requireRecentAuthentication(now - 900000, now);
  assert.throws(() => requireRecentAuthentication(now - 900001, now));
  assert.throws(() => requireRecentAuthentication(now + 1, now));
  const stale = snapshot();
  stale.session.humanAuthTime = now - 900001;
  stale.session.issuedAt = now - 900001;
  assert.throws(() => authorizeOnline(stale, 'manageRoles', now));
  authorizeOnline(stale, 'receptionRead', now);
});

test('DD98-T03・04 全512設定を個別に判定し、固定の禁止操作を迂回させない', () => {
  for (let mask = 0; mask < 512; mask++) {
    const current = snapshot('temporary');
    TEMPORARY_PERMISSIONS.forEach((key, index) => {
      current.temporaryProfile.permissions[key] = Boolean(mask & (1 << index));
    });
    for (const key of TEMPORARY_PERMISSIONS) {
      if (current.temporaryProfile.permissions[key]) authorizeOnline(current, key, now);
      else assert.throws(() => authorizeOnline(current, key, now));
    }
    for (const key of MANAGEMENT_OPERATIONS)
      assert.throws(() => authorizeOnline(current, key, now));
    authorizeOnline(current, 'qrReception', now);
  }
});

test('DD98-T02・08・09 プロファイルの欠落・余分なキー・期限切れで権限を補わない', () => {
  for (const mutate of [
    (s) => {
      delete s.temporaryProfile;
    },
    (s) => {
      delete s.temporaryProfile.permissions.manualReception;
    },
    (s) => {
      s.temporaryProfile.permissions.unknown = true;
    },
    (s) => {
      s.temporaryProfile.validUntil = now;
    },
    (s) => {
      s.temporaryProfile.validFrom = now + 1;
    },
    (s) => {
      s.temporaryProfile.roleVersion = 2;
    },
    (s) => {
      s.temporaryProfile.status = 'revoked';
    },
  ]) {
    const current = snapshot('temporary');
    mutate(current);
    assert.throws(() => authorizeOnline(current, 'manualReception', now));
    authorizeOnline(current, 'qrReception', now);
  }
});

test('DD96-T11・DD98-T10 追加準備前は旧一般受付範囲だけ残し、他端末へ流用しない', () => {
  const current = snapshot('temporary');
  current.role.revision = 2;
  current.device.preparedRole = 'receptionist';
  authorizeOnline(current, 'qrReception', now);
  assert.throws(() => authorizeOnline(current, 'manualReception', now));
  current.device.preparedRole = 'deputy';
  assert.throws(() => authorizeOnline(current, 'qrReception', now));
  const deputy = snapshot('deputy');
  assert.throws(() => authorizeOnline(deputy, 'handoverOwner', now));
});

test('AUTH110-T03 本人の確認値からだけセッションを作り、UIDと版を維持する', () => {
  const current = snapshot();
  const identity = {
    uid: current.role.humanUid,
    emailVerified: true,
    provider: 'google.com',
    authenticatedAt: now,
  };
  const first = createPersonSession(current, identity, now, now + 60000);
  assert.equal(first.revision, 1);
  assert.equal(first.deviceUid, current.device.deviceUid);
  assert.equal(createPersonSession(current, identity, now, now + 60000, first).revision, 2);
  for (const patch of [
    { uid: 'wrong-human' },
    { emailVerified: false },
    { provider: 'password' },
    { authenticatedAt: now + 1 },
  ]) {
    assert.throws(() => createPersonSession(current, { ...identity, ...patch }, now, now + 60000));
  }
  assert.throws(() => createPersonSession(current, identity, now, now + 43200001));
});

test('AUTH110-T04 オフライン許可は本人・公演・端末と版に結び、管理操作を拒否する', () => {
  const current = snapshot('receptionist');
  const permit = {
    ...scope,
    deviceUid: current.device.deviceUid,
    humanUid: current.role.humanUid,
    storageEpoch: current.device.storageEpoch,
    roleRevision: 1,
    issuedAt: now - 1000,
    expiresAt: now + 86400000,
    appVersion: '0.1.0',
    dataRevision: 1,
  };
  const later = now + 50000000;
  authorizeOffline(current, permit, current.role.humanUid, 'qrReception', later, '0.1.0');
  assert.throws(() => authorizeOnline(current, 'qrReception', later));
  for (const patch of [
    { expiresAt: later },
    { roleRevision: 2 },
    { performanceId: scope.environmentId },
    { deviceUid: 'another-device' },
    { storageEpoch: scope.performanceId },
    { appVersion: 'other' },
  ]) {
    assert.throws(() =>
      authorizeOffline(
        current,
        { ...permit, ...patch },
        current.role.humanUid,
        'qrReception',
        later,
        '0.1.0',
      ),
    );
  }
  assert.throws(() =>
    authorizeOffline(current, permit, 'wrong-human', 'qrReception', later, '0.1.0'),
  );
  assert.throws(() =>
    authorizeOffline(current, permit, current.role.humanUid, 'manageRoles', now, '0.1.0'),
  );
  current.state = 'ended';
  assert.throws(() =>
    authorizeOffline(current, permit, current.role.humanUid, 'qrReception', now, '0.1.0'),
  );
  authorizeOffline(current, permit, current.role.humanUid, 'ownResultRead', now, '0.1.0');
});

test('AUTH110-T05 会場の翌日終了を、夏時間と年・月の境界を含めて計算する', () => {
  assert.equal(offlineDeadline('2026-11-06', 'Asia/Tokyo'), Date.parse('2026-11-07T15:00:00Z'));
  assert.equal(
    offlineDeadline('2026-03-07', 'America/New_York'),
    Date.parse('2026-03-09T04:00:00Z'),
  );
  assert.equal(
    offlineDeadline('2026-10-31', 'America/New_York'),
    Date.parse('2026-11-02T05:00:00Z'),
  );
  assert.equal(offlineDeadline('2026-12-31', 'UTC'), Date.parse('2027-01-02T00:00:00Z'));
  assert.throws(() => offlineDeadline('2026-02-30', 'Asia/Tokyo'));
  assert.throws(() => offlineDeadline('2026-11-06', 'not-a-zone'));
});
