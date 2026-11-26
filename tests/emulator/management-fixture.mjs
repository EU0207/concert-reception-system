// 端末管理・臨時権限のSDK試験で、架空本人と承認済み管理端末の準備を共通化する。

import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createPerformanceCalendar } from '../../src/domain/authorization/performance-calendar.ts';

const project = 'demo-concert-reception-product', performanceId = '00000000-0000-4000-8000-000000000002';
const endpoint = 'http://127.0.0.1:9291/identitytoolkit.googleapis.com/v1/';

/** 架空の確認済みパスワード本人をローカルAuthに作成する。 */
async function person() {
  const email = `fictional-${randomUUID()}@example.invalid`, password = 'Fictional123';
  const response = await fetch(endpoint + 'accounts:signUp?key=demo-key', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  expect(response.status).toBe(200);
  const account = await response.json();
  const verified = await fetch(endpoint + `projects/${project}/accounts:update`, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: account.localId, emailVerified: true }) });
  expect(verified.status).toBe(200);
  return { uid: account.localId, email, password };
}

/** 同じ公演で、別々の本人・匿名端末のAuthを用意する。 */
async function principals(page, settings, user, google) {
  await page.goto('http://127.0.0.1:4181/tests/emulator/device-management-fixture.html');
  await page.waitForFunction(() => window.deviceFixtureReady === true);
  return page.evaluate(async ({ settings, user, google }) => {
    const { createFirebasePrincipals, signInHumanPassword, ensureDeviceIdentity } = await import('/src/adapters/firebase/principals.ts');
    window.devicePrincipals = createFirebasePrincipals(settings, 9291);
    await signInHumanPassword(window.devicePrincipals, user.email, user.password);
    if (google) {
      const { linkFictionalGoogle } = await import('/tests/emulator/sdk-fixture.mjs');
      await linkFictionalGoogle(window.devicePrincipals, { sub: crypto.randomUUID(), email: user.email });
    }
    return ensureDeviceIdentity(window.devicePrincipals);
  }, { settings, user, google });
}

/** 対象公演の試験用管理端末を準備し、一般受付端末は製品の通常登録を行う。 */
export async function setup(page, browser) {
  const owner = await person(), staff = await person(), environmentId = randomUUID();
  const settings = { schemaVersion: 1, appVersion: '0.1.0', environmentId, environmentType: 'evaluation-firebase',
    environmentName: 'ローカル端末管理試験', firebase: { apiKey: 'demo-key', projectId: project, appId: 'demo-web',
      authDomain: 'localhost', databaseURL: `https://${project}-default-rtdb.firebaseio.com/` } };
  const ownerDevice = await principals(page, settings, owner, true);
  const other = await browser.newContext(), target = await other.newPage();
  const staffDevice = await principals(target, settings, staff, false);
  const scope = { environmentId, performanceId }, now = Date.now(), expires = now + 3600_000, epoch = randomUUID();
  const root = `http://127.0.0.1:9100/environments/${environmentId}/performances/${performanceId}.json?ns=${project}-default-rtdb`;
  const response = await fetch(root, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ roles: Object.fromEntries([[owner.uid, 'owner'], [staff.uid, 'receptionist']].map(([uid, role]) =>
      [uid, { ...scope, humanUid: uid, role, active: true, revision: 1, startsAt: now - 10000, endsAt: expires }])),
    devices: { [ownerDevice]: { ...scope, schemaVersion: 2, deviceUid: ownerDevice, humanUid: owner.uid, active: true,
      approved: true, retired: false, storageEpoch: epoch, preparedRole: 'owner', preparedRoleRevision: 1, revision: 1 } },
    control: { ...scope, state: 'preparing', staffDeadline: expires, ownerUid: owner.uid,
      calendar: createPerformanceCalendar(scope, '2099-10-10', 'UTC', 1) } }) });
  expect(response.status).toBe(200);
  await target.evaluate(async (scope) => {
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    window.staffPort = await createAuthorizationPort(window.devicePrincipals, scope, { emulatorDatabasePort: 9100 });
    await window.staffPort.registration.request(); await window.staffPort.registration.bindHuman();
  }, scope);
  const binding = { ...scope, humanUid: owner.uid, deviceUid: ownerDevice, storageEpoch: epoch };
  await page.evaluate(async ({ binding, expires }) => {
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
    window.managementPort = await createAuthorizationPort(window.devicePrincipals, binding, { emulatorDatabasePort: 9100 });
    await window.managementPort.issueSession(expires);
    await ensureDeviceKey(binding, true);
  }, { binding, expires });
  return { scope, binding, settings, staffDevice, target, other, root };
}
