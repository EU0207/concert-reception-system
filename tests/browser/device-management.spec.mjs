// 端末管理の見本を操作し、確認・取消しと応答不明時の明示回収を検査する。

import { test, expect } from '@playwright/test';

const route = '/#/events/00000000-0000-4000-8000-000000000001/devices';

/** 対象のカードから変更確認を開き、確定ボタンを押す。 */
async function change(page, card, kind) {
  await card.getByRole('button', { name: kind, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: `${kind}する`, exact: true }).click();
}

/** 完了案内を閉じ、自動取得された一覧へ戻る。 */
async function closeConfirmation(page) {
  const dialog = page.getByRole('dialog', { name: '変更しました', exact: true });
  await expect(dialog).toContainText('最新の端末一覧を表示します');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
}

test('DEVICE308-B01 承認・停止・解除・廃止を確認し、管理端末の代替保護を維持する', async ({ page }) => {
  await page.goto(route);
  const pending = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /pending/ }) });
  await expect(pending).toContainText('承認待ち');
  await expect(pending.locator('[data-device-status="approval"] .device-status-mark')).toHaveText('△');
  await expect(pending.locator('[data-device-status="preparation"]')).toContainText('—承認後に準備');
  await expect(pending.locator('[data-device-status="state"]')).toContainText('通常');
  await expect(pending.locator('[data-device-status="state"]')).not.toContainText('承認待ち');
  await pending.getByRole('button', { name: '承認', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('事前準備が完了するまで');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(pending).toContainText('承認待ち');
  await change(page, pending, '承認');
  await expect(page.getByRole('status')).toContainText('確定');
  await closeConfirmation(page);
  await expect(pending).toContainText('承認済み');
  await expect(pending.locator('[data-device-status="approval"] .device-status-mark')).toHaveText('○');
  await expect(pending.locator('[data-device-status="approval"] .device-status-description')).toHaveText('承認済み');
  await expect(pending.locator('[data-device-status="preparation"]')).toContainText('未確認');
  await expect(pending.locator('[data-device-status="preparation"] .device-status-mark')).toHaveText('—');
  await change(page, pending, '停止');
  await closeConfirmation(page);
  await expect(pending).toContainText('停止中');
  await expect(pending.locator('[data-device-status="state"] .device-status-mark')).toHaveText('×');
  await change(page, pending, '停止解除');
  await closeConfirmation(page);
  await expect(pending.locator('[data-device-status="state"]')).toContainText('通常');
  await expect(pending.locator('[data-device-status="state"] .device-status-mark')).toHaveText('○');
  await change(page, pending, '廃止');
  await closeConfirmation(page);
  const retired = page.locator('.device-retired');
  await expect(retired).not.toHaveAttribute('open', '');
  await expect(retired.locator('.device-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /pending/ })).toHaveCount(0);
  await retired.getByText('廃止済み端末一覧（1台）', { exact: true }).click();
  await expect(pending).toContainText('廃止済み');
  await expect(pending.getByRole('button')).toHaveCount(0);
  await expect(pending).toContainText('未送信件数は未取得');
  await expect(pending).not.toContainText('同期済み');
  const owner = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /管理者の端末.*この端末/ }) });
  await expect(owner.getByRole('button', { name: '停止', exact: true })).toHaveCount(0);
  await expect(owner).toContainText('使用中のこの端末は停止できません');
  await change(page, owner, '廃止');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('同じ管理者の別端末');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/** 固定入力と応答喪失を操作できる、通信しない画面用fixtureを作る。 */
async function fixture(page, committed) {
  await page.goto('http://127.0.0.1:4181/tests/emulator/device-management-fixture.html');
  await page.waitForFunction(() => window.deviceFixtureReady === true);
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

test('DEVICE308-B05 管理者端末の停止は2段階確認し、途中取消しとEscapeでは保存・送信しない', async ({ page }) => {
  await fixture(page, false);
  const owner = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /r-second/ }) });
  await owner.getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('状態：有効 → 停止中');
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  expect(await page.evaluate(() => window.deviceTrial.getSaved())).toBe(null);
  await owner.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '最終確認へ', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('この管理者端末では管理操作や受付ができなくなります');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.deviceTrial.getSaved())).toBe(null);
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.deviceTrial.getSaved())).toBe(null);
  await owner.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '最終確認へ', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '管理者の端末を停止する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('結果を確認');
  expect(await page.evaluate(() => window.deviceTrial.getSaved().targetDeviceUid)).toBe('preview-owner-second');
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(1);
});

/** 変更確定後の再取得だけを失敗・遅延させる見本を作る。 */
async function refreshFixture(page, mode) {
  await page.goto('http://127.0.0.1:4181/');
  await page.evaluate(async (mode) => {
    const { createDeviceManagementPreview } = await import('/src/app/device-management-preview.ts');
    const { createDeviceManagementScreen } = await import('/src/app/device-management-screen.ts');
    const backend = createDeviceManagementPreview({ environmentId: crypto.randomUUID(), performanceId: crypto.randomUUID() });
    const trial = { loads: 0, commits: 0, release: null, invalidate: null };
    const port = { ...backend,
      async load() {
        trial.loads++;
        if (trial.loads === 2 && mode === 'fail') throw Error('FICTIONAL_REFRESH_FAILURE');
        const result = await backend.load();
        if (trial.loads === 2 && mode === 'delay') await new Promise(resolve => { trial.release = resolve; });
        return result;
      },
      async commit(id) { trial.commits++; await backend.commit(id); },
      onInvalidate(listener) { trial.invalidate = listener; return backend.onInvalidate(listener); },
    };
    trial.screen = createDeviceManagementScreen(port, true);
    document.body.replaceChildren(trial.screen.element);
    window.refreshTrial = trial;
  }, mode);
}

test('DEVICE308-B06 確定後の再取得失敗を変更失敗と混同せず、再取得だけを試せる', async ({ page }) => {
  await refreshFixture(page, 'fail');
  const card = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /pending/ }) });
  await change(page, card, '承認');
  const dialog = page.getByRole('dialog', { name: '変更しました', exact: true });
  await expect(dialog).toContainText('変更は確定しましたが、最新の端末一覧を取得できませんでした');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.locator('.device-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '結果を確認', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
  await expect(card).toContainText('承認済み');
  expect(await page.evaluate(() => window.refreshTrial.commits)).toBe(1);
});

test('DEVICE308-B07 確定後の再取得中に失効したら、遅い応答で台帳を復活させない', async ({ page }) => {
  await refreshFixture(page, 'delay');
  const card = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /pending/ }) });
  await change(page, card, '承認');
  await page.waitForFunction(() => typeof window.refreshTrial.release === 'function');
  await page.evaluate(() => { window.refreshTrial.invalidate(); window.refreshTrial.release(); });
  await expect(page.locator('.device-card')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.refreshTrial.commits)).toBe(1);
});

test('DEVICE308-B08 代理端末の廃止では管理者端末を自動確認し、選択なしで廃止できる', async ({ page }) => {
  await page.goto(route);
  const deputy = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /代理管理者/ }) });
  await deputy.getByRole('button', { name: '廃止', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('廃止後も利用できる管理端末：管理者の端末');
  await expect(page.getByRole('dialog').locator('select')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(deputy).toBeVisible();
  await change(page, deputy, '廃止');
  await closeConfirmation(page);
  await page.locator('.device-retired summary').click();
  await expect(deputy).toContainText('廃止済み');
});

test('DEVICE308-B09 準備済みの代替管理端末がなければ代理端末も廃止させない', async ({ page }) => {
  await fixture(page, false);
  await page.evaluate(async () => {
    const { createDeviceManagementScreen } = await import('/src/app/device-management-screen.ts');
    const trial = window.deviceTrial;
    trial.screen.dispose();
    trial.port.load = async () => {
      const data = await trial.backend.load();
      for (const device of data.inventory.devices) {
        if (device.humanUid === 'preview-owner') device.preparedRoleRevision = 0;
      }
      // 準備済みなのは廃止対象の代理端末だけ、という実際に保護が必要な状態を作る。
      const device = data.inventory.devices.find(item => item.humanUid === 'preview-deputy');
      const role = data.inventory.roles.find(item => item.humanUid === device.humanUid);
      data.snapshot = { ...data.snapshot, deviceAuthUid: device.deviceUid, device, role,
        session: { ...data.snapshot.session, humanUid: role.humanUid, deviceUid: device.deviceUid } };
      return data;
    };
    trial.screen = createDeviceManagementScreen(trial.port, true);
    document.body.replaceChildren(trial.screen.element);
  });
  const deputy = page.locator('.device-card').filter({ has: page.getByRole('heading', { name: /代理管理者/ }) });
  await deputy.getByRole('button', { name: '廃止', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('準備済みの管理端末が確認できません');
  await page.getByRole('dialog').getByRole('button', { name: '廃止する', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('準備済みの管理端末');
  expect(await page.evaluate(() => window.deviceTrial.getSaved())).toBe(null);
  expect(await page.evaluate(() => window.deviceTrial.getCalls())).toBe(0);
});
