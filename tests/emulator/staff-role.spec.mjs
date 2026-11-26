// 通常SDKと製品Rulesで、任命・解除の一体確定、保存失敗と再起動回収を確認する。

import { test, expect } from '@playwright/test';
import { setup } from './management-fixture.mjs';

/** 架空の公演を、エミュレーター管理経路だけで検査する。 */
async function data(f) {
  return (await fetch(f.root, { headers: { authorization: 'Bearer owner' } })).json();
}

/** 通常の役割画面を開き、一回だけ確定の前後で応答を失わせる。 */
async function mount(page, binding, loss = '') {
  await page.evaluate(async ({ binding, loss }) => {
    const { createStaffRoleUiPort } = await import('/src/adapters/firebase/staff-role-ui-port.ts');
    const { createStaffRoleScreen } = await import('/src/app/staff-role-screen.ts');
    const port = createStaffRoleUiPort(window.managementPort, binding), original = port.commit;
    let lose = Boolean(loss);
    port.commit = async id => {
      try {
        if (!lose) return await original(id);
        lose = false;
        if (loss === 'after') await original(id);
        if (loss === 'published') {
          const { createAuthorizationOperationJournal } = await import('/src/storage/authorization-operations.ts');
          const { getFictionalDeviceDatabase, ref, set } = await import('/tests/emulator/sdk-fixture.mjs');
          const saved = await createAuthorizationOperationJournal(binding).read(id, () => {});
          await set(ref(getFictionalDeviceDatabase(window.devicePrincipals), `environments/${binding.environmentId}/performances/${binding.performanceId}/roleChangeRequests/${id}`),
            { ...saved.request, requestedAt: { '.sv': 'timestamp' } });
        }
        throw Error('FICTIONAL_RESPONSE_LOSS');
      } catch (cause) { window.roleFailure = cause.code ?? cause.message; throw cause; }
    };
    window.roleScreen = createStaffRoleScreen(port); document.body.replaceChildren(window.roleScreen.element);
  }, { binding, loss });
}

/** 本人・端末・既存鍵を復元し、接続が戻ってから保存済み案を読み出す。 */
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

/** 入力の確認と保存を行う。 */
async function save(page) {
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  await page.getByRole('button', { name: 'この内容で保存', exact: true }).click();
}

/** 確定案内を閉じる。 */
async function closeResult(page) {
  await expect.poll(async () => page.evaluate(() => document.querySelector('dialog[open]') ? 'completed' : window.roleFailure ?? 'waiting')).toBe('completed');
  await page.getByRole('dialog', { name: '結果を確認しました', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
}

test('ROLE315-S01 任命・解除を一体確定し、保存失敗時は送信せず、対象の準備版は保持する', async ({ page, browser }) => {
  const f = await setup(page, browser);
  try {
    const before = await data(f), uid = before.devices[f.staffDevice].humanUid;
    await mount(page, f.binding);
    await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click();
    await page.evaluate(() => {
      window.originalRoleAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === 'authorizationOperations') throw new DOMException('fictional quota', 'QuotaExceededError');
        return window.originalRoleAdd.apply(this, args);
      };
    });
    await save(page); await expect(page.getByRole('alert')).toContainText('設定を変更できません');
    expect((await data(f)).roleChangeRequests).toBeUndefined();
    await page.evaluate(() => { IDBObjectStore.prototype.add = window.originalRoleAdd; });
    await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page); await closeResult(page);
    let current = await data(f);
    expect(current.roles[uid]).toMatchObject({ role: 'temporary', revision: 2, humanUid: uid });
    expect(Object.values(current.temporaryPermissionProfiles[uid]['2'].permissions)).toEqual(Array(9).fill(true));
    expect(current.devices[f.staffDevice]).toEqual(before.devices[f.staffDevice]);
    expect(Object.values(current.roleChangeResults)).toHaveLength(1); expect(Object.values(current.authorizationAudit)).toHaveLength(1);
    // 対象が直接、自分の役割だけを書き換える経路はRulesで拒否する。
    expect(await f.target.evaluate(async ({ scope, uid, role }) => {
      const { getFictionalDeviceDatabase, ref, set } = await import('/tests/emulator/sdk-fixture.mjs');
      try { await set(ref(getFictionalDeviceDatabase(window.devicePrincipals), `environments/${scope.environmentId}/performances/${scope.performanceId}/roles/${uid}`), { ...role, role: 'deputy', revision: 3 }); return false; }
      catch { return true; }
    }, { scope: f.scope, uid, role: current.roles[uid] })).toBe(true);
    await page.getByRole('button', { name: '臨時管理者を解除', exact: true }).click(); await save(page); await closeResult(page);
    current = await data(f);
    expect(current.roles[uid]).toMatchObject({ role: 'receptionist', revision: 3, humanUid: uid });
    expect(current.temporaryPermissionProfiles[uid]['3']).toBeUndefined();
    expect(current.devices[f.staffDevice]).toEqual(before.devices[f.staffDevice]);
    expect(Object.values(current.roleChangeResults)).toHaveLength(2); expect(Object.values(current.authorizationAudit)).toHaveLength(2);
  } finally { await f.other.close(); }
});

test('ROLE315-S02 応答喪失・未送信を実際の再起動後に照会し、同じIDで再試行・取消しする', async ({ page, browser }) => {
  const f = await setup(page, browser);
  try {
    const before = await data(f), uid = before.devices[f.staffDevice].humanUid;
    await mount(page, f.binding, 'after');
    await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page);
    await expect(page.getByRole('alert')).toContainText('結果を確認'); await reopen(page, f);
    await expect(page.getByRole('button', { name: '臨時管理者を解除', exact: true })).toBeVisible();
    expect(Object.keys((await data(f)).roleChangeResults)).toHaveLength(1);
    await page.evaluate(() => window.roleScreen.dispose()); await mount(page, f.binding, 'before');
    await page.getByRole('button', { name: '臨時管理者を解除', exact: true }).click(); await save(page);
    await expect(page.getByRole('alert')).toContainText('結果を確認'); await reopen(page, f);
    // 開き直しただけでは、サーバーへの変更案登録さえ増えない。
    expect(Object.keys((await data(f)).roleChangeRequests)).toHaveLength(1);
    await page.getByRole('button', { name: '同じ操作を再試行', exact: true }).click(); await closeResult(page);
    await page.evaluate(() => window.roleScreen.dispose()); await mount(page, f.binding, 'before');
    await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page);
    await expect(page.getByRole('alert')).toContainText('結果を確認'); await reopen(page, f);
    await page.getByRole('button', { name: '未確定案を取り消す', exact: true }).click(); await closeResult(page);
    const current = await data(f);
    expect(current.roles[uid]).toMatchObject({ role: 'receptionist', revision: 3 });
    expect(Object.values(current.roleChangeResults)).toHaveLength(3);
    expect(Object.values(current.roleChangeResults).filter(item => item.status === 'cancelled')).toHaveLength(1);
    expect(Object.values(current.authorizationAudit)).toHaveLength(3);
  } finally { await f.other.close(); }
});

test('ROLE315-S03 準備済み一般受付の一覧取得を拒否し、代理管理者は両方向を変更できる', async ({ page, browser }) => {
  const f = await setup(page, browser);
  try {
    const before = await data(f), device = before.devices[f.staffDevice], uid = device.humanUid;
    const changes = { [`devices/${f.staffDevice}`]: { ...device, active: true, approved: true, preparedRole: 'receptionist', preparedRoleRevision: 1 } };
    expect((await fetch(f.root, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify(changes) })).status).toBe(200);
    const denied = await f.target.evaluate(async expires => {
      await window.staffPort.issueSession(expires);
      try { await window.staffPort.roles.listStaffRoles(); return 'UNEXPECTED_SUCCESS'; }
      catch (cause) { return cause.code; }
    }, before.roles[uid].endsAt);
    expect(denied).toBe('ROLE_FORBIDDEN');
    const actor = before.roles[f.binding.humanUid], actorDevice = before.devices[f.binding.deviceUid];
    expect((await fetch(f.root, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({ [`roles/${actor.humanUid}`]: { ...actor, role: 'deputy' }, [`devices/${actorDevice.deviceUid}`]: { ...actorDevice, preparedRole: 'deputy' } }) })).status).toBe(200);
    await reopen(page, f);
    // 架空投入で役割を切り替えた後は、現在役割に一致する本人セッションを取得する。
    await page.evaluate(async expires => { await window.managementPort.issueSession(expires); }, actor.endsAt);
    await page.getByRole('button', { name: '最新の役割を確認', exact: true }).click();
    await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page); await closeResult(page);
    const preparation = await f.target.evaluate(async () => {
      const { authorizeOnline } = await import('/src/domain/authorization/policy.ts');
      const { snapshot, serverNow } = await window.staffPort.fetchCurrent();
      try { authorizeOnline(snapshot, 'manualReception', serverNow); return 'UNEXPECTED_SUCCESS'; }
      catch (cause) { return cause.code; }
    });
    expect(preparation).toBe('ROLE_PREPARATION_REQUIRED');
    await page.getByRole('button', { name: '臨時管理者を解除', exact: true }).click(); await save(page); await closeResult(page);
    expect((await data(f)).roles[uid]).toMatchObject({ role: 'receptionist', revision: 3 });
  } finally { await f.other.close(); }
});

test('ROLE315-S04 登録済み変更案を再起動後に同じIDで確定し、古い版の案は保持して拒否する', async ({ page, browser }) => {
  const f = await setup(page, browser);
  try {
    const before = await data(f), uid = before.devices[f.staffDevice].humanUid;
    await mount(page, f.binding, 'published');
    await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page);
    await expect(page.getByRole('alert')).toContainText('結果を確認');
    const published = await data(f), id = Object.keys(published.roleChangeRequests)[0];
    expect(published.roleChangeResults).toBeUndefined(); await reopen(page, f);
    await page.getByRole('button', { name: '同じ操作を再試行', exact: true }).click(); await closeResult(page);
    expect(Object.keys((await data(f)).roleChangeResults)).toEqual([id]);
    await page.evaluate(() => window.roleScreen.dispose()); await mount(page, f.binding, 'before');
    await page.getByRole('button', { name: '臨時管理者を解除', exact: true }).click(); await save(page);
    await expect(page.getByRole('alert')).toContainText('結果を確認');
    const current = await data(f);
    const profile = { ...current.temporaryPermissionProfiles[uid]['2'], roleVersion: 3 };
    expect((await fetch(f.root, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({ [`roles/${uid}`]: { ...current.roles[uid], revision: 3 }, [`temporaryPermissionProfiles/${uid}/3`]: profile }) })).status).toBe(200);
    await reopen(page, f);
    await expect(page.getByText(/版が変わった未確定入力1件/)).toBeVisible();
    await expect(page.getByRole('button', { name: '同じ操作を再試行', exact: true })).toHaveCount(0);
    const result = await page.evaluate(async binding => {
      const { createAuthorizationOperationJournal } = await import('/src/storage/authorization-operations.ts');
      const journal = createAuthorizationOperationJournal(binding);
      for (const id of await journal.list(() => {})) {
        const saved = await journal.read(id, () => {});
        if (saved.request.expectedRevision === 2) {
          try { await window.managementPort.roles.commit(id, journal, () => {}); return 'UNEXPECTED_SUCCESS'; }
          catch (cause) { return cause.code; }
        }
      }
      return 'MISSING_INPUT';
    }, f.binding);
    expect(result).toBe('STALE_OR_INACTIVE_TARGET');
    expect(Object.keys((await data(f)).roleChangeRequests)).toHaveLength(1);
  } finally { await f.other.close(); }
});
