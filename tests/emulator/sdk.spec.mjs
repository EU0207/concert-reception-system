import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const project = "demo-concert-reception-product";
const performanceId = "00000000-0000-4000-8000-000000000002";

async function createPerson() {
  const email = `fictional-${randomUUID()}@example.invalid`,
    password = randomUUID() + "Aa7!";
  const endpoint = "http://127.0.0.1:9291/identitytoolkit.googleapis.com/v1/";
  const signup = await fetch(endpoint + "accounts:signUp?key=demo-key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  expect(signup.status).toBe(200);
  const account = await signup.json();
  const verified = await fetch(
    endpoint + `projects/${project}/accounts:update`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer owner",
      },
      body: JSON.stringify({ localId: account.localId, emailVerified: true }),
    },
  );
  expect(verified.status).toBe(200);
  return { uid: account.localId, email, password };
}

async function seed(environmentId, humanUid, deviceUid) {
  const scope = { environmentId, performanceId },
    now = Date.now();
  const data = {
    roles: {
      [humanUid]: {
        ...scope,
        humanUid,
        role: "receptionist",
        active: true,
        revision: 1,
        startsAt: now - 10000,
        endsAt: now + 86400000,
      },
    },
    devices: {
      [deviceUid]: {
        ...scope,
        schemaVersion: 2,
        deviceUid,
        humanUid,
        active: true,
        approved: true,
        retired: false,
        storageEpoch: randomUUID(),
        preparedRole: "receptionist",
        preparedRoleRevision: 1,
      },
    },
    control: { ...scope, state: "operating", staffDeadline: now + 86400000 },
  };
  const response = await fetch(
    `http://127.0.0.1:9100/environments/${environmentId}/performances/${performanceId}.json?ns=${project}-default-rtdb`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer owner",
      },
      body: JSON.stringify(data),
    },
  );
  expect(response.status).toBe(200);
}

function config(environmentId) {
  return {
    schemaVersion: 1,
    appVersion: "0.1.0",
    environmentId,
    environmentType: "evaluation-firebase",
    environmentName: "ローカル認可試験",
    firebase: {
      apiKey: "demo-key",
      projectId: project,
      appId: "demo-web",
      authDomain: "localhost",
      databaseURL: `https://${project}-default-rtdb.firebaseio.com/`,
    },
  };
}

async function signedIn(page) {
  const person = await createPerson(),
    environmentId = randomUUID(),
    settings = config(environmentId);
  await page.goto("http://127.0.0.1:4181/");
  const deviceUid = await page.evaluate(
    async ({ settings, person }) => {
      const module = await import("/src/adapters/firebase/principals.ts");
      const principals = module.createFirebasePrincipals(settings, 9291);
      await module.signInHumanPassword(
        principals,
        person.email,
        person.password,
      );
      const deviceUid = await module.ensureDeviceIdentity(principals);
      window.testPrincipals = principals;
      return deviceUid;
    },
    { settings, person },
  );
  return { person, environmentId, settings, deviceUid };
}

test("AUTH110-S01 本人・端末のAuthを分離し、準備時だけ認証状態を永続化する", async ({
  page,
}) => {
  const f = await signedIn(page);
  const first = await page.evaluate(async () => {
    const module = await import("/src/adapters/firebase/principals.ts");
    const principals = window.testPrincipals;
    const identity = await module.readHumanIdentity(principals);
    await module.setPreparedPersistence(principals, true);
    return {
      uid: identity.uid,
      provider: identity.provider,
      verified: identity.emailVerified,
      differentApps: principals.humanApp.name !== principals.deviceApp.name,
      anonymousDevice: principals.deviceAuth.currentUser.isAnonymous,
    };
  });
  expect(first).toEqual({
    uid: f.person.uid,
    provider: "password",
    verified: true,
    differentApps: true,
    anonymousDevice: true,
  });
  expect(f.deviceUid).not.toBe(f.person.uid);
  await page.reload();
  const restored = await page.evaluate(async (settings) => {
    const module = await import("/src/adapters/firebase/principals.ts");
    const principals = module.createFirebasePrincipals(settings, 9291);
    const identity = await module.readHumanIdentity(principals);
    const deviceUid = await module.ensureDeviceIdentity(principals);
    await module.signOutHuman(principals);
    return {
      uid: identity.uid,
      deviceUid,
      signedOut: principals.humanAuth.currentUser === null,
      retainedDevice: principals.deviceAuth.currentUser.uid === deviceUid,
    };
  }, f.settings);
  expect(restored).toEqual({
    uid: f.person.uid,
    deviceUid: f.deviceUid,
    signedOut: true,
    retainedDevice: true,
  });
});

test("AUTH110-S02 製品SDKで本人証跡を発行し、現在認可を取得する", async ({
  page,
}) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const result = await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const adapter = await import(
        "/src/adapters/firebase/authorization-port.ts"
      );
      const controllerModule = await import(
        "/src/security/authorization-controller.ts"
      );
      const port = await adapter.createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      const stored = await port.issueSession(Date.now() + 60000);
      const controller = new controllerModule.AuthorizationController(
        port,
        "0.1.0",
        () => {},
      );
      await controller.reconnect();
      controller.access("qrReception")();
      window.testAuthorizationPort = port;
      window.testAuthorizationController = controller;
      return {
        state: controller.state,
        humanUid: stored.humanUid,
        deviceUid: stored.deviceUid,
        revision: stored.revision,
      };
    },
    { environmentId: f.environmentId, performanceId },
  );
  expect(result).toEqual({
    state: "online",
    humanUid: f.person.uid,
    deviceUid: f.deviceUid,
    revision: 1,
  });
  await page.evaluate(async () => {
    await window.testAuthorizationPort.revokeSession();
    window.testAuthorizationController.dispose();
    window.testAuthorizationPort.dispose();
  });
});

test("AUTH110-S03 停止の通知で通常操作をロックし、外部のFirebaseへ要求しない", async ({
  page,
}) => {
  const external = [];
  page.on("request", (request) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(request.url()).hostname))
      external.push(new URL(request.url()).hostname);
  });
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const { createAuthorizationPort } = await import(
        "/src/adapters/firebase/authorization-port.ts"
      );
      const { AuthorizationController } = await import(
        "/src/security/authorization-controller.ts"
      );
      const port = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await port.issueSession(Date.now() + 60000);
      const controller = new AuthorizationController(port, "0.1.0", () => {});
      await controller.reconnect();
      window.testAuthorizationPort = port;
      window.testAuthorizationController = controller;
    },
    { environmentId: f.environmentId, performanceId },
  );
  const response = await fetch(
    `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}/devices/${f.deviceUid}/active.json?ns=${project}-default-rtdb`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer owner",
      },
      body: "false",
    },
  );
  expect(response.status).toBe(200);
  await expect
    .poll(() => page.evaluate(() => window.testAuthorizationController.state))
    .toBe("locked");
  expect(
    await page.evaluate(() => {
      try {
        window.testAuthorizationController.access("qrReception");
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(external).toEqual([]);
  await page.evaluate(() => {
    window.testAuthorizationController.dispose();
    window.testAuthorizationPort.dispose();
  });
});
