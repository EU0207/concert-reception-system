// 端末管理の見本を操作し、確認・取消しと応答不明時の明示回収を検査する。

import { test, expect } from '@playwright/test';

const route = '/#/events/00000000-0000-4000-8000-000000000001/devices';

/** 対象のカードから変更確認を開き、確定ボタンを押す。 */
async function change(page, card, kind) {
  await card.getByRole('button', { name: kind, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: `${kind}する`, exact: true }).click();
}

test('DEVICE308-B01 承認・停止・解除・廃止を確認し、管理端末の代替保護を維持する', async ({ page }) => {
  await page.goto(route);
  const pending = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /pending/ }) });
  await expect(pending).toContainText('承認待ち');
  await expect(pending.locator('[data-device-status="approval"] .device-status-mark')).toHaveText('△');
  await expect(pending.locator('[data-device-status="preparation"] .device-status-mark')).toHaveText('△');
  await pending.getByRole('button', { name: '承認', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('事前準備が完了するまで');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(pending).toContainText('承認待ち');
  await change(page, pending, '承認');
  await expect(page.getByRole('status')).toContainText('確定');
  await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
  await expect(pending).toContainText('承認済み');
  await expect(pending.locator('[data-device-status="approval"] .device-status-mark')).toHaveText('○');
  await expect(pending.locator('[data-device-status="approval"] .device-status-description')).toHaveCount(0);
  await expect(pending).toContainText('未準備・再準備が必要');
  await change(page, pending, '停止');
  await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
  await expect(pending).toContainText('停止中');
  await expect(pending.locator('[data-device-status="state"] .device-status-mark')).toHaveText('×');
  await change(page, pending, '停止解除');
  await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
  await expect(pending.locator('[data-device-status="state"]')).toContainText('有効');
  await expect(pending.locator('[data-device-status="state"] .device-status-mark')).toHaveText('○');
  await change(page, pending, '廃止');
  await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
  await expect(pending).toContainText('廃止済み');
  await expect(pending.getByRole('button')).toHaveCount(0);
  await expect(pending).toContainText('未送信件数：未取得');
  const owner = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /主担当の端末.*この端末/ }) });
  await expect(owner.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  await expect(owner).toContainText('使用中のこの端末は停止できません');
  await change(page, owner, '廃止');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('同じ主担当の別端末');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/** 固定入力と応答喪失を操作できる、通信しない画面用fixtureを作る。 */
async function fixture(page, committed) {
  await page.goto('http://127.0.0.1:4181/');
  await page.evaluate(async (committed) => {
    const { createDeviceManagementPreview } = await import('/src/app/device-management-preview.ts');
    const { createDeviceManagementScreen } = await import('/src/app/device-management-screen.ts');
    const backend = createDeviceManagementPreview({ environmentId: crypto.randomUUID(), performanceId: crypto.randomUUID() });
    const trial = { calls: 0, saved: null, backend, screen: null };
    const port = { ...backend, dispose() {},
      async prepare(input) { await backend.prepare(input); trial.saved = structuredClone(input); },
      async commit(id) { trial.calls++; if (committed) await backend.commit(id); throw Error('FICTIONAL_LOST_RESPONSE'); },
    };
    trial.screen = createDeviceManagementScreen(port, true);
    document.body.replaceChildren(trial.screen.element);
    window.deviceTrial = { ...trial, port, getCalls: () => trial.calls, getSaved: () => trial.saved };
  }, committed);
}

test('DEVICE308-B02 確定応答を失っても結果照会だけで回収し、再送しない', async ({ page }) => {
  await fixture(page, true);
  const card = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /pending/ }) });
  await change(page, card, '承認');
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(1);
  await expect(page.locator('.device-card').getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: '結果を確認', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('確定');
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(1);
});

test('DEVICE308-B03 未確定入力を復元し、版が変わった入力は保全して再送しない', async ({ page }) => {
  await fixture(page, false);
  const card = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /pending/ }) });
  await change(page, card, '承認');
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  await page.evaluate(async () => {
    const { createDeviceManagementScreen } = await import('/src/app/device-management-screen.ts');
    const trial = window.deviceTrial;
    trial.screen.dispose();
    trial.screen = createDeviceManagementScreen(trial.port, true);
    document.body.replaceChildren(trial.screen.element);
  });
  await expect(page.getByRole('button', { name: '結果を確認', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(1);
  await page.evaluate(async () => {
    const trial = window.deviceTrial, input = { ...trial.getSaved(), operationId: crypto.randomUUID() };
    await trial.backend.prepare(input); await trial.backend.commit(input.operationId);
  });
  await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
  await expect(page.getByText(/版が変わったため再送しません/)).toBeVisible();
  await expect(card).toContainText('承認済み');
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(1);
});

test('DEVICE308-B04 セッション期限で台帳を隠し、古い認可のまま変更させない', async ({ page }) => {
  await page.goto('http://127.0.0.1:4181/tests/emulator/device-management-fixture.html');
  await page.waitForFunction(() => window.deviceFixtureReady === true);
  await page.clock.install();
  await page.evaluate(async () => {
    const { createDeviceManagementPreview } = await import('/src/app/device-management-preview.ts');
    const { createDeviceManagementUiPort } = await import('/src/adapters/firebase/device-management-ui-port.ts');
    const { createDeviceManagementScreen } = await import('/src/app/device-management-screen.ts');
    const source = createDeviceManagementPreview({ environmentId: crypto.randomUUID(), performanceId: crypto.randomUUID() });
    const data = await source.load(), actor = data.snapshot;
    actor.session.expiresAt = data.serverNow + 1000;
    const binding = { environmentId: actor.environmentId, performanceId: actor.performanceId,
      deviceUid: actor.deviceAuthUid, humanUid: actor.role.humanUid, storageEpoch: actor.device.storageEpoch };
    const authorization = { devices: { list: async () => data }, identity: () => ({ human: { uid: binding.humanUid }, deviceUid: binding.deviceUid }),
      onInvalidate: () => () => {} };
    const screen = createDeviceManagementScreen(createDeviceManagementUiPort(authorization, binding));
    document.body.replaceChildren(screen.element);
  });
  await expect(page.locator('.device-card')).toHaveCount(5);
  await page.clock.fastForward(1100);
  await expect(page.locator('.device-card')).toHaveCount(0);
  await expect(page.getByText('端末管理は最新の認可確認が必要です。', { exact: false })).toBeVisible();
});

test('DEVICE308-B05 主担当端末の停止は2段階確認し、途中取消しとEscapeでは保存・送信しない', async ({ page }) => {
  await fixture(page, false);
  const owner = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /r-second/ }) });
  await owner.getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('状態：有効 → 停止中');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  expect(await page.evaluate(() => window.deviceTrial.getSaved())).toBe(null);
  await owner.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '最終確認へ', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('この主担当端末では管理操作や受付ができなくなります');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.deviceTrial.getSaved())).toBe(null);
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.deviceTrial.getSaved())).toBe(null);
  await owner.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '最終確認へ', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '主担当の端末を停止する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  expect(await page.evaluate(() => window.deviceTrial.getSaved().targetDeviceUid)).toBe('preview-owner-second');
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(1);
});
