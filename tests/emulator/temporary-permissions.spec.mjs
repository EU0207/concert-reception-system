// 通常SDKと製品Rulesで、臨時権限の保存・再起動回収と一般受付からの直接拒否を確認する。

import { test, expect } from '@playwright/test';
import { setup } from './management-fixture.mjs';
import { TEMPORARY_PERMISSIONS } from '../../src/domain/authorization/types.ts';

/** 共通の通常登録fixtureへ、既存の臨時役割・初期設定を架空データとして投入する。 */
async function prepare(page, browser) {
  const f = await setup(page, browser);
  const data = await (await fetch(f.root, { headers: { authorization: 'Bearer owner' } })).json();
  const uid = data.devices[f.staffDevice].humanUid, role = { ...data.roles[uid], role: 'temporary' };
  const profile = { schemaVersion: 1, humanUid: uid, roleVersion: 1, status: 'active', validFrom: role.startsAt, validUntil: role.endsAt,
    permissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map(key => [key, true])) };
  const response = await fetch(f.root, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ [`roles/${uid}`]: role, [`temporaryPermissionProfiles/${uid}/1`]: profile,
      [`devices/${f.staffDevice}`]: { ...data.devices[f.staffDevice], active: true, approved: true, preparedRole: 'temporary', preparedRoleRevision: 1 } }) });
  expect(response.status).toBe(200);
  return { ...f, uid };
}

/** 通常SDKの設定画面を開き、指定した1回だけ送信前後で応答を失わせる。 */
async function mount(page, binding, loss = '') {
  await page.evaluate(async ({ binding, loss }) => {
    const { createTemporaryPermissionsUiPort } = await import('/src/adapters/firebase/temporary-permissions-ui-port.ts');
    const { createTemporaryPermissionsScreen } = await import('/src/app/temporary-permissions-screen.ts');
    const port = createTemporaryPermissionsUiPort(window.managementPort, binding), original = port.commit;
    let lose = Boolean(loss);
    port.commit = async id => { if (!lose) return original(id); lose = false; if (loss === 'after') await original(id); throw Error('FICTIONAL_RESPONSE_LOSS'); };
    window.permissionScreen = createTemporaryPermissionsScreen(port);
    document.body.replaceChildren(window.permissionScreen.element);
  }, { binding, loss });
}

/** 本人・端末と保存済みの鍵を復元し、実接続の成立後に新しい画面を開く。 */
async function reopen(page, f) {
  await page.reload(); await page.waitForFunction(() => window.deviceFixtureReady === true);
  await page.evaluate(async ({ settings, binding }) => {
    const { createFirebasePrincipals } = await import('/src/adapters/firebase/principals.ts');
    const { createAuthorizationPort } = await import('/src/adapters/firebase/authorization-port.ts');
    const { getFictionalDeviceDatabase, ref, onValue } = await import('/tests/emulator/sdk-fixture.mjs');
    window.devicePrincipals = createFirebasePrincipals(settings, 9291);
    await Promise.all([window.devicePrincipals.humanAuth.authStateReady(), window.devicePrincipals.deviceAuth.authStateReady()]);
    window.managementPort = await createAuthorizationPort(window.devicePrincipals, binding, { emulatorDatabasePort: 9100 });
    const db = getFictionalDeviceDatabase(window.devicePrincipals);
    await new Promise((resolve, reject) => {
      let stop;
      const timer = setTimeout(() => { stop?.(); reject(Error('FICTIONAL_CONNECTION_TIMEOUT')); }, 5000);
      stop = onValue(ref(db, '.info/connected'), value => {
        if (value.val() === true) { clearTimeout(timer); queueMicrotask(() => stop()); resolve(); }
      }, reject);
    });
  }, { settings: f.settings, binding: f.binding });
  await mount(page, f.binding);
}

/** 現在の設定を確認して、一回の保存へ進む。 */
async function save(page) {
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  await page.getByRole('button', { name: 'この内容で保存', exact: true }).click();
}

/** 確定後の自動取得が済んだ案内を閉じる。 */
async function closeResult(page) {
  await page.getByRole('dialog', { name: '結果を確認しました', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
}

test('TEMP313-S01 通常SDKで保存・取消し・復元を一体確定し、保存失敗と受付側の直接取得を拒否する', async ({ page, browser }) => {
  const f = await prepare(page, browser);
  try {
    await mount(page, f.binding);
    await page.getByRole('button', { name: '権限を設定', exact: true }).click();
    await page.getByRole('checkbox', { name: '手動受付', exact: true }).uncheck();
    await page.evaluate(() => {
      window.permissionOriginalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === 'authorizationOperations') throw new DOMException('fictional quota', 'QuotaExceededError');
        return window.permissionOriginalAdd.apply(this, args);
      };
    });
    await save(page); await expect(page.getByRole('alert')).toContainText('設定を変更できません');
    let data = await (await fetch(f.root, { headers: { authorization: 'Bearer owner' } })).json();
    expect(data.roles[f.uid].revision).toBe(1); expect(data.temporaryPermissionOperations).toBeUndefined();
    await page.evaluate(() => { IDBObjectStore.prototype.add = window.permissionOriginalAdd; });
    await page.getByRole('button', { name: '権限を設定', exact: true }).click();
    await page.getByRole('checkbox', { name: '手動受付', exact: true }).uncheck(); await save(page); await closeResult(page);
    await expect(page.locator('.permission-card')).toContainText('手動受付：×');
    await page.getByRole('button', { name: '権限を設定', exact: true }).click();
    await page.getByRole('button', { name: '設定を取り消す', exact: true }).click();
    await page.getByRole('button', { name: 'この内容で保存', exact: true }).click(); await closeResult(page);
    await expect(page.locator('.permission-card')).toContainText('設定取消済み');
    await page.getByRole('button', { name: '権限を設定', exact: true }).click();
    await page.getByRole('button', { name: '既定値（すべて○）に戻す', exact: true }).click(); await save(page); await closeResult(page);
    data = await (await fetch(f.root, { headers: { authorization: 'Bearer owner' } })).json();
    expect(data.roles[f.uid]).toMatchObject({ role: 'temporary', revision: 4 });
    expect(data.temporaryPermissionProfiles[f.uid]['2'].permissions.manualReception).toBe(false);
    expect(data.temporaryPermissionProfiles[f.uid]['3'].status).toBe('revoked');
    expect(Object.values(data.temporaryPermissionProfiles[f.uid]['3'].permissions).every(value => value === false)).toBe(true);
    expect(Object.values(data.temporaryPermissionProfiles[f.uid]['4'].permissions).every(value => value === true)).toBe(true);
    expect(Object.keys(data.temporaryPermissionOperations)).toHaveLength(3);
    expect(Object.keys(data.authorizationAudit)).toHaveLength(3);
    expect(data.devices[f.staffDevice].preparedRoleRevision).toBe(1);
    expect(data.devices[f.staffDevice].preparedRoleRevision).not.toBe(data.roles[f.uid].revision);
    const denied = await f.target.evaluate(async scope => {
      const { getFictionalDeviceDatabase, ref, get } = await import('/tests/emulator/sdk-fixture.mjs');
      const db = getFictionalDeviceDatabase(window.devicePrincipals);
      try { await get(ref(db, `environments/${scope.environmentId}/performances/${scope.performanceId}/roles`)); return false; }
      catch { return true; }
    }, f.scope);
    expect(denied).toBe(true);
  } finally { await f.other.close(); }
});

test('TEMP313-S02 応答喪失と未送信を再起動後に回収し、同じIDの再試行・未確定案の取消しを行う', async ({ page, browser }) => {
  const f = await prepare(page, browser);
  try {
    await mount(page, f.binding, 'after');
    await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
    await expect(page.getByRole('alert')).toContainText('結果を確認'); await reopen(page, f);
    await expect(page.getByRole('button', { name: '権限を設定', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '結果を確認', exact: true })).toHaveCount(0);
    await page.evaluate(() => window.permissionScreen.dispose()); await mount(page, f.binding, 'before');
    await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
    await expect(page.getByRole('alert')).toContainText('結果を確認'); await reopen(page, f);
    await page.getByRole('button', { name: '同じ操作を再試行', exact: true }).click(); await closeResult(page);
    await page.evaluate(() => window.permissionScreen.dispose()); await mount(page, f.binding, 'before');
    await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
    await expect(page.getByRole('alert')).toContainText('結果を確認'); await reopen(page, f);
    await page.getByRole('button', { name: '未確定案を取り消す', exact: true }).click(); await closeResult(page);
    const data = await (await fetch(f.root, { headers: { authorization: 'Bearer owner' } })).json();
    expect(data.roles[f.uid].revision).toBe(3);
    expect(Object.keys(data.temporaryPermissionOperations)).toHaveLength(3);
    expect(Object.values(data.temporaryPermissionOperations).filter(item => item.result.status === 'cancelled')).toHaveLength(1);
    expect(Object.keys(data.authorizationAudit)).toHaveLength(3);
  } finally { await f.other.close(); }
});

test('TEMP313-S03 承認・役割準備済みの一般受付でも設定一覧の取得を拒否する', async ({ page, browser }) => {
  const f = await setup(page, browser);
  try {
    const data = await (await fetch(f.root, { headers: { authorization: 'Bearer owner' } })).json();
    const device = data.devices[f.staffDevice], uid = device.humanUid;
    const response = await fetch(f.root, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({ [`devices/${f.staffDevice}`]: { ...device, active: true, approved: true, preparedRole: 'receptionist', preparedRoleRevision: 1 } }) });
    expect(response.status).toBe(200);
    const result = await f.target.evaluate(async expires => {
      await window.staffPort.issueSession(expires);
      try { await window.staffPort.roles.listTemporaryPermissions(); return 'UNEXPECTED_SUCCESS'; }
      catch (cause) { return cause.code; }
    }, data.roles[uid].endsAt);
    expect(result).toBe('ROLE_FORBIDDEN');
  } finally { await f.other.close(); }
});
