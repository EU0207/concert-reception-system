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
  await page.getByRole('dialog', { name: '区画を追加', exact: true }).getByLabel('区画名').fill(name);
  await page.getByRole('button', { name: '追加する', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

/** 表示操作が端末下書きを書き換えないことを、実際の保存版で照合する。 */
async function draftRevisions(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('concert-reception-device', 3);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('seatDrafts');
      const records = transaction.objectStore('seatDrafts').getAll();
      transaction.oncomplete = () => {
        database.close();
        resolve(records.result.map(record => ({ recordId: record.recordId, dataRevision: record.dataRevision })));
      };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }));
}

test('DD91-T37 端末保存から復元し、共有と確定は明示した試験操作だけを行う', async ({ page }) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url());
  });

  await openEditor(page);
  await addSection(page, '確認区画');
  await page.getByRole('button', { name: '1行1列 未', exact: true }).click();
  await page.getByRole('button', { name: '席に', exact: true }).click();
  await page.getByRole('button', { name: '席番号を変更', exact: true }).click();
  await page.getByRole('textbox', { name: '席番号', exact: true }).fill('補助席');
  await page.getByRole('button', { name: '変更を反映' }).click();
  const saveDraft = page.getByRole('button', { name: '下書き保存', exact: true });
  const saveDialog = page.getByRole('dialog', { name: '下書き保存の確認' });
  const saved = page.getByText(/この端末に保存済み・未確定（/);

  await saveDraft.click();
  await expect(saveDialog).toContainText('この端末に下書きを保存します。');
  await saveDialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(saved).toHaveCount(0);
  await expect(page.getByText(/未保存の変更があります/)).toBeVisible();

  await saveDraft.click();
  await saveDialog.getByRole('button', { name: '保存する', exact: true }).click();
  await expect(saved).toBeVisible();
  const savedMessage = await saved.textContent();

  await page.reload();
  await expect(page.getByRole('button', { name: '確認区画の席 補助席 を選択' })).toBeVisible();
  await expect(page.getByRole('button', { name: '確認区画の席 補助席 を選択' })).toHaveClass(/is-manual/);
  await expect(saved).toHaveText(savedMessage);
  await expect(page.getByRole('checkbox')).toHaveCount(0);

  await page.getByRole('button', { name: '下書きを共有', exact: true }).click();
  const shareDialog = page.getByRole('dialog', { name: '下書きを共有の確認' });
  await expect(shareDialog).toContainText('別端末でも確認できるように保存します。');
  await shareDialog.getByRole('button', { name: '閉じる', exact: true }).click();
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

test('DD91-T03・T04 手動番号を見分け、自動採番への復帰を確認して保存する', async ({ page }) => {
  await openEditor(page);
  await addSection(page, '採番確認区画');
  await page.getByRole('button', { name: '1行1列 未', exact: true }).click();
  await page.getByRole('button', { name: '席に', exact: true }).click();
  const automatic = page.locator('.seat-tile[aria-pressed="true"]');
  const originalLabel = await automatic.getAttribute('aria-label');
  const originalColor = await automatic.evaluate(node => getComputedStyle(node).backgroundColor);
  await page.getByRole('button', { name: '席番号を変更', exact: true }).click();
  await page.getByRole('textbox', { name: '席番号', exact: true }).fill('補助席');
  await page.getByRole('button', { name: '変更を反映', exact: true }).click();
  const manual = page.getByRole('button', { name: '採番確認区画の席 補助席 を選択', exact: true });
  await expect(manual).toHaveClass(/is-manual/);
  await expect(manual).toContainText('手動');
  expect(await manual.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(originalColor);

  await page.getByRole('button', { name: '自動採番に戻す', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '席の設定変更を確認', exact: true });
  await expect(preview).toContainText('選択した席を自動採番に戻し');
  await preview.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(manual).toHaveClass(/is-manual/);
  await page.getByRole('button', { name: '自動採番に戻す', exact: true }).click();
  await preview.getByRole('button', { name: '反映する', exact: true }).click();
  const restored = page.getByRole('button', { name: originalLabel, exact: true });
  await expect(restored).not.toHaveClass(/is-manual/);
  expect(await restored.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(originalColor);
  await expect(page.getByRole('button', { name: '自動採番に戻す', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '下書き保存', exact: true }).click();
  await page.getByRole('dialog', { name: '下書き保存の確認' }).getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.getByText(/この端末に保存済み・未確定（/)).toBeVisible();
  await page.reload();
  await expect(restored).toBeVisible();
  await expect(page.locator('.seat-tile.is-manual')).toHaveCount(0);
});

test('DD91-T34 手動のA-6を飛ばして後続席を作成し、保存から復元する', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: '区画を追加', exact: true }).click();
  const create = page.getByRole('dialog', { name: '区画を追加', exact: true });
  await create.getByLabel('区画名').fill('採番重複確認');
  await create.getByLabel('縦', { exact: true }).fill('1');
  await create.getByLabel('横', { exact: true }).fill('8');
  await create.getByRole('button', { name: '追加する', exact: true }).click();
  await page.getByLabel('選択方法').selectOption('range');
  await page.getByRole('button', { name: '1行1列 未', exact: true }).click();
  await page.getByRole('button', { name: '1行5列 未', exact: true }).click();
  await page.getByRole('button', { name: '席に', exact: true }).click();
  await page.getByLabel('選択方法').selectOption('single');
  await page.getByRole('button', { name: '採番重複確認の席 A-4 を選択', exact: true }).click();
  await page.getByRole('button', { name: '席番号を変更', exact: true }).click();
  await page.getByRole('textbox', { name: '席番号', exact: true }).fill('A-6');
  await page.getByRole('button', { name: '変更を反映', exact: true }).click();
  const manual = page.getByRole('button', { name: '採番重複確認の席 A-6 を選択', exact: true });
  await expect(manual).toHaveClass(/is-manual/);
  for (const [column, number] of [[6, 7], [7, 8], [8, 9]]) {
    await page.getByRole('button', { name: `1行${column}列 未`, exact: true }).click();
    await page.getByRole('button', { name: '席に', exact: true }).click();
    await expect(page.getByRole('button', { name: `採番重複確認の席 A-${number} を選択`, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '採番重複確認の席 A-5 を選択', exact: true })).toBeVisible();
  }
  await expect(manual).toHaveClass(/is-manual/);
  await page.getByRole('button', { name: '下書き保存', exact: true }).click();
  await page.getByRole('dialog', { name: '下書き保存の確認' }).getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.getByText(/この端末に保存済み・未確定（/)).toBeVisible();
  await page.reload();
  await expect(manual).toHaveClass(/is-manual/);
  await expect(page.getByRole('button', { name: '採番重複確認の席 A-9 を選択', exact: true })).toBeVisible();
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
  await other.getByRole('dialog', { name: '下書き保存の確認' }).getByRole('button', { name: '保存する', exact: true }).click();
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

test('DD91-T31 区画ごとのセル設定を保存し、切替の取消しと破棄を区別する', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: '区画を追加', exact: true }).click();
  await page.getByLabel('区画名').fill('前方席');
  await page.getByLabel('縦', { exact: true }).fill('2');
  await page.getByLabel('横', { exact: true }).fill('3');
  await page.getByLabel('席番の順序').selectOption('reverse');
  await page.getByText('列名・開始番号', { exact: true }).click();
  await page.getByLabel('1列の名前').fill('前');
  await page.getByLabel('1列の開始番号').fill('7');
  await page.getByRole('button', { name: '追加する', exact: true }).click();
  await expect(page.getByRole('button', { name: /行\d列 未$/ })).toHaveCount(6);

  await page.getByRole('button', { name: '1行3列 未', exact: true }).click();
  await page.getByRole('button', { name: '欠番に', exact: true }).click();
  await page.getByRole('button', { name: '1行2列 未', exact: true }).click();
  await page.getByRole('button', { name: '席に', exact: true }).click();
  await expect(page.getByRole('button', { name: '前方席の席 前-8 を選択' })).toBeVisible();

  await page.getByRole('button', { name: '区画を追加', exact: true }).click();
  const newSection = page.getByRole('dialog', { name: '区画を追加', exact: true });
  await newSection.getByLabel('区画名').fill('後方席');
  await newSection.getByLabel('縦', { exact: true }).fill('1');
  await newSection.getByLabel('横', { exact: true }).fill('31');
  await page.getByRole('button', { name: '追加する', exact: true }).click();
  await expect(page.getByRole('button', { name: '1行31列 未', exact: true })).toHaveCount(1);

  const picker = page.getByLabel('表示する区画');
  await picker.selectOption({ label: '前方席' });
  await page.getByRole('button', { name: '編集を続ける' }).click();
  await expect(page.getByRole('heading', { name: '後方席', exact: true })).toBeVisible();
  await picker.selectOption({ label: '前方席' });
  await page.getByRole('button', { name: '保存して移動' }).click();
  await expect(page.getByRole('button', { name: '前方席の席 前-8 を選択' })).toBeVisible();

  await page.getByRole('button', { name: '1行1列 未', exact: true }).click();
  await page.getByRole('button', { name: '通路に', exact: true }).click();
  await picker.selectOption({ label: '後方席' });
  await page.getByRole('button', { name: '保存せず移動' }).click();
  await expect(page.getByRole('heading', { name: '後方席', exact: true })).toBeVisible();
  await picker.selectOption({ label: '前方席' });
  await expect(page.getByRole('button', { name: '1行1列 未', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '前方席の席 前-8 を選択' })).toBeVisible();

  await page.getByLabel('選択方法').selectOption('range');
  await page.getByRole('button', { name: '2行1列 未', exact: true }).click();
  await page.getByRole('button', { name: '2行3列 未', exact: true }).click();
  await expect(page.getByText('3セル', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '空間に', exact: true }).click();
  await expect(page.getByRole('button', { name: /2行\d列 空間$/ })).toHaveCount(3);

  await page.getByRole('button', { name: '舞台を上に', exact: true }).click();
  await expect(page.locator('.seat-map')).toHaveClass('seat-map stage-top');
});

test('DD91-T03・T06 作成済み区画の設定を確認して反映し、取消しと保存を区別する', async ({ page }) => {
  await openEditor(page);
  await addSection(page, '設定確認区画');
  await page.getByRole('button', { name: '1行1列 未', exact: true }).click();
  await page.getByRole('button', { name: '席に', exact: true }).click();
  const settings = page.locator('.seat-settings');
  await settings.getByLabel('縦', { exact: true }).fill('4');
  await settings.getByLabel('横', { exact: true }).fill('9');
  await settings.getByLabel('席番の順序').selectOption('reverse');
  await settings.getByText('列名・開始番号', { exact: true }).click();
  await expect(settings.getByLabel(/接頭部/)).toHaveCount(0);
  await settings.getByLabel('1列の名前').fill('前方');
  await settings.getByLabel('1列の開始番号').fill('7');
  await page.getByRole('button', { name: '下書き保存', exact: true }).click();
  await page.getByRole('dialog', { name: '下書き保存の確認' }).getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/先に「設定を反映」/);
  await settings.getByRole('button', { name: '設定を反映', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '席の設定変更を確認' });
  await expect(preview).toContainText('5行 × 8列 → 4行 × 9列');
  await expect(preview).toContainText('席番号の変更・削除 1件。');
  await preview.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(settings.getByLabel('横', { exact: true })).toHaveValue('9');
  await settings.getByRole('button', { name: '設定を反映', exact: true }).click();
  await preview.getByRole('button', { name: '反映する', exact: true }).click();
  await expect(page.getByRole('button', { name: '設定確認区画の席 前方-7 を選択' })).toBeVisible();
  await page.getByRole('button', { name: '下書き保存', exact: true }).click();
  await page.getByRole('dialog', { name: '下書き保存の確認' }).getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.getByText(/この端末に保存済み・未確定（/)).toBeVisible();
  await page.reload();
  await expect(settings.getByLabel('横', { exact: true })).toHaveValue('9');
  await expect(page.getByRole('button', { name: '設定確認区画の席 前方-7 を選択' })).toBeVisible();
  await page.getByRole('button', { name: '行・列を追加', exact: true }).click();
  const extension = page.getByRole('dialog', { name: '行・列を追加', exact: true });
  await extension.getByLabel('追加方向').selectOption('columns');
  await expect(extension.getByLabel('追加方向')).toContainText('左に列を追加');
  await extension.getByRole('button', { name: '追加内容を確認' }).click();
  await expect(preview).toContainText('4行 × 9列 → 4行 × 10列');
  await preview.getByRole('button', { name: '反映する', exact: true }).click();
  await expect(page.getByRole('button', { name: '設定確認区画の席 前方-7 を選択' })).toBeVisible();
  await expect(page.getByRole('button', { name: '1行1列 未', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '行・列を追加', exact: true }).click();
  const lineName = extension.getByLabel('追加行・列の名前', { exact: true });
  await expect(lineName).toHaveValue('');
  await extension.getByRole('button', { name: '追加内容を確認' }).click();
  await expect(extension.getByRole('alert')).toHaveText('追加行・列の名前を入力してください。');
  await lineName.fill('　 ');
  await extension.getByRole('button', { name: '追加内容を確認' }).click();
  await expect(extension).toBeVisible();
  await expect(preview).toHaveCount(0);
  await lineName.fill('追加C');
  await extension.getByLabel('追加数', { exact: true }).fill('2');
  await expect(extension.getByRole('group', { name: '追加する1列目' }).getByLabel('追加行・列の名前')).toHaveValue('追加C');
  await expect(extension.getByRole('group', { name: '追加する2列目' }).getByLabel('追加行・列の名前')).toHaveValue('');
  await extension.getByRole('button', { name: '追加内容を確認' }).click();
  await expect(extension).toBeVisible();
  await extension.getByRole('group', { name: '追加する2列目' }).getByLabel('追加行・列の名前').fill('追加D');
  await extension.getByRole('button', { name: '追加内容を確認' }).click();
  await expect(preview).toContainText('4行 × 10列 → 6行 × 10列');
  await preview.getByRole('button', { name: '反映する', exact: true }).click();
  await expect(page.getByRole('button', { name: '設定確認区画の席 前方-7 を選択' })).toBeVisible();
});

test('DD89-T08・T09 倍率と移動は席編集を起こさず、区画別の表示位置を保持する', async ({ page }, testInfo) => {
  await openEditor(page);
  await page.getByRole('button', { name: '区画を追加', exact: true }).click();
  const create = page.getByRole('dialog', { name: '区画を追加', exact: true });
  await create.getByLabel('区画名').fill('表示確認区画');
  await create.getByLabel('縦', { exact: true }).fill('20');
  await create.getByLabel('横', { exact: true }).fill('20');
  await create.getByRole('button', { name: '追加する', exact: true }).click();
  await page.getByRole('button', { name: '下書き保存', exact: true }).click();
  await page.getByRole('dialog', { name: '下書き保存の確認' }).getByRole('button', { name: '保存する', exact: true }).click();
  const saved = page.getByText(/この端末に保存済み・未確定（/);
  await expect(saved).toBeVisible();
  const message = await saved.textContent();
  const revisions = await draftRevisions(page);
  const canvas = page.getByRole('region', { name: '座席表の表示範囲' });
  await page.getByRole('button', { name: '選択席へ戻る', exact: true }).click();
  await expect(page.getByText('先にセルを1つ選択してください。')).toBeVisible();
  await page.getByRole('button', { name: '座席表を拡大', exact: true }).click();
  await expect(page.getByText('表示倍率 110%', { exact: true })).toBeVisible();
  const tile = page.locator('.seat-tile').first();
  expect((await tile.boundingBox()).width).toBeCloseTo(74 * 1.1, 0);
  await page.getByRole('button', { name: '座席表を右へ移動', exact: true }).click();
  await page.getByRole('button', { name: '座席表を下へ移動', exact: true }).click();
  await expect.poll(() => canvas.evaluate(node => node.scrollLeft > 0 && node.scrollTop > 0)).toBe(true);
  await expect(saved).toHaveText(message);
  await expect(page.getByText(/未保存の変更があります/)).toHaveCount(0);

  await page.getByRole('button', { name: '10行10列 未', exact: true }).click();
  await expect(page.getByText('1セル', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '標準倍率で左上へ', exact: true }).click();
  await expect(page.getByText('表示倍率 100%', { exact: true })).toBeVisible();
  await expect.poll(() => canvas.evaluate(node => [node.scrollLeft, node.scrollTop])).toEqual([0, 0]);
  await page.getByRole('button', { name: '選択席へ戻る', exact: true }).click();
  const centered = await canvas.evaluate(node => {
    const cell = node.querySelector('[aria-pressed="true"]');
    const area = node.getBoundingClientRect(), target = cell.getBoundingClientRect();
    return Math.abs(target.left + target.width / 2 - area.left - node.clientLeft - node.clientWidth / 2) < 2 &&
      Math.abs(target.top + target.height / 2 - area.top - node.clientTop - node.clientHeight / 2) < 2;
  });
  expect(centered).toBe(true);
  await expect(saved).toHaveText(message);

  const beforeDrag = await canvas.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }));
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 70, y - 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => canvas.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }))).toEqual({ left: beforeDrag.left + 70, top: beforeDrag.top + 60 });
  await expect(page.getByText('1セル', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '10行10列 未', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(saved).toHaveText(message);
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  const beforeSwitch = await canvas.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }));
  expect(beforeSwitch.left).toBeGreaterThan(beforeDrag.left + 70);
  await expect(draftRevisions(page)).resolves.toEqual(revisions);

  if (testInfo.project.name === 'phone-layout') {
    await canvas.scrollIntoViewIfNeeded();
    const area = await canvas.boundingBox();
    const session = await page.context().newCDPSession(page);
    const startX = area.x + area.width / 2, startY = area.y + area.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX - step * 7, y: startY - step * 7 }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => canvas.evaluate(node => node.scrollTop)).toBeGreaterThan(beforeSwitch.top);
    await session.detach();
    await expect(page.getByRole('button', { name: '10行10列 未', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(draftRevisions(page)).resolves.toEqual(revisions);
  }

  // タッチの慣性移動が終わった位置を、区画切替の比較対象にする。
  let previousPosition = '', unchanged = 0;
  await expect.poll(async () => {
    const position = await canvas.evaluate(node => JSON.stringify([node.scrollLeft, node.scrollTop]));
    unchanged = position === previousPosition ? unchanged + 1 : 0;
    previousPosition = position;

    return unchanged;
  }, { intervals: [100] }).toBeGreaterThanOrEqual(3);
  const lastPosition = await canvas.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }));

  await addSection(page, '別区画');
  await expect(page.getByText('表示倍率 100%', { exact: true })).toBeVisible();
  await page.getByLabel('表示する区画').selectOption({ label: '表示確認区画' });
  await page.getByRole('button', { name: '保存して移動' }).click();
  await expect.poll(() => canvas.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }))).toEqual(lastPosition);
  await page.getByRole('button', { name: '選択席へ戻る', exact: true }).click();
  await expect(page.getByText('先にセルを1つ選択してください。')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
