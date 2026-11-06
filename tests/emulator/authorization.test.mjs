// 新しい製品Rulesをローカルだけで確認する。既存PoCのシナリオは実行しない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TEMPORARY_PERMISSIONS } from '../../src/domain/authorization/types.ts';
import { createAuthorizationAudit } from '../../src/domain/authorization/role-management.ts';
import { changeTemporaryPermissions } from '../../src/domain/authorization/role-management.ts';
import { cancelAuthorizationChange } from '../../src/domain/authorization/role-management.ts';

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
