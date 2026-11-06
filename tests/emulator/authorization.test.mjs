// 新しい製品Rulesをローカルだけで確認する。既存PoCのシナリオは実行しない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { TEMPORARY_PERMISSIONS } from "../../src/domain/authorization/types.ts";

const project = "demo-concert-reception-product";
const namespace = project + "-default-rtdb";
const environmentId = "00000000-0000-4000-8000-000000000001";
const performanceId = "00000000-0000-4000-8000-000000000002";
const root = `environments/${environmentId}/performances/${performanceId}`;
const scope = { environmentId, performanceId };

async function request(path, method = "GET", body, token = "owner") {
  const url = new URL(`http://127.0.0.1:9100/${path}.json`);
  url.searchParams.set("ns", namespace);
  if (token && token !== "owner") url.searchParams.set("auth", token);
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token === "owner" ? { authorization: "Bearer owner" } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}

async function auth(provider = "password", verified = true) {
  const post = async (path, body, admin = false) => {
    const response = await fetch(
      `http://127.0.0.1:9291/identitytoolkit.googleapis.com/v1/${path}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(admin ? { authorization: "Bearer owner" } : {}),
        },
        body: JSON.stringify(body),
      },
    );
    assert.equal(response.status, 200);
    return response.json();
  };
  const email = `fictional-${randomUUID()}@example.invalid`,
    password = randomUUID() + "A7!";
  let result;
  if (provider === "anonymous")
    result = await post("accounts:signUp?key=demo-key", {
      returnSecureToken: true,
    });
  else if (provider === "google.com")
    result = await post("accounts:signInWithIdp?key=demo-key", {
      requestUri: "http://localhost",
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
    result = await post("accounts:signUp?key=demo-key", {
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
      result = await post("accounts:signInWithPassword?key=demo-key", {
        email,
        password,
        returnSecureToken: true,
      });
    }
  }
  const claims = JSON.parse(
    Buffer.from(result.idToken.split(".")[1], "base64url").toString(),
  );
  assert.equal(claims.aud, project);
  return {
    uid: result.localId,
    token: result.idToken,
    authTime: claims.auth_time * 1000,
  };
}

async function fixture(
  role = "owner",
  humanProvider = role === "owner" || role === "deputy"
    ? "google.com"
    : "password",
) {
  const human = await auth(humanProvider),
    device = await auth("anonymous"),
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
  assert.equal(
    (await request(`${root}/roles/${human.uid}`, "PUT", grant)).status,
    200,
  );
  assert.equal(
    (await request(`${root}/devices/${device.uid}`, "PUT", registration))
      .status,
    200,
  );
  assert.equal(
    (
      await request(`${root}/control`, "PUT", {
        ...scope,
        state: "operating",
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
    issuedAt: { ".sv": "timestamp" },
    expiresAt: now + 3600000,
    humanAuthTime: human.authTime,
  };
  return { human, device, grant, registration, session };
}

test("AUTH110-R01 本人だけが証跡を作り、結合された端末で状態を取得する", async () => {
  const f = await fixture();
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        "PUT",
        f.session,
        f.human.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`${root}/control`, "GET", undefined, f.device.token)).status,
    200,
  );
  assert.equal(
    (await request(`${root}/control`, "GET", undefined, f.human.token)).status,
    401,
  );
  assert.equal(
    (await request(root, "GET", undefined, f.device.token)).status,
    401,
  );
  assert.equal(
    (await request(`${root}/event`, "GET", undefined, f.device.token)).status,
    401,
  );
});

test("AUTH110-R02 端末・別本人・未確認メールによる証跡作成を拒否する", async () => {
  const f = await fixture(),
    other = await auth(),
    unverified = await auth("password", false);
  for (const token of [f.device.token, other.token, unverified.token]) {
    assert.equal(
      (
        await request(
          `${root}/sessions/${f.device.uid}`,
          "PUT",
          f.session,
          token,
        )
      ).status,
      401,
    );
  }
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        "PUT",
        { ...f.session, humanUid: other.uid },
        other.token,
      )
    ).status,
    401,
  );
});

test("AUTH110-R03 型・余分なキー・認証時刻・版・削除と部分要求を拒否する", async () => {
  const f = await fixture();
  for (const patch of [
    { schemaVersion: 1 },
    { environmentId: performanceId },
    { performanceId: environmentId },
    { deviceUid: f.human.uid },
    { active: false },
    { emailVerified: false },
    { authProvider: "password" },
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
          "PUT",
          { ...f.session, ...patch },
          f.human.token,
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        "PUT",
        f.session,
        f.human.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}/emailVerified`,
        "DELETE",
        undefined,
        f.human.token,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        "DELETE",
        undefined,
        f.human.token,
      )
    ).status,
    401,
  );
});

test("AUTH110-R04 停止Aと期限切れを拒否し、同じ本人のBは継続できる", async () => {
  const a = await fixture(),
    bDevice = await auth("anonymous");
  const registration = { ...a.registration, deviceUid: bDevice.uid };
  await request(`${root}/devices/${bDevice.uid}`, "PUT", registration);
  for (const device of [a.device, bDevice]) {
    assert.equal(
      (
        await request(
          `${root}/sessions/${device.uid}`,
          "PUT",
          { ...a.session, deviceUid: device.uid },
          a.human.token,
        )
      ).status,
      200,
    );
  }
  await request(`${root}/devices/${a.device.uid}/active`, "PUT", false);
  assert.equal(
    (await request(`${root}/control`, "GET", undefined, a.device.token)).status,
    401,
  );
  assert.equal(
    (await request(`${root}/control`, "GET", undefined, bDevice.token)).status,
    200,
  );
  assert.equal(
    (
      await request(
        `${root}/devices/${a.device.uid}/active`,
        "PUT",
        true,
        a.device.token,
      )
    ).status,
    401,
  );
  await request(
    `${root}/sessions/${bDevice.uid}/expiresAt`,
    "PUT",
    Date.now() - 1,
  );
  assert.equal(
    (await request(`${root}/control`, "GET", undefined, bDevice.token)).status,
    401,
  );
});

test("AUTH110-R05 本人による失効を許可し、他の項目の便乗更新を拒否する", async () => {
  const f = await fixture();
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        "PUT",
        f.session,
        f.human.token,
      )
    ).status,
    200,
  );
  const saved = (await request(`${root}/sessions/${f.device.uid}`)).body;
  const revoked = { ...saved, active: false, revision: 2 };
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        "PUT",
        { ...revoked, expiresAt: saved.expiresAt + 1 },
        f.human.token,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        "PUT",
        revoked,
        f.human.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`${root}/control`, "GET", undefined, f.device.token)).status,
    401,
  );
});

test("AUTH110-R06 現在の役割失効と、役割に合わない本人プロバイダーを拒否する", async () => {
  const mismatch = await fixture("deputy", "password");
  assert.equal(
    (
      await request(
        `${root}/sessions/${mismatch.device.uid}`,
        "PUT",
        mismatch.session,
        mismatch.human.token,
      )
    ).status,
    401,
  );
  const f = await fixture();
  assert.equal(
    (
      await request(
        `${root}/sessions/${f.device.uid}`,
        "PUT",
        f.session,
        f.human.token,
      )
    ).status,
    200,
  );
  await request(`${root}/roles/${f.human.uid}/active`, "PUT", false);
  assert.equal(
    (await request(`${root}/control`, "GET", undefined, f.device.token)).status,
    401,
  );
  assert.equal(
    (
      await request(
        `${root}/roles/${f.human.uid}/active`,
        "PUT",
        true,
        f.device.token,
      )
    ).status,
    401,
  );
});

async function roleChangeFixture(nextRole = "temporary", actorRole = "owner") {
  const actor = await fixture(actorRole),
    target = await fixture("receptionist", "google.com");
  await request(
    `${root}/sessions/${actor.device.uid}`,
    "PUT",
    actor.session,
    actor.human.token,
  );
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
    previousRole: "receptionist",
    nextRole,
    startsAt: now - 1000,
    endsAt: now + 3600000,
    requestedAt: { ".sv": "timestamp" },
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
    status: "committed",
    operationId,
    actorUid: actor.human.uid,
    actorDeviceUid: actor.device.uid,
    targetUid: target.human.uid,
    expectedRevision: 1,
    resultingRevision: 2,
    kind: "roleChange",
    previousRole: "receptionist",
    nextRole,
    committedAt: { ".sv": "timestamp" },
  };
  const updates = {
    [`roles/${target.human.uid}`]: after,
    [`roleChangeResults/${operationId}`]: result,
    [`authorizationAudit/${operationId}`]: result,
  };
  if (nextRole === "temporary")
    updates[`temporaryPermissionProfiles/${target.human.uid}/2`] = {
      schemaVersion: 1,
      humanUid: target.human.uid,
      roleVersion: 2,
      status: "active",
      validFrom: after.startsAt,
      validUntil: after.endsAt,
      permissions: Object.fromEntries(
        TEMPORARY_PERMISSIONS.map((key) => [key, true]),
      ),
    };
  return { actor, target, operationId, change, after, result, updates };
}

test("DD96-R01・DD98-R01 役割・初回設定・結果・監査を一体確定し、部分送信を拒否する", async () => {
  const f = await roleChangeFixture();
  assert.equal(
    (
      await request(
        `${root}/roleChangeRequests/${f.operationId}`,
        "PUT",
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
      (await request(root, "PATCH", partial, f.actor.device.token)).status,
      401,
      omitted,
    );
  }
  assert.equal(
    (await request(root, "PATCH", f.updates, f.actor.device.token)).status,
    200,
  );
  assert.equal(
    (await request(`${root}/roles/${f.target.human.uid}`)).body.revision,
    2,
  );
  assert.equal(
    (await request(root, "PATCH", f.updates, f.actor.device.token)).status,
    401,
  );
  assert.equal(
    (
      await request(
        `${root}/roleChangeResults/${f.operationId}`,
        "GET",
        undefined,
        f.actor.device.token,
      )
    ).body.operationId,
    f.operationId,
  );
  for (const path of Object.keys(f.updates))
    assert.equal(
      (
        await request(
          `${root}/${path}`,
          "DELETE",
          undefined,
          f.actor.device.token,
        )
      ).status,
      401,
    );
});

test("DD96-R02 Google証跡は対象本人のAuthだけが作り、管理端末の自己申告を拒否する", async () => {
  const f = await roleChangeFixture("deputy");
  assert.equal(
    (
      await request(
        `${root}/roleChangeRequests/${f.operationId}`,
        "PUT",
        f.change,
        f.actor.device.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(root, "PATCH", f.updates, f.actor.device.token)).status,
    401,
  );
  const acceptance = {
    ...scope,
    schemaVersion: 1,
    operationId: f.operationId,
    targetUid: f.target.human.uid,
    expectedRevision: 1,
    provider: "google.com",
    authenticatedAt: f.target.human.authTime,
  };
  for (const token of [
    f.actor.device.token,
    f.actor.human.token,
    f.target.device.token,
  ]) {
    assert.equal(
      (
        await request(
          `${root}/roleChangeAcceptances/${f.operationId}`,
          "PUT",
          acceptance,
          token,
        )
      ).status,
      401,
    );
  }
  assert.equal(
    (
      await request(
        `${root}/roleChangeAcceptances/${f.operationId}`,
        "PUT",
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
        "PUT",
        acceptance,
        f.target.human.token,
      )
    ).status,
    401,
  );
  assert.equal(
    (await request(root, "PATCH", f.updates, f.actor.device.token)).status,
    200,
  );
});

test("DD96-R03 代理の代理任命・停止後の確定・古い対象版と便乗更新を拒否する", async () => {
  const deputy = await roleChangeFixture("deputy", "deputy");
  assert.equal(
    (
      await request(
        `${root}/roleChangeRequests/${deputy.operationId}`,
        "PUT",
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
        "PUT",
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
        "PATCH",
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
  await request(`${root}/devices/${f.actor.device.uid}/active`, "PUT", false);
  assert.equal(
    (await request(root, "PATCH", f.updates, f.actor.device.token)).status,
    401,
  );
  await request(`${root}/devices/${f.actor.device.uid}/active`, "PUT", true);
  await request(`${root}/roles/${f.target.human.uid}/revision`, "PUT", 2);
  assert.equal(
    (await request(root, "PATCH", f.updates, f.actor.device.token)).status,
    401,
  );
});
