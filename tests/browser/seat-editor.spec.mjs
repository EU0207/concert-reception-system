// 製品画面から暗号化下書きの保存と復元、離脱時の競合を確認する。

import { expect, test } from '@playwright/test';

const eventRoute = '/#/events/00000000-0000-4000-8000-000000000001';

/** 公演準備から席編集を開き、端末の下書き確認が終わるまで待つ。 */
async function openEditor(page) {
  await page.goto(eventRoute);
  await page.getByRole('link', { name: '会場席の編集' }).click();
  await expect(page.getByRole('button', { name: '区画を追加' })).toBeEnabled();
}

/** 区画名を入力して、席編集に反映する。 */
async function addSection(page, name) {
  await page.getByRole('button', { name: '区画を追加' }).click();
  await page.getByLabel('区画名').fill(name);
  await page.getByRole('button', { name: '追加する', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test('DD91-T37 端末保存から復元し、共有と確定は明示した試験操作だけを行う', async ({ page }) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url());
  });

  await openEditor(page);
  await addSection(page, '確認区画');
  await page.getByRole('button', { name: '確認区画の席 A-1 を編集' }).click();
  await page.getByRole('textbox', { name: '席番号', exact: true }).fill('補助席');
  await page.getByRole('button', { name: '変更を反映' }).click();
  await page.getByRole('button', { name: '下書き保存', exact: true }).click();
  const saved = page.getByText(/この端末に保存済み・未確定（/);
  await expect(saved).toBeVisible();
  const savedMessage = await saved.textContent();

  await page.reload();
  await expect(page.getByRole('button', { name: '確認区画の席 補助席 を編集' })).toBeVisible();
  await expect(saved).toHaveText(savedMessage);
  await expect(page.getByRole('checkbox')).toHaveCount(0);

  await page.getByRole('button', { name: '下書きを共有', exact: true }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByText(/試験操作が完了しました/)).toHaveCount(0);

  for (const label of ['下書きを共有', '確定保存']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('dialog', { name: `${label}の確認` })).toBeVisible();
    await page.getByRole('button', { name: '試験操作を実行' }).click();
    await expect(page.getByText(`「${label}」の試験操作が完了しました。端末下書きは未確定のままです。`)).toBeVisible();
  }

  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('DD91-T19・T41 離脱保存と破棄を区別し、別公演には下書きを表示しない', async ({ page }) => {
  await openEditor(page);
  await addSection(page, '保存する区画');
  await page.getByRole('link', { name: '← 公演の準備へ' }).click();
  await page.getByRole('button', { name: '編集を続ける' }).click();
  await expect(page.getByRole('heading', { name: '保存する区画' })).toBeVisible();
  await page.getByRole('link', { name: '← 公演の準備へ' }).click();
  await page.getByRole('button', { name: '保存して移動' }).click();
  await page.getByRole('link', { name: '会場席の編集' }).click();
  await expect(page.getByRole('heading', { name: '保存する区画' })).toBeVisible();

  await addSection(page, '破棄する区画');
  await page.getByRole('link', { name: '← 公演の準備へ' }).click();
  await page.getByRole('button', { name: '保存せず移動' }).click();
  await page.getByRole('link', { name: '← 公演一覧へ' }).click();
  await page.getByRole('link', { name: /冬のピアノリサイタル/ }).click();
  await page.getByRole('link', { name: '会場席の編集' }).click();
  await expect(page.getByText('区画を追加すると座席が表示されます。')).toBeVisible();

  await openEditor(page);
  await expect(page.getByRole('heading', { name: '保存する区画' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '破棄する区画' })).toHaveCount(0);
});

test('DD91-T19・T39 古いタブの離脱保存を拒否し、入力と最新の端末下書きを保持する', async ({ page, context }) => {
  await openEditor(page);
  const other = await context.newPage();
  await openEditor(other);
  await addSection(other, '先に保存する区画');
  await other.getByRole('button', { name: '下書き保存', exact: true }).click();
  await expect(other.getByText(/この端末に保存済み・未確定（/)).toBeVisible();

  await addSection(page, '古いタブで入力した区画');
  await page.getByRole('button', { name: '下書きを共有', exact: true }).click();
  await page.getByRole('button', { name: '試験操作を実行' }).click();
  await expect(page.getByRole('alert')).toHaveText(/別のタブで下書きが更新されました/);
  await expect(page.getByText(/試験操作が完了しました/)).toHaveCount(0);

  await page.getByRole('link', { name: '← 公演の準備へ' }).click();
  await page.getByRole('button', { name: '保存して移動' }).click();
  await expect(page.getByRole('alert')).toHaveText(/別のタブで下書きが更新されました/);
  await expect(page).toHaveURL(`${eventRoute}/seats`);
  await expect(page.getByRole('heading', { name: '古いタブで入力した区画' })).toBeVisible();

  await other.reload();
  await expect(other.getByRole('heading', { name: '先に保存する区画' })).toBeVisible();
  await expect(other.getByRole('heading', { name: '古いタブで入力した区画' })).toHaveCount(0);
});
