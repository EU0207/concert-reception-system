// スタッフの任命・解除、期間入力と結果不明時の回収をPC・スマートフォン幅で確認する。

import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Tokyo' });

const route = '/#/events/00000000-0000-4000-8000-000000000001/roles';

/** 入力確認を経て、同じ案の保存へ進む。 */
async function save(page) {
  const confirm = page.getByRole('button', { name: '変更内容を確認', exact: true });
  if (await confirm.count()) await confirm.click();
  await page.getByRole('dialog').getByRole('button', { name: /^(任命する|再任命する|解除して一般受付へ戻す)$/ }).click();
}

/** 結果案内を閉じ、自動取得された一覧へ戻る。 */
async function closeResult(page) {
  await page.getByRole('dialog', { name: '結果を確認しました', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
}

/** 保存前後に応答を失わせる見本を、実際の製品画面へ接続する。 */
async function fixture(page, loss) {
  await page.goto('http://127.0.0.1:4181/tests/emulator/device-management-fixture.html');
  await page.waitForFunction(() => window.deviceFixtureReady === true);
  await page.evaluate(async loss => {
    const { createStaffRolePreview } = await import('/src/app/staff-role-preview.ts');
    const { createStaffRoleScreen } = await import('/src/app/staff-role-screen.ts');
    const backend = createStaffRolePreview({ environmentId: crypto.randomUUID(), performanceId: crypto.randomUUID() });
    const trial = { backend, calls: 0, saved: null, screen: null, port: null };
    let lose = true;
    trial.port = { ...backend, dispose() {},
      async prepare(change) { await backend.prepare(change); trial.saved = structuredClone(change); },
      async commit(id) { trial.calls++; if (lose) { lose = false; if (loss === 'after') await backend.commit(id); throw Error('FICTIONAL_RESPONSE_LOSS'); } return backend.commit(id); },
    };
    trial.screen = createStaffRoleScreen(trial.port, true);
    document.body.replaceChildren(trial.screen.element); window.roleTrial = trial;
  }, loss);
}

/** 同じバックエンド・保存済み案を使い、画面だけを開き直す。 */
async function remount(page) {
  await page.evaluate(async () => {
    const { createStaffRoleScreen } = await import('/src/app/staff-role-screen.ts');
    const trial = window.roleTrial; trial.screen.dispose(); trial.screen = createStaffRoleScreen(trial.port, true);
    document.body.replaceChildren(trial.screen.element);
  });
}

test('ROLE315-B01 任命と解除の確認・キャンセル・確定後の自動表示を確認する', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(10);
  await page.getByRole('checkbox', { name: '手動受付', exact: true }).uncheck();
  await expect(page.getByRole('dialog').getByRole('button')).toHaveText(['変更内容を確認', 'キャンセル']);
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('このスタッフの全ての端末に反映します。');
  await expect(page.getByRole('list', { name: '任命する権限' }).getByRole('listitem').filter({ hasText: '手動受付' }).getByRole('img', { name: 'OFF', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.locator('.staff-role-card')).toContainText('一般受付');
  await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page); await closeResult(page);
  await expect(page.locator('.staff-role-card')).toContainText('臨時管理者');
  await page.getByRole('button', { name: '臨時管理者を解除', exact: true }).click();
  await expect(page.getByRole('dialog').locator('input')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('臨時管理者を解除し、一般受付に戻します。');
  await save(page); await closeResult(page);
  await expect(page.locator('.staff-role-card')).toContainText('一般受付');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ROLE315-B02 不正な期間は赤いエラーで拒否し、保存しない', async ({ page }) => {
  await page.goto(route); await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click();
  await page.getByLabel('有効終了', { exact: true }).fill('2000-01-01T00:00');
  await expect(page.getByRole('button', { name: '変更内容を確認', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('有効開始より後');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeInViewport();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCSS('color', 'rgb(161, 38, 34)');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.locator('.staff-role-card')).toContainText('一般受付');
});

test('ROLE315-B03 確定応答の喪失は結果照会だけで回収する', async ({ page }) => {
  await fixture(page, 'after');
  await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  await page.getByRole('button', { name: '結果を確認', exact: true }).click(); await closeResult(page);
  expect(await page.evaluate(() => window.roleTrial.calls)).toBe(1);
  await expect(page.locator('.staff-role-card')).toContainText('臨時管理者');
});

test('ROLE315-B04 未送信案を再表示し、同じIDの明示再試行だけで一回確定する', async ({ page }) => {
  await fixture(page, 'before');
  await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認'); await remount(page);
  await expect(page.getByRole('button', { name: '同じ操作を再試行', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.roleTrial.calls)).toBe(1);
  await page.getByRole('button', { name: '同じ操作を再試行', exact: true }).click(); await closeResult(page);
  expect(await page.evaluate(async () => (await window.roleTrial.backend.load()).targets[0].role.revision)).toBe(2);
});

test('ROLE315-B05 未確定案の取消しは一般受付のまま、版変更済みの案は再送しない', async ({ page }) => {
  await fixture(page, 'before');
  await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  await page.getByRole('button', { name: '未確定案を取り消す', exact: true }).click(); await closeResult(page);
  expect(await page.evaluate(async () => (await window.roleTrial.backend.load()).targets[0].role.revision)).toBe(1);
  await fixture(page, 'before');
  await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  await page.evaluate(async () => {
    const trial = window.roleTrial, change = structuredClone(trial.saved); change.input.operationId = crypto.randomUUID();
    await trial.backend.prepare(change); await trial.backend.commit(change.input.operationId);
  });
  await page.getByRole('button', { name: '最新の役割を確認', exact: true }).click();
  await expect(page.getByText(/再確認が必要な未確定入力1件/)).toBeVisible();
  await expect(page.getByRole('button', { name: '同じ操作を再試行', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.roleTrial.calls)).toBe(1);
});

test('ROLE315-B06 認証期限で一覧と編集中の案を閉じる', async ({ page }) => {
  await fixture(page, 'before'); await page.clock.install();
  await page.evaluate(async () => {
    const { createStaffRoleScreen } = await import('/src/app/staff-role-screen.ts');
    const { createStaffRoleUiPort } = await import('/src/adapters/firebase/staff-role-ui-port.ts');
    const trial = window.roleTrial, data = await trial.backend.load(), actor = data.snapshot;
    actor.session.expiresAt = data.serverNow + 1000;
    const binding = { environmentId: actor.environmentId, performanceId: actor.performanceId, humanUid: actor.role.humanUid,
      deviceUid: actor.deviceAuthUid, storageEpoch: actor.device.storageEpoch };
    const authorization = { roles: { listStaffRoles: async () => data }, identity: () => ({ human: { uid: binding.humanUid }, deviceUid: binding.deviceUid }), onInvalidate: () => () => {} };
    trial.screen.dispose(); trial.screen = createStaffRoleScreen(createStaffRoleUiPort(authorization, binding));
    document.body.replaceChildren(trial.screen.element);
  });
  await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await page.clock.fastForward(1100);
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.staff-role-card')).toHaveCount(0);
});

test('ROLE315-B07 確定後の再取得失敗は確定結果と区別し、再取得で二重送信しない', async ({ page }) => {
  await fixture(page, 'before');
  await page.evaluate(() => {
    const trial = window.roleTrial; let loads = 0;
    trial.port.load = async () => { if (++loads === 2) throw Error('FICTIONAL_REFRESH_FAILURE'); return trial.backend.load(); };
    trial.port.commit = async id => { trial.calls++; return trial.backend.commit(id); };
  });
  await remount(page);
  await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click(); await save(page);
  await expect(page.getByRole('dialog')).toContainText('結果は確定しましたが');
  await closeResult(page); await expect(page.locator('.staff-role-card')).toHaveCount(0);
  await page.getByRole('button', { name: '最新の役割を確認', exact: true }).click();
  await expect(page.locator('.staff-role-card')).toContainText('臨時管理者');
  expect(await page.evaluate(() => window.roleTrial.calls)).toBe(1);
});

test('ROLE315-B08 日付を変えて上限を越えた理由と、開いたまま期限切れになった見本の案内が見える', async ({ page }) => {
  const time = new Date('2026-11-27T00:00:00Z');
  await page.clock.install({ time }); await page.clock.setFixedTime(time);
  await page.goto(route); await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click();
  await page.getByLabel('有効終了', { exact: true }).fill('2026-11-28T12:00');
  await expect(page.getByRole('button', { name: '変更内容を確認', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('スタッフ利用期限');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeInViewport();
  await page.clock.setFixedTime(new Date(time.getTime() + 16 * 60_000));
  await page.clock.runFor(1100);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('ページを再読み込み');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeInViewport();
  await expect(page.getByRole('button', { name: '任命する', exact: true })).toHaveCount(0);
});

test('ROLE315-B10 任期終了後は新しい権限で再任命し、公演の利用期限後は許可しない', async ({ page }) => {
  await page.clock.install(); await fixture(page, 'before');
  await page.evaluate(async () => {
    const trial = window.roleTrial, data = await trial.backend.load(), role = data.targets[0].role;
    const flags = Object.fromEntries(Object.keys(data.snapshot.temporaryProfile?.permissions ?? {}).map(key => [key, false]));
    const { TEMPORARY_PERMISSIONS } = await import('/src/domain/authorization/types.ts');
    const change = { targetUid: role.humanUid, input: { operationId: crypto.randomUUID(), expectedRevision: 1, nextRole: 'temporary',
      startsAt: data.serverNow - 1, endsAt: data.serverNow + 5000, initialPermissions: Object.fromEntries(TEMPORARY_PERMISSIONS.map(key => [key, false])) } };
    await trial.backend.prepare(change); await trial.backend.commit(change.input.operationId);
    trial.port.commit = id => trial.backend.commit(id);
  });
  await page.clock.fastForward(6000);
  await page.getByRole('button', { name: '最新の役割を確認', exact: true }).click();
  await page.getByRole('button', { name: '臨時管理者に再任命', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '手動受付', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'すべて選択／解除', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: '手動受付', exact: true }).check();
  await save(page); await closeResult(page);
  const profile = await page.evaluate(async () => (await window.roleTrial.backend.load()).targets[0].profile);
  expect(profile.roleVersion).toBe(3); expect(profile.permissions.manualReception).toBe(true);
  expect(Object.values(profile.permissions).filter(Boolean)).toHaveLength(1);
  await page.evaluate(() => {
    const trial = window.roleTrial;
    trial.port.load = async () => { const data = await trial.backend.load(); data.snapshot.staffDeadline = data.serverNow - 1; return data; };
  });
  await page.getByRole('button', { name: '最新の役割を確認', exact: true }).click();
  await expect(page.getByText('公演のスタッフ利用期限を過ぎています。この公演では任命できません。')).toBeVisible();
  await expect(page.getByRole('button', { name: '臨時管理者に再任命', exact: true })).toHaveCount(0);
});

test('ROLE315-B09 今日の日時を期限内で変更すると確認・保存できる', async ({ page }) => {
  const time = new Date('2026-11-27T00:00:00Z');
  await page.clock.install({ time }); await page.clock.setFixedTime(time);
  await page.goto(route); await page.getByRole('button', { name: '臨時管理者に任命', exact: true }).click();
  await page.getByLabel('有効開始', { exact: true }).fill('2026-11-27T08:59');
  await page.getByLabel('有効終了', { exact: true }).fill('2026-11-27T12:30');
  await save(page); await closeResult(page);
  await expect(page.locator('.staff-role-card')).toContainText('臨時管理者');
  await expect(page.locator('.staff-role-card')).toContainText('12:30');
});
