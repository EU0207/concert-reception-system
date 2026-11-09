// 新しい製品Rulesをローカルだけで確認する。既存PoCのシナリオは実行しない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TEMPORARY_PERMISSIONS } from '../../src/domain/authorization/types.ts';
import { createAuthorizationAudit } from '../../src/domain/authorization/role-management.ts';
import { changeTemporaryPermissions } from '../../src/domain/authorization/role-management.ts';
import { cancelAuthorizationChange } from '../../src/domain/authorization/role-management.ts';
import { createOwnerDeviceToken } from '../../src/domain/authorization/device-registration.ts';

const project = 'demo-concert-reception-product';
const namespace = project + '-default-rtdb';
const environmentId = '00000000-0000-4000-8000-000000000001';
const performanceId = '00000000-0000-4000-8000-000000000002';
const root = `environments/${environmentId}/performances/${performanceId}`;
const scope = { environmentId, performanceId };

async function request(path, method = 'GET', body, token = 'owner') {
  const url = new URL(`http://127.0.0.1:9100/${path}.json`);
  url.searchParams.set('ns', namespace);
  if (token && token !== 'owner') url.searchParams.set('auth', token);
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === 'owner' ? { authorization: 'Bearer owner' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}

async function auth(provider = 'password', verified = true) {
  const post = async (path, body, admin = false) => {
    const response = await fetch(
      `http://127.0.0.1:9291/identitytoolkit.googleapis.com/v1/${path}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(admin ? { authorization: 'Bearer owner' } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    assert.equal(response.status, 200);
    return response.json();
  };
  const email = `fictional-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'A7!';
  let result;
  if (provider === 'anonymous')
    result = await post('accounts:signUp?key=demo-key', {
      returnSecureToken: true,
    });
  else if (provider === 'google.com')
    result = await post('accounts:signInWithIdp?key=demo-key', {
      requestUri: 'http://localhost',
      postBody: new URLSearchParams({
        providerId: provider,
        id_token: JSON.stringify({
          sub: randomUUID(),
          email,
          email_verified: verified,
        }),
      }).toString(),
      returnSecureToken: true,
    });
  else {
    result = await post('accounts:signUp?key=demo-key', {
      email,
      password,
      returnSecureToken: true,
    });
    if (verified) {
      await post(
        `projects/${project}/accounts:update`,
        { localId: result.localId, emailVerified: true },
        true,
      );
      result = await post('accounts:signInWithPassword?key=demo-key', {
        email,
        password,
        returnSecureToken: true,
      });
    }
  }
  const claims = JSON.parse(Buffer.from(result.idToken.split('.')[1], 'base64url').toString());
  assert.equal(claims.aud, project);
  return {
    uid: result.localId,
    token: result.idToken,
    authTime: claims.auth_time * 1000,
  };
}

async function fixture(
  role = 'owner',
  humanProvider = role === 'owner' || role === 'deputy' ? 'google.com' : 'password',
) {
  const human = await auth(humanProvider),
    device = await auth('anonymous'),
    now = Date.now();
  const grant = {
    ...scope,
    humanUid: human.uid,
    role,
    active: true,
    revision: 1,
    startsAt: now - 10000,
    endsAt: now + 86400000,
  };
  const registration = {
    ...scope,
    schemaVersion: 2,
    humanUid: human.uid,
    deviceUid: device.uid,
    active: true,
    approved: true,
    retired: false,
    storageEpoch: randomUUID(),
    preparedRole: role,
    preparedRoleRevision: 1,
  };
  assert.equal((await request(`${root}/roles/${human.uid}`, 'PUT', grant)).status, 200);
  assert.equal((await request(`${root}/devices/${device.uid}`, 'PUT', registration)).status, 200);
  assert.equal(
    (
      await request(`${root}/control`, 'PUT', {
        ...scope,
        state: 'operating',
        staffDeadline: now + 86400000,
      })
    ).status,
    200,
  );
  const session = {
    ...scope,
    schemaVersion: 2,
    humanUid: human.uid,
    deviceUid: device.uid,
    active: true,
    emailVerified: true,
    authProvider: humanProvider,
    roleRevision: 1,
    revision: 1,
    issuedAt: { '.sv': 'timestamp' },
    expiresAt: now + 3600000,
    humanAuthTime: human.authTime,
  };
  return { human, device, grant, registration, session };
}

test('AUTH110-R01 本人だけが証跡を作り、結合された端末で状態を取得する', async () => {
  const f = await fixture();
  assert.equal(
    (await request(`${root}/sessions/${f.device.uid}`, 'PUT', f.session, f.human.token)).status,
    200,
  );
  assert.equal((await request(`${root}/control`, 'GET', undefined, f.device.token)).status, 200);
  assert.equal((await request(`${root}/control`, 'GET', undefined, f.human.token)).status, 401);
  assert.equal((await request(root, 'GET', undefined, f.device.token)).status, 401);
  assert.equal((await request(`${root}/event`, 'GET', undefined, f.device.token)).status, 401);
});

test('AUTH110-R02 端末・別本人・未確認メールによる証跡作成を拒否する', async () => {
  const f = await fixture(),
    other = await auth(),
    unverified = await auth('password', false);
  for (const token of [f.device.token, other.token, unverified.token]) {
    assert.equal(
      (await request(`${root}/sessions/${f.device.uid}`, 'PUT', f.session, token)).status,
      401,
    );
  }
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        'PUT',
        { ...f.session, humanUid: other.uid },
        other.token,
      )
    ).status,
    401,
  );
});

test('AUTH110-R03 型・余分なキー・認証時刻・版・削除と部分要求を拒否する', async () => {
  const f = await fixture();
  for (const patch of [
    { schemaVersion: 1 },
    { environmentId: performanceId },
    { performanceId: environmentId },
    { deviceUid: f.human.uid },
    { active: false },
    { emailVerified: false },
    { authProvider: 'password' },
    { roleRevision: 2 },
    { revision: 2 },
    { humanAuthTime: f.human.authTime + 1000 },
    { issuedAt: 0 },
    { expiresAt: Date.now() - 1 },
    { expiresAt: Date.now() + 43260000 },
    { unexpected: true },
  ])
    assert.equal(
      (
        await request(
          `${root}/sessions/${f.device.uid}`,
          'PUT',
          { ...f.session, ...patch },
          f.human.token,
        )
      ).status,
      401,
    );
  assert.equal(
    (await request(`${root}/sessions/${f.device.uid}`, 'PUT', f.session, f.human.token)).status,
    200,
  );
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}/emailVerified`,
        'DELETE',
        undefined,
        f.human.token,
      )
    ).status,
    401,
  );
  assert.equal(
    (await request(`${root}/sessions/${f.device.uid}`, 'DELETE', undefined, f.human.token)).status,
    401,
  );
});

test('AUTH110-R04 停止Aと期限切れを拒否し、同じ本人のBは継続できる', async () => {
  const a = await fixture(),
    bDevice = await auth('anonymous');
  const registration = { ...a.registration, deviceUid: bDevice.uid };
  await request(`${root}/devices/${bDevice.uid}`, 'PUT', registration);
  for (const device of [a.device, bDevice]) {
    assert.equal(
      (
        await request(
          `${root}/sessions/${device.uid}`,
          'PUT',
          { ...a.session, deviceUid: device.uid },
          a.human.token,
        )
      ).status,
      200,
    );
  }
  await request(`${root}/devices/${a.device.uid}/active`, 'PUT', false);
  assert.equal((await request(`${root}/control`, 'GET', undefined, a.device.token)).status, 401);
  assert.equal((await request(`${root}/control`, 'GET', undefined, bDevice.token)).status, 200);
  assert.equal(
    (await request(`${root}/devices/${a.device.uid}/active`, 'PUT', true, a.device.token)).status,
    401,
  );
  await request(`${root}/sessions/${bDevice.uid}/expiresAt`, 'PUT', Date.now() - 1);
  assert.equal((await request(`${root}/control`, 'GET', undefined, bDevice.token)).status, 401);
});

test('AUTH110-R05 本人による失効を許可し、他の項目の便乗更新を拒否する', async () => {
  const f = await fixture();
  assert.equal(
    (await request(`${root}/sessions/${f.device.uid}`, 'PUT', f.session, f.human.token)).status,
    200,
  );
  const saved = (await request(`${root}/sessions/${f.device.uid}`)).body;
  const revoked = { ...saved, active: false, revision: 2 };
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        'PUT',
        { ...revoked, expiresAt: saved.expiresAt + 1 },
        f.human.token,
      )
    ).status,
    401,
  );
  assert.equal(
    (await request(`${root}/sessions/${f.device.uid}`, 'PUT', revoked, f.human.token)).status,
    200,
  );
  assert.equal((await request(`${root}/control`, 'GET', undefined, f.device.token)).status, 401);
});

test('AUTH110-R06 現在の役割失効と、役割に合わない本人プロバイダーを拒否する', async () => {
  const mismatch = await fixture('deputy', 'password');
  assert.equal(
    (
      await request(
        `${root}/sessions/${mismatch.device.uid}`,
        'PUT',
        mismatch.session,
        mismatch.human.token,
      )
    ).status,
    401,
  );
  const f = await fixture();
  assert.equal(
    (await request(`${root}/sessions/${f.device.uid}`, 'PUT', f.session, f.human.token)).status,
    200,
  );
  await request(`${root}/roles/${f.human.uid}/active`, 'PUT', false);
  assert.equal((await request(`${root}/control`, 'GET', undefined, f.device.token)).status, 401);
  assert.equal(
    (await request(`${root}/roles/${f.human.uid}/active`, 'PUT', true, f.device.token)).status,
    401,
  );
});

async function roleChangeFixture(
  nextRole = 'temporary',
  actorRole = 'owner',
  previousRole = 'receptionist',
) {
  const actor = await fixture(
      actorRole,
      ['owner', 'deputy'].includes(actorRole) ? 'google.com' : 'password',
    ),
    target = await fixture(previousRole, 'google.com');
  const previousProfile =
    previousRole === 'temporary'
      ? {
          schemaVersion: 1,
          humanUid: target.human.uid,
          roleVersion: 1,
          status: 'active',
          validFrom: target.grant.startsAt,
          validUntil: target.grant.endsAt,
          permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, true])),
        }
      : null;
  if (previousProfile)
    await request(
      `${root}/temporaryPermissionProfiles/${target.human.uid}/1`,
      'PUT',
      previousProfile,
    );
  await request(`${root}/sessions/${actor.device.uid}`, 'PUT', actor.session, actor.human.token);
  const operationId = randomUUID(),
    now = Date.now();
  const change = {
    ...scope,
    schemaVersion: 1,
    operationId,
    actorUid: actor.human.uid,
    actorDeviceUid: actor.device.uid,
    targetUid: target.human.uid,
    expectedRevision: 1,
    previousRole,
    nextRole,
    startsAt: now - 1000,
    endsAt: now + 3600000,
    requestedAt: { '.sv': 'timestamp' },
  };
  const after = {
    ...target.grant,
    role: nextRole,
    revision: 2,
    startsAt: change.startsAt,
    endsAt: change.endsAt,
    lastOperationId: operationId,
  };
  const result = {
    ...scope,
    schemaVersion: 1,
    status: 'committed',
    operationId,
    actorUid: actor.human.uid,
    actorDeviceUid: actor.device.uid,
    targetUid: target.human.uid,
    expectedRevision: 1,
    resultingRevision: 2,
    kind: 'roleChange',
    previousRole,
    nextRole,
    committedAt: { '.sv': 'timestamp' },
  };
  const updates = {
    [`roles/${target.human.uid}`]: after,
    [`roleChangeResults/${operationId}`]: result,
  };
  if (nextRole === 'temporary')
    updates[`temporaryPermissionProfiles/${target.human.uid}/2`] = {
      schemaVersion: 1,
      humanUid: target.human.uid,
      roleVersion: 2,
      status: 'active',
      validFrom: after.startsAt,
      validUntil: after.endsAt,
      permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, true])),
    };
  updates[`authorizationAudit/${operationId}`] = createAuthorizationAudit(
    {
      role: after,
      profile: updates[`temporaryPermissionProfiles/${target.human.uid}/2`] ?? null,
      result,
    },
    target.grant,
    previousProfile,
  );
  return { actor, target, operationId, change, after, result, updates };
}

test('DD96-R00 許可表64通りを直接要求し、許可された8方向だけを確定する', async () => {
  const roles = ['owner', 'deputy', 'temporary', 'receptionist'];
  let allowed = 0;
  for (const actor of roles)
    for (const from of roles)
      for (const to of roles) {
        const f = await roleChangeFixture(to, actor, from);
        const permitted =
          from !== to &&
          from !== 'owner' &&
          to !== 'owner' &&
          (actor === 'owner' ||
            (actor === 'deputy' &&
              [from, to].every((role) => role === 'temporary' || role === 'receptionist')));
        const created = await request(
          `${root}/roleChangeRequests/${f.operationId}`,
          'PUT',
          f.change,
          f.actor.device.token,
        );
        assert.equal(created.status, permitted ? 200 : 401, `${actor}:${from}->${to}`);
        if (!permitted) continue;
        if (to === 'deputy')
          await request(
            `${root}/roleChangeAcceptances/${f.operationId}`,
            'PUT',
            {
              ...scope,
              schemaVersion: 1,
              operationId: f.operationId,
              targetUid: f.target.human.uid,
              expectedRevision: 1,
              provider: 'google.com',
              authenticatedAt: f.target.human.authTime,
            },
            f.target.human.token,
          );
        assert.equal(
          (await request(root, 'PATCH', f.updates, f.actor.device.token)).status,
          200,
          `${actor}:${from}->${to}`,
        );
        allowed++;
      }
  assert.equal(allowed, 8);
});

test('DD96-R01・DD98-R01 役割・初回設定・結果・監査を一体確定し、部分送信を拒否する', async () => {
  const f = await roleChangeFixture();
  assert.equal(
    (
      await request(
        `${root}/roleChangeRequests/${f.operationId}`,
        'PUT',
        f.change,
        f.actor.device.token,
      )
    ).status,
    200,
  );
  for (const omitted of Object.keys(f.updates)) {
    const partial = { ...f.updates };
    delete partial[omitted];
    assert.equal(
      (await request(root, 'PATCH', partial, f.actor.device.token)).status,
      401,
      omitted,
    );
  }
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 200);
  assert.equal((await request(`${root}/roles/${f.target.human.uid}`)).body.revision, 2);
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 401);
  assert.equal(
    (
      await request(
        `${root}/roleChangeResults/${f.operationId}`,
        'GET',
        undefined,
        f.actor.device.token,
      )
    ).body.operationId,
    f.operationId,
  );
  for (const path of Object.keys(f.updates))
    assert.equal(
      (await request(`${root}/${path}`, 'DELETE', undefined, f.actor.device.token)).status,
      401,
    );
});

test('DD96-R02 Google証跡は対象本人のAuthだけが作り、管理端末の自己申告を拒否する', async () => {
  const f = await roleChangeFixture('deputy');
  assert.equal(
    (
      await request(
        `${root}/roleChangeRequests/${f.operationId}`,
        'PUT',
        f.change,
        f.actor.device.token,
      )
    ).status,
    200,
  );
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 401);
  const acceptance = {
    ...scope,
    schemaVersion: 1,
    operationId: f.operationId,
    targetUid: f.target.human.uid,
    expectedRevision: 1,
    provider: 'google.com',
    authenticatedAt: f.target.human.authTime,
  };
  for (const token of [f.actor.device.token, f.actor.human.token, f.target.device.token]) {
    assert.equal(
      (await request(`${root}/roleChangeAcceptances/${f.operationId}`, 'PUT', acceptance, token))
        .status,
      401,
    );
  }
  assert.equal(
    (
      await request(
        `${root}/roleChangeAcceptances/${f.operationId}`,
        'PUT',
        acceptance,
        f.target.human.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `${root}/roleChangeAcceptances/${f.operationId}`,
        'PUT',
        acceptance,
        f.target.human.token,
      )
    ).status,
    401,
  );
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 200);
});

test('DD96-R03 代理の代理任命・停止後の確定・古い対象版と便乗更新を拒否する', async () => {
  const deputy = await roleChangeFixture('deputy', 'deputy');
  assert.equal(
    (
      await request(
        `${root}/roleChangeRequests/${deputy.operationId}`,
        'PUT',
        deputy.change,
        deputy.actor.device.token,
      )
    ).status,
    401,
  );
  const f = await roleChangeFixture();
  assert.equal(
    (
      await request(
        `${root}/roleChangeRequests/${f.operationId}`,
        'PUT',
        f.change,
        f.actor.device.token,
      )
    ).status,
    200,
  );
  const other = await fixture();
  assert.equal(
    (
      await request(
        root,
        'PATCH',
        {
          ...f.updates,
          [`roles/${other.human.uid}`]: {
            ...f.after,
            humanUid: other.human.uid,
          },
        },
        f.actor.device.token,
      )
    ).status,
    401,
  );
  await request(`${root}/devices/${f.actor.device.uid}/active`, 'PUT', false);
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 401);
  await request(`${root}/devices/${f.actor.device.uid}/active`, 'PUT', true);
  await request(`${root}/roles/${f.target.human.uid}/revision`, 'PUT', 2);
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 401);
});

async function permissionFixture(revoke = false) {
  const actor = await fixture('deputy'),
    target = await fixture('temporary', 'password');
  await request(`${root}/sessions/${actor.device.uid}`, 'PUT', actor.session, actor.human.token);
  const session = (await request(`${root}/sessions/${actor.device.uid}`)).body;
  const now = Date.now(),
    operationId = randomUUID();
  const oldProfile = {
    schemaVersion: 1,
    humanUid: target.human.uid,
    roleVersion: 1,
    status: 'active',
    validFrom: target.grant.startsAt,
    validUntil: target.grant.endsAt,
    permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, true])),
  };
  await request(`${root}/temporaryPermissionProfiles/${target.human.uid}/1`, 'PUT', oldProfile);
  const input = {
    operationId,
    expectedRevision: 1,
    revoke,
    validFrom: now - 1000,
    validUntil: now + 3600000,
    permissions: { ...oldProfile.permissions, manualReception: false },
  };
  const snapshot = {
    ...scope,
    deviceAuthUid: actor.device.uid,
    role: actor.grant,
    device: actor.registration,
    session,
    state: 'operating',
    staffDeadline: now + 86400000,
  };
  const plan = changeTemporaryPermissions(snapshot, target.grant, input, now);
  plan.result.committedAt = { '.sv': 'timestamp' };
  const change = {
    ...scope,
    schemaVersion: 1,
    operationId,
    actorUid: actor.human.uid,
    actorDeviceUid: actor.device.uid,
    targetUid: target.human.uid,
    expectedRevision: 1,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    revoke,
    permissions: input.permissions,
    requestedAt: now,
  };
  const updates = {
    [`roles/${target.human.uid}`]: plan.role,
    [`temporaryPermissionProfiles/${target.human.uid}/2`]: plan.profile,
    [`temporaryPermissionOperations/${operationId}`]: { request: change, result: plan.result },
    [`authorizationAudit/${operationId}`]: createAuthorizationAudit(plan, target.grant, oldProfile),
  };
  return { actor, target, operationId, input, plan, updates };
}

test('DD98-R00 全512設定を通常の端末Authで保存し、役割版と保存内容を照合する', async () => {
  const f = await permissionFixture();
  const session = (await request(`${root}/sessions/${f.actor.device.uid}`)).body;
  let role = f.target.grant;
  let previous = (await request(`${root}/temporaryPermissionProfiles/${role.humanUid}/1`)).body;
  const now = Date.now(),
    validUntil = now + 3600000;
  const snapshot = {
    ...scope,
    deviceAuthUid: f.actor.device.uid,
    role: f.actor.grant,
    device: f.actor.registration,
    session,
    state: 'operating',
    staffDeadline: now + 86400000,
  };
  for (let mask = 0; mask < 512; mask++) {
    const operationId = randomUUID(),
      requestedAt = Date.now();
    const permissions = Object.fromEntries(
      TEMPORARY_PERMISSIONS.map((key, index) => [key, Boolean(mask & (1 << index))]),
    );
    const input = {
      operationId,
      expectedRevision: role.revision,
      revoke: false,
      validFrom: now,
      validUntil,
      permissions,
    };
    const plan = changeTemporaryPermissions(snapshot, role, input, requestedAt);
    plan.result.committedAt = { '.sv': 'timestamp' };
    const command = {
      ...scope,
      schemaVersion: 1,
      operationId,
      actorUid: f.actor.human.uid,
      actorDeviceUid: f.actor.device.uid,
      targetUid: role.humanUid,
      expectedRevision: role.revision,
      validFrom: now,
      validUntil,
      revoke: false,
      permissions,
      requestedAt,
    };
    const updates = {
      [`roles/${role.humanUid}`]: plan.role,
      [`temporaryPermissionProfiles/${role.humanUid}/${plan.role.revision}`]: plan.profile,
      [`temporaryPermissionOperations/${operationId}`]: { request: command, result: plan.result },
      [`authorizationAudit/${operationId}`]: createAuthorizationAudit(plan, role, previous),
    };
    assert.equal(
      (await request(root, 'PATCH', updates, f.actor.device.token)).status,
      200,
      `mask=${mask}`,
    );
    const stored = (
      await request(
        `${root}/temporaryPermissionProfiles/${role.humanUid}/${plan.role.revision}`,
        'GET',
        undefined,
        f.actor.device.token,
      )
    ).body;
    assert.deepEqual(stored.permissions, permissions);
    role = plan.role;
    previous = stored;
  }
  assert.equal((await request(`${root}/roles/${role.humanUid}`)).body.revision, 513);
});

test('DD98-R02 設定変更は役割版・新設定・結果・変更前後の監査を一体確定する', async () => {
  const f = await permissionFixture();
  for (const omitted of Object.keys(f.updates)) {
    const partial = { ...f.updates };
    delete partial[omitted];
    assert.equal(
      (await request(root, 'PATCH', partial, f.actor.device.token)).status,
      401,
      omitted,
    );
  }
  const profilePath = `temporaryPermissionProfiles/${f.target.human.uid}/2`;
  for (const patch of [
    { permissions: { ...f.plan.profile.permissions, unknown: true } },
    { permissions: { ...f.plan.profile.permissions, manualReception: 1 } },
    { roleVersion: 3 },
    { validUntil: f.target.grant.endsAt + 1 },
    { status: 'revoked' },
  ]) {
    const tampered = structuredClone(f.updates);
    tampered[profilePath] = { ...tampered[profilePath], ...patch };
    assert.equal((await request(root, 'PATCH', tampered, f.actor.device.token)).status, 401);
  }
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 200);
  assert.equal((await request(`${root}/${profilePath}`)).body.permissions.manualReception, false);
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 401);
  assert.equal(
    (
      await request(
        `${root}/${profilePath}/permissions/manualReception`,
        'DELETE',
        undefined,
        f.actor.device.token,
      )
    ).status,
    401,
  );
});

test('DD98-R03 設定取消しは全OFFの新しい版で、旧版の復活と停止中の確定を拒否する', async () => {
  const f = await permissionFixture(true);
  await request(`${root}/devices/${f.actor.device.uid}/active`, 'PUT', false);
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 401);
  await request(`${root}/devices/${f.actor.device.uid}/active`, 'PUT', true);
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 200);
  const profile = (await request(`${root}/temporaryPermissionProfiles/${f.target.human.uid}/2`))
    .body;
  assert.equal(profile.status, 'revoked');
  assert.ok(Object.values(profile.permissions).every((value) => value === false));
  assert.equal(
    (
      await request(
        `${root}/temporaryPermissionProfiles/${f.target.human.uid}/2`,
        'PUT',
        { ...profile, status: 'active' },
        f.actor.device.token,
      )
    ).status,
    401,
  );
});

function deviceUpdates(actor, target, kind, replacementDeviceUid = '') {
  const operationId = randomUUID(),
    previous = target.registration;
  const next = {
    ...previous,
    revision: (previous.revision ?? 1) + 1,
    lastOperationId: operationId,
    active: kind === 'approve' || kind === 'resume',
    approved: kind === 'approve' ? true : previous.approved,
    retired: kind === 'retire',
  };
  const result = {
    ...scope,
    schemaVersion: 1,
    operationId,
    actorUid: actor.human.uid,
    actorDeviceUid: actor.device.uid,
    targetDeviceUid: previous.deviceUid,
    expectedRevision: previous.revision ?? 1,
    resultingRevision: next.revision,
    kind,
    replacementDeviceUid,
    committedAt: { '.sv': 'timestamp' },
    previousActive: previous.active,
    previousApproved: previous.approved,
    previousRetired: previous.retired,
    nextActive: next.active,
    nextApproved: next.approved,
    nextRetired: next.retired,
  };
  return {
    [`devices/${previous.deviceUid}`]: next,
    [`deviceAuthorizationOperations/${operationId}`]: result,
  };
}

test('AUTH110-R07 停止は端末Aだけを失効し、同じ本人Bの認可と鍵の識別子を維持する', async () => {
  const a = await fixture('owner'),
    b = await auth('anonymous');
  await request(`${root}/sessions/${a.device.uid}`, 'PUT', a.session, a.human.token);
  const registration = { ...a.registration, deviceUid: b.uid };
  await request(`${root}/devices/${b.uid}`, 'PUT', registration);
  await request(
    `${root}/sessions/${b.uid}`,
    'PUT',
    { ...a.session, deviceUid: b.uid },
    a.human.token,
  );
  const updates = deviceUpdates(a, a, 'stop');
  for (const omitted of Object.keys(updates)) {
    const partial = { ...updates };
    delete partial[omitted];
    assert.equal((await request(root, 'PATCH', partial, a.device.token)).status, 401);
  }
  assert.equal((await request(root, 'PATCH', updates, a.device.token)).status, 200);
  assert.equal((await request(`${root}/control`, 'GET', undefined, a.device.token)).status, 401);
  assert.equal((await request(`${root}/control`, 'GET', undefined, b.token)).status, 200);
  assert.equal(
    (await request(`${root}/devices/${a.device.uid}`)).body.storageEpoch,
    a.registration.storageEpoch,
  );
  const stopped = { ...a, registration: updates[`devices/${a.device.uid}`] };
  const resume = deviceUpdates({ ...a, device: b }, stopped, 'resume');
  assert.equal((await request(root, 'PATCH', resume, a.device.token)).status, 401);
  assert.equal((await request(root, 'PATCH', resume, b.token)).status, 200);
  assert.equal((await request(`${root}/control`, 'GET', undefined, a.device.token)).status, 200);
});

test('CONF066・069-R01 主担当端末の廃止は別の準備済み主担当端末を要求し、代理では代用しない', async () => {
  const a = await fixture('owner'),
    deputy = await fixture('deputy');
  await request(`${root}/sessions/${a.device.uid}`, 'PUT', a.session, a.human.token);
  const noReplacement = deviceUpdates(a, a, 'retire');
  assert.equal((await request(root, 'PATCH', noReplacement, a.device.token)).status, 401);
  const onlyDeputy = deviceUpdates(a, a, 'retire', deputy.device.uid);
  assert.equal((await request(root, 'PATCH', onlyDeputy, a.device.token)).status, 401);
  const b = await auth('anonymous');
  const registration = { ...a.registration, deviceUid: b.uid };
  await request(`${root}/devices/${b.uid}`, 'PUT', { ...registration, preparedRoleRevision: 0 });
  const updates = deviceUpdates(a, a, 'retire', b.uid);
  assert.equal((await request(root, 'PATCH', updates, a.device.token)).status, 401);
  await request(`${root}/devices/${b.uid}`, 'PUT', registration);
  const stopB = deviceUpdates(a, { registration }, 'stop');
  assert.equal(
    (await request(root, 'PATCH', { ...updates, ...stopB }, a.device.token)).status,
    401,
  );
  assert.equal((await request(root, 'PATCH', updates, a.device.token)).status, 200);
  assert.equal((await request(`${root}/devices/${a.device.uid}`)).body.retired, true);
  const resume = deviceUpdates(
    deputy,
    { registration: updates[`devices/${a.device.uid}`] },
    'resume',
  );
  await request(`${root}/sessions/${deputy.device.uid}`, 'PUT', deputy.session, deputy.human.token);
  assert.equal((await request(root, 'PATCH', resume, deputy.device.token)).status, 401);
});

test('DD96・98-R04 取消しは役割を変えず、同じIDの確定との競合を拒否する', async () => {
  const f = await roleChangeFixture();
  await request(
    `${root}/roleChangeRequests/${f.operationId}`,
    'PUT',
    f.change,
    f.actor.device.token,
  );
  const session = (await request(`${root}/sessions/${f.actor.device.uid}`)).body;
  const snapshot = {
    ...scope,
    deviceAuthUid: f.actor.device.uid,
    role: f.actor.grant,
    device: f.actor.registration,
    session,
    state: 'operating',
    staffDeadline: Date.now() + 86400000,
  };
  const plan = cancelAuthorizationChange(
    snapshot,
    f.target.grant,
    f.operationId,
    1,
    'roleChange',
    null,
    Date.now(),
  );
  plan.result.committedAt = { '.sv': 'timestamp' };
  const audit = createAuthorizationAudit(plan, f.target.grant, null);
  const cancellation = {
    [`roleChangeResults/${f.operationId}`]: plan.result,
    [`authorizationAudit/${f.operationId}`]: audit,
  };
  assert.equal(
    (
      await request(
        root,
        'PATCH',
        { [`roleChangeResults/${f.operationId}`]: plan.result },
        f.actor.device.token,
      )
    ).status,
    401,
  );
  assert.equal((await request(root, 'PATCH', cancellation, f.actor.device.token)).status, 200);
  assert.equal((await request(root, 'PATCH', f.updates, f.actor.device.token)).status, 401);
  assert.equal((await request(`${root}/roles/${f.target.human.uid}`)).body.revision, 1);
});

test('CONF069-R02 現主担当の開始と後任のGoogle受諾後だけ、主担当を1人に保って引き継ぐ', async () => {
  const actor = await fixture('owner'),
    successor = await fixture('deputy');
  await request(`${root}/roles`, 'PUT', {
    [actor.human.uid]: actor.grant,
    [successor.human.uid]: successor.grant,
  });
  await request(`${root}/control/ownerUid`, 'PUT', actor.human.uid);
  await request(`${root}/sessions/${actor.device.uid}`, 'PUT', actor.session, actor.human.token);
  await request(
    `${root}/sessions/${successor.device.uid}`,
    'PUT',
    successor.session,
    successor.human.token,
  );
  const operationId = randomUUID();
  const change = {
    ...scope,
    schemaVersion: 1,
    operationId,
    actorUid: actor.human.uid,
    actorDeviceUid: actor.device.uid,
    targetUid: successor.human.uid,
    actorExpectedRevision: 1,
    targetExpectedRevision: 1,
    previousOwnerDisposition: 'deputy',
    successorDeviceUid: successor.device.uid,
    requestedAt: { '.sv': 'timestamp' },
  };
  assert.equal(
    (
      await request(
        `${root}/ownerHandoverRequests/${operationId}`,
        'PUT',
        change,
        successor.device.token,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        `${root}/ownerHandoverRequests/${operationId}`,
        'PUT',
        change,
        actor.device.token,
      )
    ).status,
    200,
  );
  const result = {
    ...change,
    actorResultingRevision: 2,
    targetResultingRevision: 2,
    successorDeviceUid: successor.device.uid,
    committedAt: { '.sv': 'timestamp' },
  };
  delete result.requestedAt;
  const updates = {
    [`roles/${actor.human.uid}`]: {
      ...actor.grant,
      role: 'deputy',
      revision: 2,
      lastOperationId: operationId,
    },
    [`roles/${successor.human.uid}`]: {
      ...successor.grant,
      role: 'owner',
      revision: 2,
      lastOperationId: operationId,
    },
    'control/ownerUid': successor.human.uid,
    'control/ownerHandoverOperationId': operationId,
    [`ownerHandoverResults/${operationId}`]: result,
    [`ownerHandoverAudit/${operationId}`]: result,
  };
  assert.equal((await request(root, 'PATCH', updates, actor.device.token)).status, 401);
  const acceptance = {
    ...scope,
    schemaVersion: 1,
    operationId,
    targetUid: successor.human.uid,
    targetExpectedRevision: 1,
    provider: 'google.com',
    authenticatedAt: successor.human.authTime,
    accepted: true,
  };
  assert.equal(
    (
      await request(
        `${root}/ownerHandoverAcceptances/${operationId}`,
        'PUT',
        acceptance,
        actor.human.token,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        `${root}/ownerHandoverAcceptances/${operationId}`,
        'PUT',
        acceptance,
        successor.human.token,
      )
    ).status,
    200,
  );
  for (const omitted of Object.keys(updates)) {
    const partial = { ...updates };
    delete partial[omitted];
    assert.equal((await request(root, 'PATCH', partial, actor.device.token)).status, 401, omitted);
  }
  assert.equal((await request(root, 'PATCH', updates, actor.device.token)).status, 200);
  const roles = Object.values((await request(`${root}/roles`)).body);
  assert.equal(roles.filter((role) => role.role === 'owner' && role.active).length, 1);
  assert.equal((await request(`${root}/control/ownerUid`)).body, successor.human.uid);
  assert.equal((await request(root, 'PATCH', updates, actor.device.token)).status, 401);
  assert.equal(
    (
      await request(
        `${root}/ownerHandoverResults/${operationId}`,
        'GET',
        undefined,
        actor.device.token,
      )
    ).status,
    200,
  );
});

async function registrationFixture(role = 'receptionist') {
  const f = await fixture(role, role === 'receptionist' ? 'password' : 'google.com');
  await request(`${root}/devices/${f.device.uid}`, 'DELETE');
  const now = Date.now(),
    storageEpoch = randomUUID();
  const registration = {
    ...scope,
    schemaVersion: 1,
    deviceUid: f.device.uid,
    humanUid: f.human.uid,
    storageEpoch,
    revision: 1,
    requestedAt: { '.sv': 'timestamp' },
    expiresAt: now + 899000,
  };
  const device = {
    ...scope,
    schemaVersion: 2,
    deviceUid: f.device.uid,
    humanUid: f.human.uid,
    storageEpoch,
    active: false,
    approved: false,
    retired: false,
    preparedRoleRevision: 0,
    revision: 1,
  };
  const proof = {
    ...scope,
    schemaVersion: 1,
    deviceUid: f.device.uid,
    humanUid: f.human.uid,
    storageEpoch,
    roleRevision: 1,
    authProvider: role === 'receptionist' ? 'password' : 'google.com',
    emailVerified: true,
    humanAuthTime: f.human.authTime,
    issuedAt: { '.sv': 'timestamp' },
    revision: 1,
  };
  return { ...f, registration, pendingDevice: device, proof };
}

test('AUTH110-R08 匿名の仮登録は権限を付けず、本人証明と承認待ちを一体作成する', async () => {
  const f = await registrationFixture();
  const requestPath = `${root}/deviceRegistrationRequests/${f.device.uid}`;
  assert.equal((await request(requestPath, 'PUT', f.registration, f.human.token)).status, 401);
  assert.equal((await request(requestPath, 'PUT', f.registration, f.device.token)).status, 200);
  assert.equal(
    (await request(`${root}/devices/${f.device.uid}`, 'PUT', f.pendingDevice, f.device.token))
      .status,
    401,
  );
  const updates = {
    [`devices/${f.device.uid}`]: f.pendingDevice,
    [`deviceRegistrationProofs/${f.device.uid}`]: f.proof,
  };
  for (const path of Object.keys(updates))
    assert.equal(
      (await request(`${root}/${path}`, 'PUT', updates[path], f.human.token)).status,
      401,
    );
  assert.equal((await request(root, 'PATCH', updates, f.human.token)).status, 200);
  assert.equal((await request(`${root}/control`, 'GET', undefined, f.device.token)).status, 401);
  assert.equal(
    (await request(`${root}/sessions/${f.device.uid}`, 'PUT', { ...f.session }, f.human.token))
      .status,
    401,
  );
  const administrator = await fixture('owner');
  await request(
    `${root}/sessions/${administrator.device.uid}`,
    'PUT',
    administrator.session,
    administrator.human.token,
  );
  const approve = deviceUpdates(administrator, { registration: f.pendingDevice }, 'approve');
  assert.equal((await request(root, 'PATCH', approve, administrator.device.token)).status, 200);
  // 承認は準備完了ではないため、管理用の自己申告で準備版を増やせない。
  assert.equal(
    (
      await request(
        `${root}/devices/${f.device.uid}/preparedRoleRevision`,
        'PUT',
        1,
        f.device.token,
      )
    ).status,
    401,
  );
});

test('AUTH110-R09 別本人の結合、自己承認、保存領域の置換と期限切れを拒否する', async () => {
  const f = await registrationFixture(),
    other = await auth();
  await request(
    `${root}/deviceRegistrationRequests/${f.device.uid}`,
    'PUT',
    f.registration,
    f.device.token,
  );
  const updates = {
    [`devices/${f.device.uid}`]: f.pendingDevice,
    [`deviceRegistrationProofs/${f.device.uid}`]: f.proof,
  };
  assert.equal((await request(root, 'PATCH', updates, other.token)).status, 401);
  for (const patch of [
    { approved: true },
    { active: true },
    { preparedRoleRevision: 1 },
    { storageEpoch: randomUUID() },
    { lastOperationId: randomUUID() },
  ]) {
    assert.equal(
      (
        await request(
          root,
          'PATCH',
          { ...updates, [`devices/${f.device.uid}`]: { ...f.pendingDevice, ...patch } },
          f.human.token,
        )
      ).status,
      401,
    );
  }
  await request(
    `${root}/deviceRegistrationRequests/${f.device.uid}/expiresAt`,
    'PUT',
    Date.now() - 1,
  );
  assert.equal((await request(root, 'PATCH', updates, f.human.token)).status, 401);
});

function ownerLinkAudit(link, event, reporterDeviceUid) {
  const { status, revision, consumedAt, cancelledAt, ...fixed } = link;
  return { ...fixed, event, reporterDeviceUid, recordedAt: { '.sv': 'timestamp' } };
}
async function ownerLinkFixture() {
  const deputy = await fixture('deputy'),
    issuer = await fixture('owner'),
    target = await auth('anonymous');
  await request(`${root}/control/ownerUid`, 'PUT', issuer.human.uid);
  await request(`${root}/sessions/${issuer.device.uid}`, 'PUT', issuer.session, issuer.human.token);
  await request(`${root}/sessions/${deputy.device.uid}`, 'PUT', deputy.session, deputy.human.token);
  const now = Date.now(),
    operationId = randomUUID(),
    storageEpoch = randomUUID();
  const registration = {
    ...scope,
    schemaVersion: 1,
    deviceUid: target.uid,
    humanUid: issuer.human.uid,
    storageEpoch,
    revision: 1,
    requestedAt: { '.sv': 'timestamp' },
    expiresAt: now + 899000,
  };
  await request(
    `${root}/deviceRegistrationRequests/${target.uid}`,
    'PUT',
    registration,
    target.token,
  );
  const pending = {
    ...scope,
    schemaVersion: 2,
    deviceUid: target.uid,
    humanUid: issuer.human.uid,
    storageEpoch,
    active: false,
    approved: false,
    retired: false,
    preparedRoleRevision: 0,
    revision: 1,
  };
  const proof = {
    ...scope,
    schemaVersion: 1,
    deviceUid: target.uid,
    humanUid: issuer.human.uid,
    storageEpoch,
    roleRevision: 1,
    authProvider: 'google.com',
    emailVerified: true,
    humanAuthTime: issuer.human.authTime,
    issuedAt: { '.sv': 'timestamp' },
    revision: 1,
  };
  assert.equal(
    (
      await request(
        root,
        'PATCH',
        { [`devices/${target.uid}`]: pending, [`deviceRegistrationProofs/${target.uid}`]: proof },
        issuer.human.token,
      )
    ).status,
    200,
  );
  const { token, digest } = await createOwnerDeviceToken();
  const link = {
    ...scope,
    schemaVersion: 1,
    operationId,
    purpose: 'owner-device',
    ownerUid: issuer.human.uid,
    ownerRoleRevision: 1,
    issuerDeviceUid: issuer.device.uid,
    targetDeviceUid: target.uid,
    storageEpoch,
    issuedAt: { '.sv': 'timestamp' },
    expiresAt: now + 899000,
    status: 'pending',
    revision: 1,
  };
  const index = {
    ...scope,
    schemaVersion: 1,
    operationId,
    linkDigest: digest,
    ownerUid: issuer.human.uid,
    issuerDeviceUid: issuer.device.uid,
    targetDeviceUid: target.uid,
    storageEpoch,
    issuedAt: { '.sv': 'timestamp' },
  };
  const issueUpdates = {
    [`ownerDeviceLinks/${digest}`]: link,
    [`ownerDeviceLinkIssues/${operationId}`]: index,
    [`ownerDeviceLinkAudit/${digest}/issued`]: ownerLinkAudit(link, 'issued', issuer.device.uid),
  };
  return {
    issuer,
    deputy,
    target,
    operationId,
    storageEpoch,
    pending,
    token,
    digest,
    link,
    issueUpdates,
  };
}
async function readOwnerLink(f) {
  const link = (await request(`${root}/ownerDeviceLinks/${f.digest}`)).body;
  const reader = {
    ...scope,
    schemaVersion: 1,
    operationId: f.operationId,
    linkDigest: f.digest,
    ownerUid: f.issuer.human.uid,
    targetDeviceUid: f.target.uid,
    storageEpoch: f.storageEpoch,
    readAt: { '.sv': 'timestamp' },
  };
  const updates = {
    [`ownerDeviceLinkReaders/${f.target.uid}/${f.operationId}`]: reader,
    [`ownerDeviceLinkAudit/${f.digest}/read`]: ownerLinkAudit(link, 'read', f.target.uid),
  };
  return { link, reader, updates };
}
function ownerLinkApproval(f, link) {
  const result = {
    ...scope,
    schemaVersion: 1,
    operationId: f.operationId,
    linkDigest: f.digest,
    ownerUid: f.issuer.human.uid,
    issuerDeviceUid: f.issuer.device.uid,
    targetDeviceUid: f.target.uid,
    storageEpoch: f.storageEpoch,
    status: 'approved',
    expectedRevision: 1,
    resultingRevision: 2,
    approvedAt: { '.sv': 'timestamp' },
  };
  return {
    [`devices/${f.target.uid}`]: {
      ...f.pending,
      active: true,
      approved: true,
      revision: 2,
      lastOperationId: f.operationId,
    },
    [`ownerDeviceLinks/${f.digest}`]: {
      ...link,
      status: 'consumed',
      revision: 2,
      consumedAt: { '.sv': 'timestamp' },
    },
    [`ownerDeviceLinkResults/${f.operationId}`]: result,
    [`ownerDeviceLinkAudit/${f.digest}/approved`]: ownerLinkAudit(link, 'approved', f.target.uid),
  };
}

test('AUTH110-Q01 主担当追加端末は既存端末のリンクと本人確認を一回だけ使い、部分承認を拒否する', async () => {
  const f = await ownerLinkFixture();
  for (const token of [f.target.token, f.issuer.human.token, f.deputy.device.token]) {
    assert.equal((await request(root, 'PATCH', f.issueUpdates, token)).status, 401);
  }
  for (const omitted of Object.keys(f.issueUpdates)) {
    const partial = { ...f.issueUpdates };
    delete partial[omitted];
    assert.equal((await request(root, 'PATCH', partial, f.issuer.device.token)).status, 401);
  }
  assert.equal((await request(root, 'PATCH', f.issueUpdates, f.issuer.device.token)).status, 200);
  assert.equal(
    (await request(`${root}/ownerDeviceLinks`, 'GET', undefined, f.target.token)).status,
    401,
  );
  assert.equal(
    (
      await request(
        `${root}/ownerDeviceLinkIssues/${f.operationId}`,
        'GET',
        undefined,
        f.target.token,
      )
    ).status,
    401,
  );
  const read = await readOwnerLink(f);
  for (const omitted of Object.keys(read.updates)) {
    const partial = { ...read.updates };
    delete partial[omitted];
    assert.equal((await request(root, 'PATCH', partial, f.target.token)).status, 401);
  }
  const approval = ownerLinkApproval(f, read.link);
  assert.equal((await request(root, 'PATCH', approval, f.target.token)).status, 401);
  assert.equal((await request(root, 'PATCH', read.updates, f.target.token)).status, 200);
  for (const omitted of Object.keys(approval)) {
    const partial = { ...approval };
    delete partial[omitted];
    assert.equal((await request(root, 'PATCH', partial, f.target.token)).status, 401);
  }
  assert.equal((await request(root, 'PATCH', approval, f.target.token)).status, 200);
  assert.equal((await request(root, 'PATCH', approval, f.target.token)).status, 401);
  const device = (await request(`${root}/devices/${f.target.uid}`)).body;
  assert.equal(device.preparedRoleRevision, 0);
  assert.equal(device.storageEpoch, f.storageEpoch);
  assert.equal(
    (
      await request(
        `${root}/ownerDeviceLinkResults/${f.operationId}`,
        'GET',
        undefined,
        f.target.token,
      )
    ).status,
    200,
  );
  assert.equal(
    JSON.stringify((await request(`${root}/ownerDeviceLinks/${f.digest}`)).body).includes(f.token),
    false,
  );
});

test('AUTH110-Q02 発行元停止・期限切れ・取消し後は、保存済みの読取り証跡があっても承認しない', async () => {
  const f = await ownerLinkFixture();
  await request(root, 'PATCH', f.issueUpdates, f.issuer.device.token);
  const read = await readOwnerLink(f);
  await request(root, 'PATCH', read.updates, f.target.token);
  const approval = ownerLinkApproval(f, read.link);
  await request(`${root}/devices/${f.issuer.device.uid}/active`, 'PUT', false);
  assert.equal((await request(root, 'PATCH', approval, f.target.token)).status, 401);
  await request(`${root}/devices/${f.issuer.device.uid}/active`, 'PUT', true);
  const cancelled = {
    ...read.link,
    status: 'cancelled',
    revision: 2,
    cancelledAt: { '.sv': 'timestamp' },
  };
  const cancellation = {
    [`ownerDeviceLinks/${f.digest}`]: cancelled,
    [`ownerDeviceLinkAudit/${f.digest}/cancelled`]: ownerLinkAudit(
      read.link,
      'cancelled',
      f.issuer.device.uid,
    ),
  };
  assert.equal((await request(root, 'PATCH', cancellation, f.issuer.device.token)).status, 200);
  assert.equal((await request(root, 'PATCH', approval, f.target.token)).status, 401);
  const expired = await ownerLinkFixture();
  await request(root, 'PATCH', expired.issueUpdates, expired.issuer.device.token);
  const past = { ...expired.link, issuedAt: Date.now() - 900000, expiresAt: Date.now() - 1 };
  await request(`${root}/ownerDeviceLinks/${expired.digest}`, 'PUT', past);
  const invalid = await readOwnerLink(expired);
  assert.equal((await request(root, 'PATCH', invalid.updates, expired.target.token)).status, 401);
  const report = {
    [`ownerDeviceLinkAudit/${expired.digest}/expired`]: ownerLinkAudit(
      past,
      'expired',
      expired.target.uid,
    ),
  };
  assert.equal((await request(root, 'PATCH', report, expired.target.token)).status, 200);
});

test('AUTH110-Q03 同じ主担当の別端末への転用・操作ID再利用と平文の混入を拒否する', async () => {
  const f = await ownerLinkFixture();
  const leaked = structuredClone(f.issueUpdates);
  leaked[`ownerDeviceLinks/${f.digest}`].token = f.token;
  assert.equal((await request(root, 'PATCH', leaked, f.issuer.device.token)).status, 401);
  assert.equal((await request(root, 'PATCH', f.issueUpdates, f.issuer.device.token)).status, 200);
  const other = await auth('anonymous'),
    epoch = randomUUID();
  await request(`${root}/devices/${other.uid}`, 'PUT', {
    ...f.pending,
    deviceUid: other.uid,
    storageEpoch: epoch,
  });
  const proof = (await request(`${root}/deviceRegistrationProofs/${f.target.uid}`)).body;
  await request(`${root}/deviceRegistrationProofs/${other.uid}`, 'PUT', {
    ...proof,
    deviceUid: other.uid,
    storageEpoch: epoch,
  });
  assert.equal(
    (await request(`${root}/ownerDeviceLinks/${f.digest}`, 'GET', undefined, other.token)).status,
    401,
  );
  const read = await readOwnerLink(f);
  assert.equal((await request(root, 'PATCH', read.updates, other.token)).status, 401);
  const wrongTarget = {
    [`ownerDeviceLinkReaders/${other.uid}/${f.operationId}`]: {
      ...read.reader,
      targetDeviceUid: other.uid,
      storageEpoch: epoch,
    },
    [`ownerDeviceLinkAudit/${f.digest}/read`]: ownerLinkAudit(read.link, 'read', other.uid),
  };
  assert.equal((await request(root, 'PATCH', wrongTarget, other.token)).status, 401);
  const { digest } = await createOwnerDeviceToken();
  const reusedId = {
    [`ownerDeviceLinks/${digest}`]: f.link,
    [`ownerDeviceLinkIssues/${f.operationId}`]: {
      ...f.issueUpdates[`ownerDeviceLinkIssues/${f.operationId}`],
      linkDigest: digest,
    },
    [`ownerDeviceLinkAudit/${digest}/issued`]:
      f.issueUpdates[`ownerDeviceLinkAudit/${f.digest}/issued`],
  };
  assert.equal((await request(root, 'PATCH', reusedId, f.issuer.device.token)).status, 401);
  assert.equal((await request(root, 'PATCH', read.updates, f.target.token)).status, 200);
  const reported = {
    [`ownerDeviceLinkAudit/${f.digest}/rejected`]: {
      ...ownerLinkAudit(read.link, 'rejected', f.target.uid),
      reasonCode: 'identity_mismatch',
    },
  };
  assert.equal((await request(root, 'PATCH', reported, f.target.token)).status, 200);
  const invalid = structuredClone(reported);
  invalid[`ownerDeviceLinkAudit/${f.digest}/rejected`].reasonCode = 'arbitrary diagnostic text';
  assert.equal((await request(root, 'PATCH', invalid, f.target.token)).status, 401);
  const approval = ownerLinkApproval(f, read.link);
  assert.equal((await request(root, 'PATCH', approval, other.token)).status, 401);
  assert.equal((await request(root, 'PATCH', approval, f.target.token)).status, 200);
});

test('PERF111-R01 保存契約の接続前は、認可済み主担当でも受付開始を直接書き込めない', async () => {
  const { human, device, session } = await fixture();
  assert.equal((await request(`${root}/sessions/${device.uid}`, 'PUT', session, human.token)).status, 200);

  const control = {
    ...scope,
    state: 'preparing',
    controlRevision: 1,
    staffDeadline: Date.now() + 86400000,
  };
  assert.equal((await request(`${root}/control`, 'PUT', control)).status, 200);
  assert.deepEqual(await request(`${root}/control`, 'GET', undefined, device.token), {
    status: 200,
    body: control,
  });

  const updates = {
    'control/state': 'operating',
    'control/controlRevision': 2,
    'control/firstReceptionStartedAt': { '.sv': 'timestamp' },
  };
  assert.equal((await request(root, 'PATCH', updates, device.token)).status, 401);
  assert.deepEqual((await request(`${root}/control`, 'GET', undefined, device.token)).body, control);
});

test('PERF111-R02 明示割当済み主担当の一体初期化だけを許可する', async () => {
  const { human, device, session } = await fixture();
  const deputy = await fixture('deputy');
  for (const actor of [{ human, device, session }, deputy]) {
    assert.equal(
      (await request(`${root}/sessions/${actor.device.uid}`, 'PUT', actor.session, actor.human.token)).status,
      200,
    );
  }

  const control = {
    ...scope,
    ownerUid: human.uid,
    state: 'preparing',
    staffDeadline: Date.now() + 86400000,
  };
  assert.equal((await request(`${root}/control`, 'PUT', control)).status, 200);

  const fields = {
    controlRevision: 1,
    businessSchemaVersion: 3,
    layoutSchemaVersion: 2,
    initializedAt: { '.sv': 'timestamp' },
  };
  const path = `${root}/control`;
  const entries = Object.entries(fields);
  for (let mask = 1; mask < (1 << entries.length) - 1; mask += 1) {
    const partial = Object.fromEntries(entries.filter((_, index) => mask & (1 << index)));
    assert.equal((await request(path, 'PATCH', partial, device.token)).status, 401);
  }
  assert.equal((await request(path, 'PATCH', fields, deputy.device.token)).status, 401);
  assert.equal((await request(path, 'PATCH', { ...fields, layoutSchemaVersion: 1 }, device.token)).status, 401);
  assert.equal((await request(path, 'PATCH', { ...fields, state: 'operating' }, device.token)).status, 401);
  assert.deepEqual((await request(path, 'GET', undefined, device.token)).body, control);

  assert.equal((await request(path, 'PATCH', fields, device.token)).status, 200);
  const { initializedAt, ...initialized } = (await request(path, 'GET', undefined, device.token)).body;
  assert.ok(Number.isSafeInteger(initializedAt));
  assert.deepEqual(initialized, {
    ...control,
    controlRevision: 1,
    businessSchemaVersion: 3,
    layoutSchemaVersion: 2,
  });
  assert.equal((await request(path, 'PATCH', fields, device.token)).status, 401);
});

test('PERF111-R03 準備確認は現在の公演管理版と確定データ版でだけ保存できる', async () => {
  const owner = await fixture();
  const receptionist = await fixture('receptionist');
  for (const actor of [owner, receptionist]) {
    assert.equal(
      (await request(`${root}/sessions/${actor.device.uid}`, 'PUT', actor.session, actor.human.token)).status,
      200,
    );
  }

  // 後続の確定公開で作られる版だけを投入し、準備確認は通常の端末資格で保存する。
  assert.equal((await request(root, 'PATCH', {
    'control/state': 'preparing',
    'control/controlRevision': 1,
    'event/commit/revision': 10,
    'head/revision': 3,
    'head/viewRevision': 5,
  })).status, 200);
  const path = `${root}/receptionPreparation`;
  const confirmation = {
    ...scope,
    controlRevision: 1,
    dataVersion: { commitRevision: 10, layoutRevision: 3, viewRevision: 5 },
    humanUid: owner.human.uid,
    deviceUid: owner.device.uid,
    confirmedAt: { '.sv': 'timestamp' },
  };
  const token = owner.device.token;
  assert.equal((await request(path, 'PUT', confirmation, receptionist.device.token)).status, 401);
  assert.equal((await request(path, 'PUT', { ...confirmation, controlRevision: 2 }, token)).status, 401);
  assert.equal((await request(path, 'PUT', { ...confirmation, humanUid: receptionist.human.uid }, token)).status, 401);
  assert.equal((await request(`${root}/event`, 'GET', undefined, token)).status, 401);
  assert.equal((await request(`${root}/event/commit/revision`, 'GET', undefined, token)).body, 10);
  assert.equal((await request(`${root}/event/commit/revision`, 'GET', undefined, receptionist.device.token)).status, 401);

  assert.equal((await request(path, 'PUT', confirmation, token)).status, 200);
  assert.equal((await request(`${root}/head/viewRevision`, 'PUT', 6)).status, 200);
  assert.equal((await request(path, 'PUT', confirmation, token)).status, 401);
  const stale = await request(path, 'GET', undefined, token);
  assert.equal(stale.body.dataVersion.viewRevision, 5);
  assert.equal((await request(path, 'PUT', {
    ...confirmation,
    dataVersion: { ...confirmation.dataVersion, viewRevision: 6 },
  }, token)).status, 200);
  assert.equal((await request(`${root}/control/state`, 'PUT', 'operating', token)).status, 401);
});

test('PERF111-R04 明示停止は状態・版・監査を一体確定し、同時要求の一方だけを受理する', async () => {
  const deputy = await fixture('deputy');
  const receptionist = await fixture('receptionist');
  for (const actor of [deputy, receptionist]) {
    assert.equal(
      (await request(`${root}/sessions/${actor.device.uid}`, 'PUT', actor.session, actor.human.token)).status,
      200,
    );
  }
  const firstReceptionStartedAt = Date.now() - 1000;
  const control = {
    ...scope,
    state: 'operating',
    controlRevision: 6,
    firstReceptionStartedAt,
    staffDeadline: Date.now() + 86400000,
  };
  assert.equal((await request(`${root}/control`, 'PUT', control)).status, 200);

  /** 操作IDだけを変え、同じ公演管理版に対する停止要求を作る。 */
  function stopUpdates(operationId) {
    return {
      'control/state': 'stopped',
      'control/controlRevision': 7,
      'control/lastReceptionOperationId': operationId,
      [`receptionStopAudits/${operationId}`]: {
        ...scope,
        operationId,
        humanUid: deputy.human.uid,
        deviceUid: deputy.device.uid,
        previousState: 'operating',
        state: 'stopped',
        controlRevision: 7,
        firstReceptionStartedAt,
        occurredAt: { '.sv': 'timestamp' },
      },
    };
  }

  const ids = [randomUUID(), randomUUID()];
  const updates = stopUpdates(ids[0]);
  const token = deputy.device.token;
  const entries = Object.entries(updates);
  for (let mask = 1; mask < (1 << entries.length) - 1; mask += 1) {
    const partial = Object.fromEntries(entries.filter((_, index) => mask & (1 << index)));
    assert.equal((await request(root, 'PATCH', partial, token)).status, 401);
  }
  assert.equal((await request(root, 'PATCH', updates, receptionist.device.token)).status, 401);
  assert.equal((await request(root, 'PATCH', {
    ...updates, 'control/firstReceptionStartedAt': firstReceptionStartedAt + 1,
  }, token)).status, 401);
  assert.deepEqual((await request(`${root}/control`, 'GET', undefined, token)).body, control);

  const attempts = await Promise.all(ids.map((id) => request(root, 'PATCH', stopUpdates(id), token)));
  assert.deepEqual(attempts.map((result) => result.status).sort(), [200, 401]);
  const winner = ids[attempts.findIndex((result) => result.status === 200)];
  const audit = `${root}/receptionStopAudits/${winner}`;
  assert.deepEqual((await request(`${root}/control`, 'GET', undefined, token)).body, {
    ...control, state: 'stopped', controlRevision: 7, lastReceptionOperationId: winner,
  });
  assert.equal((await request(audit, 'GET', undefined, token)).body.operationId, winner);
  assert.equal((await request(audit, 'GET', undefined, receptionist.device.token)).status, 401);
  assert.equal((await request(audit, 'DELETE', undefined, token)).status, 401);
  assert.equal((await request(root, 'PATCH', stopUpdates(winner), token)).status, 401);
});

test('PERF111-R05 対象公演の最新管理版で空名簿と確定版だけを一度初期化する', async () => {
  const owner = await fixture();
  assert.equal((await request(`${root}/sessions/${owner.device.uid}`, 'PUT', owner.session, owner.human.token)).status, 200);
  assert.equal((await request(root, 'PATCH', {
    'control/state': 'preparing',
    'control/controlRevision': 2,
    'control/businessSchemaVersion': 3,
    'control/layoutSchemaVersion': 2,
    event: null,
    head: null,
  })).status, 200);

  const token = owner.device.token;
  const updates = {
    'control/businessInitializedFromRevision': 2,
    'event/commit': { revision: 1, operationId: 'initialize' },
    'event/roster/count': 0,
    'event/reception/0000000000': 1,
  };
  const entries = Object.entries(updates);
  for (let mask = 1; mask < (1 << entries.length) - 1; mask += 1) {
    const partial = Object.fromEntries(entries.filter((_, index) => mask & (1 << index)));
    assert.equal((await request(root, 'PATCH', partial, token)).status, 401);
  }
  assert.equal((await request(root, 'PATCH', {
    ...updates, 'control/businessInitializedFromRevision': 1,
  }, token)).status, 401);
  assert.equal((await request(root, 'PATCH', {
    ...updates, 'event/people/fictional-attendee': true,
  }, token)).status, 401);

  assert.equal((await request(`${root}/head/revision`, 'PUT', 1)).status, 200);
  assert.equal((await request(root, 'PATCH', updates, token)).status, 401);
  assert.equal((await request(`${root}/head`, 'DELETE')).status, 200);
  assert.equal((await request(root, 'PATCH', updates, token)).status, 200);
  assert.deepEqual((await request(`${root}/event`)).body, {
    commit: { revision: 1, operationId: 'initialize' },
    roster: { count: 0 },
    reception: { '0000000000': 1 },
  });
  assert.equal((await request(`${root}/head`)).body, null);
  assert.equal((await request(root, 'PATCH', updates, token)).status, 401);
});

test('PERF111-R06 会場コピーは両公演の現在認可と元の版を照合し、コピー後は独立する', async () => {
  const { human, device, grant, registration, session } = await fixture();
  const target = { environmentId, performanceId: randomUUID() };
  const targetRoot = `environments/${environmentId}/performances/${target.performanceId}`;
  const control = { state: 'preparing', staffDeadline: Date.now() + 86400000 };
  assert.equal((await request(`${root}/control`, 'PATCH', control)).status, 200);
  assert.equal((await request(`${root}/sessions/${device.uid}`, 'PUT', session, human.token)).status, 200);

  const venue = {
    ...scope, revision: 1, name: '架空ホール', address: '架空市1丁目', updatedAt: { '.sv': 'timestamp' },
  };
  const origin = `${root}/performanceVenue`;
  const destination = `${targetRoot}/performanceVenue`;
  assert.equal((await request(origin, 'PUT', venue, device.token)).status, 200);
  const copy = {
    ...venue, ...target, sourcePerformanceId: performanceId, sourceRevision: 1,
  };
  assert.equal((await request(destination, 'PUT', copy, device.token)).status, 401);

  assert.equal((await request(targetRoot, 'PUT', {
    control: { ...target, ...control },
    roles: { [human.uid]: { ...grant, ...target } },
    devices: { [device.uid]: { ...registration, ...target } },
  })).status, 200);
  assert.equal((await request(`${targetRoot}/sessions/${device.uid}`, 'PUT', { ...session, ...target }, human.token)).status, 200);
  assert.equal((await request(destination, 'PUT', { ...copy, sourceRevision: 2 }, device.token)).status, 401);
  assert.equal((await request(destination, 'PUT', { ...copy, address: '別の住所' }, device.token)).status, 401);
  assert.equal((await request(destination, 'PUT', { ...copy, sourcePerformanceId: randomUUID() }, device.token)).status, 401);
  assert.equal((await request(destination, 'PUT', { ...copy, roles: grant }, device.token)).status, 401);

  assert.equal((await request(`${root}/devices/${device.uid}/active`, 'PUT', false)).status, 200);
  assert.equal((await request(destination, 'PUT', copy, device.token)).status, 401);
  assert.equal((await request(`${root}/devices/${device.uid}/active`, 'PUT', true)).status, 200);
  assert.equal((await request(destination, 'PUT', copy, device.token)).status, 200);
  assert.equal((await request(origin, 'PUT', { ...venue, revision: 2, name: '架空ホール改称' }, device.token)).status, 200);
  const targetVenue = (await request(destination, 'GET', undefined, device.token)).body;
  assert.equal(targetVenue.name, venue.name);
  assert.equal(targetVenue.sourceRevision, 1);
  assert.equal((await request(destination, 'PATCH', {
    revision: 2, address: '架空市2丁目', updatedAt: { '.sv': 'timestamp' },
  }, device.token)).status, 200);
  assert.equal((await request(origin, 'GET', undefined, device.token)).body.address, venue.address);
});
