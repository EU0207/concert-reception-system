// ローカルAuth・RTDBと通常SDKで、端末管理画面の確定と再起動後の操作回収を確認する。

import { test, expect } from '@playwright/test';
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
async function setup(page, browser) {
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

/** 通常SDKの管理画面を開き、任意の1回だけ応答を失わせる。 */
async function mount(page, binding, loss = '') {
  await page.evaluate(async ({ binding, loss }) => {
    const { createDeviceManagementUiPort } = await import('/src/adapters/firebase/device-management-ui-port.ts');
    const { createDeviceManagementScreen } = await import('/src/app/device-management-screen.ts');
    const port = createDeviceManagementUiPort(window.managementPort, binding), original = port.commit;
    const originalLoad = port.load;
    window.managementLoadErrors = [];
    port.load = async () => {
      try { return await originalLoad(); }
      catch (cause) {
        const code = String(cause?.code ?? 'UNCLASSIFIED');
        window.managementLoadErrors.push(/^[A-Z0-9_/-]+$/i.test(code) ? code : 'REDACTED');
        throw cause;
      }
    };
    let lose = Boolean(loss);
    port.commit = async (id) => {
      if (!lose) return original(id);
      lose = false;
      if (loss === 'after') await original(id);
      throw Error('FICTIONAL_LOST_RESPONSE');
    };
    window.managementScreen = createDeviceManagementScreen(port);
    document.body.replaceChildren(window.managementScreen.element);
  }, { binding, loss });
}

/** 対象端末カードの確認ダイアログから明示変更する。 */
async function change(page, kind) {
  const card = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /一般受付担当者/ }) });
  await card.getByRole('button', { name: kind, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: `${kind}する`, exact: true }).click();
}

/** 認証を復元し、同じ端末・鍵と固定入力で新しい画面を開く。 */
async function reopen(page, fixture) {
  await page.reload();
  await page.waitForFunction(() => window.deviceFixtureReady === true);
  await page.evaluate(async ({ settings, binding }) => {
    const { createFirebasePrincipals } = await import('/src/adapters/firebase/principals.ts');
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    window.devicePrincipals = createFirebasePrincipals(settings, 9291);
    await Promise.all([window.devicePrincipals.humanAuth.authStateReady(), window.devicePrincipals.deviceAuth.authStateReady()]);
    window.managementPort = await createAuthorizationPort(window.devicePrincipals, binding, { emulatorDatabasePort: 9100 });
  }, { settings: fixture.settings, binding: fixture.binding });
  await mount(page, fixture.binding);
  await page.waitForFunction(() => document.querySelector('.device-card') || document.querySelector('[role="alert"]')?.textContent);
  const errors = await page.evaluate(() => window.managementLoadErrors);
  if (errors.includes('NETWORK_RECONFIRMATION_REQUIRED')) {
    // SDK復元直後の未接続を成功扱いにせず、実際の接続成立後に利用者の確認操作を行う。
    await page.evaluate(async () => {
      const { getFictionalDeviceDatabase, ref, onValue } = await import('/tests/emulator/sdk-fixture.mjs');
      const db = getFictionalDeviceDatabase(window.devicePrincipals);
      await new Promise((resolve, reject) => {
        let stop;
        const timer = setTimeout(() => { stop?.(); reject(Error('FICTIONAL_CONNECTION_TIMEOUT')); }, 5000);
        stop = onValue(ref(db, '.info/connected'), value => {
          if (value.val() === true) { clearTimeout(timer); queueMicrotask(() => stop()); resolve(); }
        }, reject);
      });
    });
    await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
  }
  await expect(page.getByRole('alert')).toBeEmpty();
}

test('DEVICE308-S01 通常登録した端末を画面から承認・停止・解除・廃止し、自己廃止と一般受付の直接取得を拒否する', async ({ page, browser }) => {
  const f = await setup(page, browser);
  try {
    await mount(page, f.binding);
    await page.evaluate(() => {
      window.deviceOriginalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === 'authorizationOperations') throw new DOMException('fictional quota', 'QuotaExceededError');
        return window.deviceOriginalAdd.apply(this, args);
      };
    });
    await change(page, '承認');
    await expect(page.getByRole('alert')).toContainText('操作を完了できません');
    const notSent = await (await fetch(f.root, { headers: { authorization: 'Bearer owner' } })).json();
    expect(notSent.deviceAuthorizationOperations).toBeUndefined();
    expect(notSent.devices[f.staffDevice].approved).toBe(false);
    await page.evaluate(() => { IDBObjectStore.prototype.add = window.deviceOriginalAdd; });
    for (const kind of ['承認', '停止', '停止解除', '廃止']) {
      await change(page, kind);
      await expect(page.getByRole('status')).toContainText('確定');
      await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
    }
    await expect(page.locator('.device-card').filter({ hasText: '一般受付担当者' })).toContainText('廃止済み');
    const response = await fetch(f.root, { headers: { authorization: 'Bearer owner' } });
    const data = await response.json();
    expect(data.devices[f.staffDevice]).toMatchObject({ active: false, retired: true, revision: 5, preparedRoleRevision: 0 });
    // RTDBはnull値の子を保持しないため、未準備の役割は未存在として返る。
    expect(data.devices[f.staffDevice].preparedRole ?? null).toBe(null);
    expect(Object.keys(data.deviceAuthorizationOperations)).toHaveLength(4);
    const own = page.locator('.device-card').filter({ hasText: '主担当の端末' });
    await own.getByRole('button', { name: '廃止', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '廃止する', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('同じ主担当の別端末');
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(own.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
    const selfStop = await page.evaluate(async (binding) => {
      let saved = false;
      try {
        await window.managementPort.devices.prepare({ operationId: crypto.randomUUID(),
          targetDeviceUid: binding.deviceUid, expectedRevision: 1, kind: 'stop', replacementDeviceUid: '' },
        { save: async () => { saved = true; } }, () => {});
        return { code: 'UNEXPECTED_SUCCESS', saved };
      } catch (cause) { return { code: cause.code, saved }; }
    }, f.binding);
    expect(selfStop).toEqual({ code: 'SELF_DEVICE_STOP_FORBIDDEN', saved: false });
    const unchanged = await (await fetch(f.root, { headers: { authorization: 'Bearer owner' } })).json();
    expect(unchanged.devices[f.binding.deviceUid]).toMatchObject({ active: true, revision: 1 });
    expect(Object.keys(unchanged.deviceAuthorizationOperations)).toHaveLength(4);
    const denied = await f.target.evaluate(async (scope) => {
      const { getFictionalDeviceDatabase, get, ref } = await import('/tests/emulator/sdk-fixture.mjs');
      const db = getFictionalDeviceDatabase(window.devicePrincipals);
      const direct = await Promise.allSettled([get(ref(db, `environments/${scope.environmentId}/performances/${scope.performanceId}/devices`))]);
      return direct[0].status;
    }, f.scope);
    expect(denied).toBe('rejected');
  } finally { await f.other.close(); }
});

test('DEVICE308-S02 応答喪失の前後で再起動し、未送信入力の暗号化復元と同じIDの一回確定を行う', async ({ page, browser }) => {
  const f = await setup(page, browser);
  try {
    await mount(page, f.binding, 'after');
    await change(page, '承認');
    await expect(page.getByRole('alert')).toContainText('結果を確認');
    await reopen(page, f);
    await expect(page.locator('.device-card').filter({ hasText: '一般受付担当者' })).toContainText('承認済み');
    await expect(page.getByRole('button', { name: '結果を確認', exact: true })).toHaveCount(0);
    await page.evaluate(() => { window.managementScreen.dispose(); });
    await mount(page, f.binding, 'before');
    await change(page, '停止');
    await expect(page.getByRole('alert')).toContainText('結果を確認');
    await reopen(page, f);
    await expect(page.getByRole('button', { name: '結果を確認', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '結果を確認', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('まだ確認できません');
    await page.getByRole('button', { name: '同じ操作を再試行', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('確定');
    const response = await fetch(f.root, { headers: { authorization: 'Bearer owner' } });
    const data = await response.json();
    expect(data.devices[f.staffDevice]).toMatchObject({ active: false, revision: 3 });
    expect(Object.keys(data.deviceAuthorizationOperations)).toHaveLength(2);
  } finally { await f.other.close(); }
});
