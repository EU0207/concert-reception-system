// 臨時管理者の設定画面で、固定9項目・期限・取消しと応答不明の回収を確認する。

import { test, expect } from '@playwright/test';

const route = '/#/events/00000000-0000-4000-8000-000000000001/permissions';

/** 編集画面から確認を開き、同じ固定入力の保存へ進む。 */
async function save(page) {
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'この内容で保存', exact: true }).click();
}

/** 確定案内を閉じ、自動で再取得された設定へ戻る。 */
async function closeResult(page) {
  await page.getByRole('dialog', { name: '結果を確認しました', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
}

test('TEMP313-B01 固定9項目を確認・取消し後に変更し、最新設定へ自動で戻る', async ({ page }) => {
  await page.goto(route);
  await expect(page.locator('.permission-row')).toHaveCount(9);
  await page.getByRole('button', { name: '権限を設定', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.permission-option input')).toHaveCount(9);
  await expect(page.getByRole('checkbox')).toHaveCount(10);
  await page.getByRole('checkbox', { name: '手動受付', exact: true }).uncheck();
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('手動受付：○ → ×');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.locator('.permission-card')).toContainText('許可する項目：9／9');
  await page.getByRole('button', { name: '権限を設定', exact: true }).click();
  await page.getByRole('checkbox', { name: '手動受付', exact: true }).uncheck();
  await save(page); await closeResult(page);
  await expect(page.locator('.permission-card')).toContainText('許可する項目：8／9');
  await expect(page.locator('.permission-card')).toContainText('手動受付：×');
  await expect(page.locator('.permission-card .permission-mark-on')).toHaveCount(8);
  await expect(page.locator('.permission-card .permission-mark-off')).toHaveCount(1);
  await expect(page.locator('.permission-card').getByRole('img', { name: 'OFF', exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('TEMP313-B02 一括選択は三状態を反映し、全解除・全選択も確認後に保存する', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('button', { name: '権限を設定', exact: true }).click();
  const all = page.getByRole('checkbox', { name: 'すべて選択／解除', exact: true });
  await expect(all).toBeChecked();
  await page.getByRole('checkbox', { name: '手動受付', exact: true }).uncheck();
  await expect(all).toHaveJSProperty('indeterminate', true);
  await all.check(); await all.uncheck();
  await expect(page.getByRole('dialog').locator('input[type="checkbox"]:checked')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.locator('.permission-card')).toContainText('許可する項目：9／9');
  await page.getByRole('button', { name: '権限を設定', exact: true }).click();
  await all.uncheck();
  await expect(page.getByRole('dialog').getByRole('button')).toHaveText(['変更内容を確認', 'キャンセル']);
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('全項目×の新しい版');
  await page.getByRole('button', { name: 'この内容で保存', exact: true }).click(); await closeResult(page);
  await expect(page.locator('.permission-card')).toContainText('許可する項目：0／9');
  await expect(page.locator('.permission-card')).toContainText('一般受付の共通操作');
  await page.getByRole('button', { name: '権限を設定', exact: true }).click();
  await expect(page.getByRole('dialog').locator('input[type="checkbox"]:checked')).toHaveCount(0);
  await all.check();
  await save(page); await closeResult(page);
  await expect(page.locator('.permission-card')).toContainText('許可する項目：9／9');
});

test('TEMP313-B03 不正な期間を拒否し、編集をキャンセルしたら元の設定を保持する', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('button', { name: '権限を設定', exact: true }).click();
  await page.getByLabel('有効終了', { exact: true }).fill('2000-01-01T00:00');
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('有効期間');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.locator('.permission-card')).toContainText('許可する項目：9／9');
});

/** 通信せず、同じIDの応答喪失と再起動を再現できる窓口を作る。 */
async function fixture(page, loss, time) {
  await page.goto('http://127.0.0.1:4181/tests/emulator/device-management-fixture.html');
  await page.waitForFunction(() => window.deviceFixtureReady === true);
  if (time) { await page.clock.install({ time: new Date(time) }); await page.clock.setFixedTime(new Date(time)); }
  await page.evaluate(async loss => {
    const { createTemporaryPermissionsPreview } = await import('/src/app/temporary-permissions-preview.ts');
    const { createTemporaryPermissionsScreen } = await import('/src/app/temporary-permissions-screen.ts');
    const backend = createTemporaryPermissionsPreview({ environmentId: crypto.randomUUID(), performanceId: crypto.randomUUID() });
    const trial = { backend, calls: 0, saved: null, screen: null, port: null };
    let lose = true;
    trial.port = { ...backend, dispose() {},
      async prepare(change) { await backend.prepare(change); trial.saved = structuredClone(change); },
      async commit(id) { trial.calls++; if (lose) { lose = false; if (loss === 'after') await backend.commit(id); throw Error('FICTIONAL_RESPONSE_LOSS'); } return backend.commit(id); },
    };
    trial.screen = createTemporaryPermissionsScreen(trial.port, true);
    document.body.replaceChildren(trial.screen.element); window.permissionTrial = trial;
  }, loss);
}

/** 同じ保存済み入力と窓口で画面を開き直す。 */
async function remount(page) {
  await page.evaluate(async () => {
    const { createTemporaryPermissionsScreen } = await import('/src/app/temporary-permissions-screen.ts');
    const trial = window.permissionTrial; trial.screen.dispose(); trial.screen = createTemporaryPermissionsScreen(trial.port, true);
    document.body.replaceChildren(trial.screen.element);
  });
}

test('TEMP313-B04 確定応答の喪失は結果照会だけで回収し、再送しない', async ({ page }) => {
  await fixture(page, 'after');
  await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  await page.getByRole('button', { name: '結果を確認', exact: true }).click(); await closeResult(page);
  expect(await page.evaluate(() => window.permissionTrial.calls)).toBe(1);
});

test('TEMP313-B05 再起動した未確定入力を同じIDで再試行し、一回だけ確定する', async ({ page }) => {
  await fixture(page, 'before');
  await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認'); await remount(page);
  await expect(page.getByRole('button', { name: '結果を確認', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '同じ操作を再試行', exact: true }).click(); await closeResult(page);
  expect(await page.evaluate(async () => (await window.permissionTrial.backend.load()).targets[0].role.revision)).toBe(2);
  expect(await page.evaluate(() => window.permissionTrial.calls)).toBe(2);
});

test('TEMP313-B06 未確定案を取り消しても現在設定を変えず、欠損設定を全ONに補充しない', async ({ page }) => {
  await fixture(page, 'before');
  await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  await page.getByRole('button', { name: '未確定案を取り消す', exact: true }).click(); await closeResult(page);
  expect(await page.evaluate(async () => (await window.permissionTrial.backend.load()).targets[0].role.revision)).toBe(1);
  await page.evaluate(() => {
    const trial = window.permissionTrial;
    trial.port.load = async () => { const data = await trial.backend.load(); data.targets[0].profile = null; return data; };
  });
  await page.getByRole('button', { name: '最新の設定を確認', exact: true }).click();
  await expect(page.locator('.permission-card')).toContainText('既定値は自動適用しません');
  await expect(page.getByRole('button', { name: '権限を設定', exact: true })).toHaveCount(0);
});

test('TEMP313-B07 役割版が変わった入力は保持して再送しない', async ({ page }) => {
  await fixture(page, 'before');
  await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  await page.evaluate(async () => {
    const trial = window.permissionTrial, change = structuredClone(trial.saved); change.input.operationId = crypto.randomUUID();
    await trial.backend.prepare(change); await trial.backend.commit(change.input.operationId);
  });
  await page.getByRole('button', { name: '最新の設定を確認', exact: true }).click();
  await expect(page.getByText(/版が変わった未確定入力1件/)).toBeVisible();
  await expect(page.getByRole('button', { name: '同じ操作を再試行', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.permissionTrial.calls)).toBe(1);
});

test('TEMP313-B08 認証期限で設定と編集中のダイアログを閉じる', async ({ page }) => {
  await fixture(page, 'before'); await page.clock.install();
  await page.evaluate(async () => {
    const { createTemporaryPermissionsScreen } = await import('/src/app/temporary-permissions-screen.ts');
    const { createTemporaryPermissionsUiPort } = await import('/src/adapters/firebase/temporary-permissions-ui-port.ts');
    const trial = window.permissionTrial, data = await trial.backend.load(), actor = data.snapshot;
    actor.session.expiresAt = data.serverNow + 1000;
    const binding = { environmentId: actor.environmentId, performanceId: actor.performanceId, humanUid: actor.role.humanUid,
      deviceUid: actor.deviceAuthUid, storageEpoch: actor.device.storageEpoch };
    const authorization = { roles: { listTemporaryPermissions: async () => data }, identity: () => ({ human: { uid: binding.humanUid }, deviceUid: binding.deviceUid }), onInvalidate: () => () => {} };
    trial.screen.dispose(); trial.screen = createTemporaryPermissionsScreen(createTemporaryPermissionsUiPort(authorization, binding));
    document.body.replaceChildren(trial.screen.element);
  });
  await page.getByRole('button', { name: '権限を設定', exact: true }).click();
  await page.clock.fastForward(1100);
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.permission-card')).toHaveCount(0);
});

test('TEMP313-B09 確定後の取得だけが失敗した場合は結果を保持し、再取得で二重送信しない', async ({ page }) => {
  await fixture(page, 'before');
  await page.evaluate(() => {
    const trial = window.permissionTrial; let loads = 0;
    trial.port.load = async () => { if (++loads === 2) throw Error('FICTIONAL_REFRESH_FAILURE'); return trial.backend.load(); };
    trial.port.commit = async id => { trial.calls++; return trial.backend.commit(id); };
  });
  await remount(page);
  await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
  await expect(page.getByRole('dialog')).toContainText('結果は確定しましたが、最新設定を取得できません');
  await closeResult(page); await expect(page.locator('.permission-card')).toHaveCount(0);
  await page.getByRole('button', { name: '最新の設定を確認', exact: true }).click();
  await expect(page.locator('.permission-card')).toBeVisible();
  expect(await page.evaluate(() => window.permissionTrial.calls)).toBe(1);
});

test('TEMP313-B10 日時入力が00秒を省略しても、未変更の期間のミリ秒を維持する', async ({ page }) => {
  await fixture(page, 'before', '2026-11-26T00:00:01.750Z');
  await page.getByRole('button', { name: '権限を設定', exact: true }).click(); await save(page);
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  const saved = await page.evaluate(() => window.permissionTrial.saved.input);
  expect(saved.validFrom).toBe(Date.parse('2026-11-26T00:00:00.750Z'));
  expect(saved.validUntil).toBe(Date.parse('2026-11-26T02:00:01.750Z'));
});
