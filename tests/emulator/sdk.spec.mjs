import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const project = 'demo-concert-reception-product';
const performanceId = '00000000-0000-4000-8000-000000000002';

async function createPerson() {
  const email = `fictional-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'Aa7!';
  const endpoint = 'http://127.0.0.1:9291/identitytoolkit.googleapis.com/v1/';
  const signup = await fetch(endpoint + 'accounts:signUp?key=demo-key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  expect(signup.status).toBe(200);
  const account = await signup.json();
  const verified = await fetch(endpoint + `projects/${project}/accounts:update`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer owner',
    },
    body: JSON.stringify({ localId: account.localId, emailVerified: true }),
  });
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
        role: 'receptionist',
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
        preparedRole: 'receptionist',
        preparedRoleRevision: 1,
      },
    },
    control: { ...scope, state: 'operating', staffDeadline: now + 86400000 },
  };
  const response = await fetch(
    `http://127.0.0.1:9100/environments/${environmentId}/performances/${performanceId}.json?ns=${project}-default-rtdb`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer owner',
      },
      body: JSON.stringify(data),
    },
  );
  expect(response.status).toBe(200);
}

function config(environmentId) {
  return {
    schemaVersion: 1,
    appVersion: '0.1.0',
    environmentId,
    environmentType: 'evaluation-firebase',
    environmentName: 'ローカル認可試験',
    firebase: {
      apiKey: 'demo-key',
      projectId: project,
      appId: 'demo-web',
      authDomain: 'localhost',
      databaseURL: `https://${project}-default-rtdb.firebaseio.com/`,
    },
  };
}

async function signedIn(page) {
  const person = await createPerson(),
    environmentId = randomUUID(),
    settings = config(environmentId);
  await page.goto('http://127.0.0.1:4181/');
  const deviceUid = await page.evaluate(
    async ({ settings, person }) => {
      const module = await import('/src/adapters/firebase/principals.ts');
      const principals = module.createFirebasePrincipals(settings, 9291);
      await module.signInHumanPassword(principals, person.email, person.password);
      const deviceUid = await module.ensureDeviceIdentity(principals);
      window.testPrincipals = principals;
      return deviceUid;
    },
    { settings, person },
  );
  return { person, environmentId, settings, deviceUid };
}

test('AUTH110-S01 本人・端末のAuthを分離し、準備時だけ認証状態を永続化する', async ({ page }) => {
  const f = await signedIn(page);
  const first = await page.evaluate(async () => {
    const module = await import('/src/adapters/firebase/principals.ts');
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
    provider: 'password',
    verified: true,
    differentApps: true,
    anonymousDevice: true,
  });
  expect(f.deviceUid).not.toBe(f.person.uid);
  await page.reload();
  const restored = await page.evaluate(async (settings) => {
    const module = await import('/src/adapters/firebase/principals.ts');
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

test('AUTH110-S02 製品SDKで本人証跡を発行し、現在認可を取得する', async ({ page }) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const result = await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const adapter = await import('/src/adapters/firebase/authorization-port.ts');
      const controllerModule = await import('/src/security/authorization-controller.ts');
      const port = await adapter.createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      const stored = await port.issueSession(Date.now() + 60000);
      const controller = new controllerModule.AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      controller.access('qrReception')();
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
    state: 'online',
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

test('AUTH110-S03 停止の通知で通常操作をロックし、外部のFirebaseへ要求しない', async ({ page }) => {
  const external = [];
  page.on('request', (request) => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname))
      external.push(new URL(request.url()).hostname);
  });
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const { createAuthorizationPort } = await import(
        '/src/adapters/firebase/authorization-port.ts'
      );
      const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
      const port = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await port.issueSession(Date.now() + 60000);
      const controller = new AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      window.testAuthorizationPort = port;
      window.testAuthorizationController = controller;
    },
    { environmentId: f.environmentId, performanceId },
  );
  const response = await fetch(
    `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}/devices/${f.deviceUid}/active.json?ns=${project}-default-rtdb`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer owner',
      },
      body: 'false',
    },
  );
  expect(response.status).toBe(200);
  await expect
    .poll(() => page.evaluate(() => window.testAuthorizationController.state))
    .toBe('locked');
  expect(
    await page.evaluate(() => {
      try {
        window.testAuthorizationController.access('qrReception');
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

test('DD96-S01 同じ本人UIDのGoogle連携後、固定入力を暗号化して役割を一体確定する', async ({
  page,
}) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const uid = await page.evaluate(
    async (identity) => {
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      return linkFictionalGoogle(window.testPrincipals, identity);
    },
    { sub: randomUUID(), email: f.person.email },
  );
  expect(uid).toBe(f.person.uid);
  const now = Date.now(),
    targetUid = `fictional-target-${randomUUID()}`;
  const targetDeviceUid = `fictional-device-${randomUUID()}`;
  const updates = {
    [`roles/${f.person.uid}/role`]: 'owner',
    [`devices/${f.deviceUid}/preparedRole`]: 'owner',
    [`devices/${targetDeviceUid}`]: {
      environmentId: f.environmentId,
      performanceId,
      schemaVersion: 2,
      deviceUid: targetDeviceUid,
      humanUid: targetUid,
      active: true,
      approved: true,
      retired: false,
      storageEpoch: randomUUID(),
      preparedRole: 'receptionist',
      preparedRoleRevision: 1,
    },
    [`roles/${targetUid}`]: {
      environmentId: f.environmentId,
      performanceId,
      humanUid: targetUid,
      role: 'receptionist',
      active: true,
      revision: 1,
      startsAt: now - 1000,
      endsAt: now + 3600000,
    },
  };
  const response = await fetch(
    `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}.json?ns=${project}-default-rtdb`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify(updates),
    },
  );
  expect(response.status).toBe(200);
  const result = await page.evaluate(
    async ({ environmentId, performanceId, targetUid, targetDeviceUid, operationId }) => {
      const { createAuthorizationPort } = await import(
        '/src/adapters/firebase/authorization-port.ts'
      );
      const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
      const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
      const { createAuthorizationOperationJournal } = await import(
        '/src/storage/authorization-operations.ts'
      );
      const port = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await port.issueSession(Date.now() + 60000);
      const controller = new AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      const { snapshot } = await port.fetchCurrent();
      const keyScope = {
        environmentId,
        performanceId,
        deviceUid: snapshot.deviceAuthUid,
        humanUid: snapshot.role.humanUid,
        storageEpoch: snapshot.device.storageEpoch,
      };
      await ensureDeviceKey(keyScope, true);
      const journal = createAuthorizationOperationJournal(keyScope);
      const authorized = controller.access('manageRoles');
      await port.roles.saveRoleRequest(
        targetUid,
        {
          operationId,
          expectedRevision: 1,
          nextRole: 'temporary',
          startsAt: Date.now() - 1000,
          endsAt: Date.now() + 300000,
        },
        journal,
        authorized,
      );
      const saved = await journal.read(operationId, authorized);
      const first = await port.roles.commit(operationId, journal, authorized);
      const repeated = await port.roles.commit(operationId, journal, authorized);
      const target = await port.roles.target(targetUid);
      const { TEMPORARY_PERMISSIONS } = await import('/src/domain/authorization/types.ts');
      const cancellationId = crypto.randomUUID();
      await port.roles.savePermissionInput(
        targetUid,
        {
          operationId: cancellationId,
          expectedRevision: 2,
          revoke: true,
          validFrom: Date.now() - 500,
          validUntil: Date.now() + 60000,
          permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map((key) => [key, true])),
        },
        journal,
        authorized,
      );
      const cancelled = await port.roles.cancel(cancellationId, journal, authorized);
      const deviceOperationId = crypto.randomUUID();
      await port.devices.prepare(
        {
          operationId: deviceOperationId,
          targetDeviceUid,
          expectedRevision: 1,
          kind: 'stop',
          replacementDeviceUid: '',
        },
        journal,
        authorized,
      );
      const stopped = await port.devices.commit(deviceOperationId, journal, authorized);
      controller.dispose();
      port.dispose();
      return {
        savedKind: saved.kind,
        first: first.operationId,
        repeated: repeated.operationId,
        revision: target.revision,
        role: target.role,
        cancelled: cancelled.status,
        stopped: stopped.nextActive === false,
      };
    },
    {
      environmentId: f.environmentId,
      performanceId,
      targetUid,
      targetDeviceUid,
      operationId: randomUUID(),
    },
  );
  expect(result.savedKind).toBe('roleChange');
  expect(result.first).toBe(result.repeated);
  expect(result.revision).toBe(2);
  expect(result.role).toBe('temporary');
  expect(result.cancelled).toBe('cancelled');
  expect(result.stopped).toBe(true);
});

test('CONF069-S01 SDKの主担当引継ぎで旧画面をロックし、新主担当の追加準備前は管理を拒否する', async ({
  page,
  context,
}) => {
  const f = await signedIn(page),
    successor = await createPerson();
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const successorPage = await context.newPage();
  await successorPage.goto('http://127.0.0.1:4181/');
  const successorDevice = await successorPage.evaluate(
    async ({ settings, person, googleSub }) => {
      const module = await import('/src/adapters/firebase/principals.ts');
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      const principals = module.createFirebasePrincipals(settings, 9291);
      await module.signInHumanPassword(principals, person.email, person.password);
      await linkFictionalGoogle(principals, { sub: googleSub, email: person.email });
      window.testPrincipals = principals;
      return module.ensureDeviceIdentity(principals);
    },
    { settings: f.settings, person: successor, googleSub: randomUUID() },
  );
  await page.evaluate(
    async (identity) => {
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      await linkFictionalGoogle(window.testPrincipals, identity);
    },
    { sub: randomUUID(), email: f.person.email },
  );
  const now = Date.now(),
    operationId = randomUUID();
  const updates = {
    [`roles/${f.person.uid}/role`]: 'owner',
    [`devices/${f.deviceUid}/preparedRole`]: 'owner',
    'control/ownerUid': f.person.uid,
    [`roles/${successor.uid}`]: {
      environmentId: f.environmentId,
      performanceId,
      humanUid: successor.uid,
      role: 'deputy',
      active: true,
      revision: 1,
      startsAt: now - 1000,
      endsAt: now + 3600000,
    },
    [`devices/${successorDevice}`]: {
      environmentId: f.environmentId,
      performanceId,
      schemaVersion: 2,
      deviceUid: successorDevice,
      humanUid: successor.uid,
      active: true,
      approved: true,
      retired: false,
      storageEpoch: randomUUID(),
      preparedRole: 'deputy',
      preparedRoleRevision: 1,
    },
  };
  const seeded = await fetch(
    `http://127.0.0.1:9100/environments/${f.environmentId}/performances/${performanceId}.json?ns=${project}-default-rtdb`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify(updates),
    },
  );
  expect(seeded.status).toBe(200);
  const setup = async (page, owner) =>
    page.evaluate(
      async ({ environmentId, performanceId, owner }) => {
        const { createAuthorizationPort } = await import(
          '/src/adapters/firebase/authorization-port.ts'
        );
        const { AuthorizationController } = await import(
          '/src/security/authorization-controller.ts'
        );
        const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
        const { createAuthorizationOperationJournal } = await import(
          '/src/storage/authorization-operations.ts'
        );
        const port = await createAuthorizationPort(
          window.testPrincipals,
          { environmentId, performanceId },
          { emulatorDatabasePort: 9100 },
        );
        await port.issueSession(Date.now() + 60000);
        const controller = new AuthorizationController(port, '0.1.0', () => {});
        await controller.reconnect();
        const { snapshot } = await port.fetchCurrent();
        const keyScope = {
          environmentId,
          performanceId,
          deviceUid: snapshot.deviceAuthUid,
          humanUid: snapshot.role.humanUid,
          storageEpoch: snapshot.device.storageEpoch,
        };
        if (owner) {
          await ensureDeviceKey(keyScope, true);
          window.testJournal = createAuthorizationOperationJournal(keyScope);
        }
        window.testAuthorizationPort = port;
        window.testAuthorizationController = controller;
      },
      { environmentId: f.environmentId, performanceId, owner },
    );
  await setup(page, true);
  await setup(successorPage, false);
  await page.evaluate(
    async (input) => {
      const authorized = window.testAuthorizationController.access('handoverOwner');
      window.testHandoverAuthorization = authorized;
      await window.testAuthorizationPort.ownerHandover.prepare(
        input,
        window.testJournal,
        authorized,
      );
    },
    {
      operationId,
      targetUid: successor.uid,
      successorDeviceUid: successorDevice,
      previousOwnerDisposition: 'deputy',
    },
  );
  await successorPage.evaluate(
    async (id) => window.testAuthorizationPort.ownerHandover.accept(id),
    operationId,
  );
  const result = await page.evaluate(
    async (id) =>
      window.testAuthorizationPort.ownerHandover.commit(
        id,
        window.testJournal,
        window.testHandoverAuthorization,
      ),
    operationId,
  );
  expect(result.targetUid).toBe(successor.uid);
  expect(result.targetResultingRevision).toBe(2);
  await expect
    .poll(() => page.evaluate(() => window.testAuthorizationController.state))
    .toBe('locked');
  const waiting = await successorPage.evaluate(async () => {
    const controller = window.testAuthorizationController;
    await controller.reconnect();
    try {
      controller.access('manageRoles');
      return false;
    } catch {
      return true;
    }
  });
  expect(waiting).toBe(true);
  for (const currentPage of [page, successorPage])
    await currentPage.evaluate(() => {
      window.testAuthorizationController.dispose();
      window.testAuthorizationPort.dispose();
    });
  await successorPage.close();
});

test('AUTH110-S04 SDKのキャッシュがあっても、切断後にオンライン認可の再確認を成功にしない', async ({
  page,
}) => {
  const f = await signedIn(page);
  await seed(f.environmentId, f.person.uid, f.deviceUid);
  const result = await page.evaluate(
    async ({ environmentId, performanceId }) => {
      const { createAuthorizationPort } = await import(
        '/src/adapters/firebase/authorization-port.ts'
      );
      const { AuthorizationController } = await import('/src/security/authorization-controller.ts');
      const { disconnectFictionalDevice } = await import('/tests/emulator/sdk-fixture.mjs');
      const port = await createAuthorizationPort(
        window.testPrincipals,
        { environmentId, performanceId },
        { emulatorDatabasePort: 9100 },
      );
      await port.issueSession(Date.now() + 60000);
      const controller = new AuthorizationController(port, '0.1.0', () => {});
      await controller.reconnect();
      controller.access('receptionRead')();
      disconnectFictionalDevice(window.testPrincipals);
      let denied = false;
      try {
        await controller.reconnect();
      } catch {
        denied = true;
      }
      const state = controller.state;
      controller.dispose();
      port.dispose();
      return { denied, state };
    },
    { environmentId: f.environmentId, performanceId },
  );
  expect(result).toEqual({ denied: true, state: 'locked' });
});

test('AUTH110-S05 セッション保存が使えなければ、未準備のまま長期保存へ逃げない', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4181/');
  const code = await page.evaluate(async (settings) => {
    const module = await import('/src/adapters/firebase/principals.ts');
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) {
      if (this === sessionStorage)
        throw new DOMException('fictional disabled storage', 'SecurityError');
      return setItem.apply(this, args);
    };
    try {
      module.createFirebasePrincipals(settings, 9291);
      return 'unexpected success';
    } catch (error) {
      return error.code;
    } finally {
      Storage.prototype.setItem = setItem;
    }
  }, config(randomUUID()));
  expect(code).toBe('SESSION_PERSISTENCE_UNAVAILABLE');
});
