// 実PNG/JPEG、暗号化キャッシュと席編集の画像表示を、PC幅・スマートフォン幅で確認する。

import { test, expect } from '@playwright/test';

const scope = { environmentId: '00000000-0000-4000-8000-000000000001', performanceId: '00000000-0000-4000-8000-000000000002',
  humanUid: 'fictional-image-human', deviceUid: 'fictional-image-device', storageEpoch: '00000000-0000-4000-8000-000000000003' };

/** 架空の舞台・座席を描いた実画像を作り、個人情報のないテストファイルを返す。 */
async function imageFile(page, color = '#326560', mime = 'image/png') {
  const base64 = await page.evaluate(async ({ color, mime }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 240;
    const draw = canvas.getContext('2d');
    draw.fillStyle = '#f2eddf'; draw.fillRect(0, 0, 480, 240);
    draw.fillStyle = color; draw.fillRect(10, 20, 80, 200);
    draw.font = '20px sans-serif'; draw.fillStyle = '#fff'; draw.fillText('STAGE', 16, 120);
    draw.fillStyle = '#394b46'; draw.fillText('A-1  A-2  A-3', 130, 90); draw.fillText('B-1  B-2  B-3', 130, 160);

    return canvas.toDataURL(mime).split(',')[1];
  }, { color, mime });

  return { name: mime === 'image/png' ? 'fictional-venue.png' : 'fictional-venue.jpg', mimeType: mime, buffer: Buffer.from(base64, 'base64') };
}

/** 画像モジュールと、実際の端末鍵・IndexedDBを使う窓口を用意する。 */
async function setup(page) {
  await page.goto('http://127.0.0.1:4181/');
  await page.evaluate(async (scope) => {
    const module = await import('/src/domain/seats/venue-image.ts');
    const { createVenueImageStore } = await import('/src/storage/venue-images.ts');
    const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
    await ensureDeviceKey(scope, true);
    window.imageModule = module;
    window.imageStore = createVenueImageStore(scope, () => { if (window.imageAccessRevoked) throw Error('ACCESS_REVOKED'); });
  }, scope);
}

test('IMG91-T01・06 実PNG/JPEGと1MBを検証し、不正形式・別公演・ハッシュ不一致を拒否する', async ({ page }) => {
  await setup(page);
  const png = await imageFile(page), jpeg = await imageFile(page, '#5d3b71', 'image/jpeg');
  const result = await page.evaluate(async ({ scope, png, jpeg }) => {
    const { prepareVenueImage, verifyVenueImage } = window.imageModule;
    const scopeOnly = { environmentId: scope.environmentId, performanceId: scope.performanceId };
    const bytes = Uint8Array.from(png), full = new Uint8Array(1_000_000);
    full.set(bytes);
    const payload = await prepareVenueImage(scopeOnly, full, 'image/png', 0, crypto.randomUUID());
    const head = { ...scopeOnly, schemaVersion: 1, revision: 1, active: true, bank: 'a', operationId: payload.operationId, sha256: payload.sha256 };
    const jpegPayload = await prepareVenueImage(scopeOnly, Uint8Array.from(jpeg), 'image/jpeg', 0, crypto.randomUUID());
    const bad = await Promise.allSettled([
      prepareVenueImage(scopeOnly, new Uint8Array(1_000_001), 'image/png', 0, crypto.randomUUID()),
      prepareVenueImage(scopeOnly, bytes, 'image/jpeg', 0, crypto.randomUUID()),
      prepareVenueImage(scopeOnly, new TextEncoder().encode('%PDF-1.7'), 'application/pdf', 0, crypto.randomUUID()),
      verifyVenueImage({ ...payload, sha256: '0'.repeat(64) }, head, scopeOnly),
      verifyVenueImage({ ...payload, sha256: '0'.repeat(64) }, { ...head, sha256: '0'.repeat(64) }, scopeOnly),
      verifyVenueImage({ ...payload, performanceId: scope.environmentId }, head, scopeOnly),
      verifyVenueImage({ ...payload, base64: 'AA==' }, head, scopeOnly),
    ]);

    return { png: (await verifyVenueImage(payload, head, scopeOnly)).size, jpeg: jpegPayload.mime, bad: bad.map((value) => value.status) };
  }, { scope, png: [...png.buffer], jpeg: [...jpeg.buffer] });
  expect(result).toEqual({ png: 1_000_000, jpeg: 'image/jpeg', bad: Array(7).fill('rejected') });
});

test('IMG91-T02・03・06 画像と未解決送信を暗号化保存し、失敗・別本人・失効では旧版を保全する', async ({ page }) => {
  await setup(page);
  const file = await imageFile(page);
  const saved = await page.evaluate(async ({ scope, bytes }) => {
    const { prepareVenueImage } = window.imageModule;
    const payload = await prepareVenueImage(scope, Uint8Array.from(bytes), 'image/png', 0, crypto.randomUUID());
    const head = { environmentId: scope.environmentId, performanceId: scope.performanceId, schemaVersion: 1,
      revision: 1, active: true, bank: 'a', operationId: payload.operationId, sha256: payload.sha256 };
    await window.imageStore.saveImage('0', head, payload, 0);
    await window.imageStore.prepare('0', 'a', payload);
    const mismatch = await Promise.allSettled([window.imageStore.prepare('0', 'b', { ...payload, operationId: crypto.randomUUID() })]);
    const replacement = await prepareVenueImage(scope, Uint8Array.from(bytes), 'image/png', 1, crypto.randomUUID());
    const put = IDBObjectStore.prototype.put;
    // 画像ストアへの書込みだけに容量不足を注入し、鍵の処理は維持する。
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'venueImages') throw new DOMException('fictional quota', 'QuotaExceededError');

      return put.apply(this, args);
    };
    let quota;
    try { quota = await Promise.allSettled([window.imageStore.saveImage('0', { ...head, revision: 2, operationId: replacement.operationId }, replacement, 1)]); }
    finally { IDBObjectStore.prototype.put = put; }

    return { operationId: payload.operationId, sha256: payload.sha256, mismatch: mismatch[0].status, quota: quota[0].status, quotaName: quota[0].reason?.name };
  }, { scope, bytes: [...file.buffer] });
  await page.reload();
  const restored = await page.evaluate(async ({ scope, saved }) => {
    const { createVenueImageStore } = await import('/src/storage/venue-images.ts');
    const { openDeviceDatabase } = await import('/src/storage/device-database.ts');
    const store = createVenueImageStore(scope, () => {});
    const image = await store.readImage('0'), pending = await store.readUpload('0');
    const result = { environmentId: scope.environmentId, performanceId: scope.performanceId, schemaVersion: 1, kind: 'publish', slot: '0',
      revision: 1, bank: 'a', sha256: saved.sha256, committedAt: Date.now(), controlRevision: 2,
      humanUid: scope.humanUid, deviceUid: scope.deviceUid };
    await store.confirm('0', saved.operationId, result);
    const confirmed = await store.readUpload('0');
    const other = await Promise.allSettled([createVenueImageStore({ ...scope, humanUid: 'other-human' }, () => {}).readImage('0')]);
    const revoked = await Promise.allSettled([createVenueImageStore(scope, () => { throw Error('ACCESS_REVOKED'); }).readImage('0')]);
    const database = await openDeviceDatabase();
    const records = await new Promise((resolve) => {
      const transaction = database.transaction('venueImages', 'readonly');
      const request = transaction.objectStore('venueImages').getAll();
      transaction.oncomplete = () => resolve(request.result);
    });
    database.close();

    return { revision: image.head.revision, pendingId: pending.operationId, compact: !Object.hasOwn(confirmed, 'payload'),
      other: other[0].status, revoked: revoked[0].status, encrypted: records.every((record) => record.ciphertext instanceof ArrayBuffer && !Object.hasOwn(record, 'payload')) };
  }, { scope, saved });
  expect(saved).toMatchObject({ mismatch: 'rejected', quota: 'rejected', quotaName: 'QuotaExceededError' });
  expect(restored).toEqual({ revision: 1, pendingId: saved.operationId, compact: true, other: 'rejected', revoked: 'rejected', encrypted: true });
});

test('IMG91-T06 区画の対応を下書き形式3へ移し、旧形式への降格と別区画を拒否する', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async (scope) => {
    const { createLayout, createSection } = await import('/src/domain/seats/index.ts');
    const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
    const { openDeviceDatabase } = await import('/src/storage/device-database.ts');
    const performance = { environmentId: scope.environmentId, performanceId: scope.performanceId };
    const layout = createSection(createLayout(performance), { name: '架空区画', rows: 1, columns: 2, axis: 'horizontal', seatOrder: 'forward', lines: [{ name: 'A' }] }).after;
    const baseVersions = { layoutRevision: 0, assignmentRevision: 0, ticketRevision: 0, controlRevision: 0, attendeeRevision: 0 };
    const input = { draftId: crypto.randomUUID(), layout, baseVersions, editReasons: {} };
    const store = createSeatDraftStore(scope, () => {});
    await store.saveLocalDraft(input, 0);
    const withImage = { ...input, imageBindings: { [layout.sections[0].section.sectionId]: '0' } };
    await store.saveLocalDraft(withImage, 1);
    const operationId = crypto.randomUUID();
    await store.prepareSeatOperation(withImage, 2, { operationId, kind: 'share',
      expectedVersions: { ...baseVersions, roleRevision: 1, deviceRevision: 1 }, command: { ...performance, action: 'fictional-share' } });
    const downgrade = await Promise.allSettled([store.saveLocalDraft(input, 3)]);
    const other = await Promise.allSettled([store.saveLocalDraft({ ...withImage, imageBindings: { [crypto.randomUUID()]: '0' } }, 3)]);
    const slot = await Promise.allSettled([store.saveLocalDraft({ ...withImage, imageBindings: { [layout.sections[0].section.sectionId]: '5' } }, 3)]);
    const database = await openDeviceDatabase();
    const formats = await new Promise((resolve) => {
      const transaction = database.transaction(['seatDrafts', 'seatOperations']);
      const draft = transaction.objectStore('seatDrafts').getAll(), operations = transaction.objectStore('seatOperations').getAll();
      transaction.oncomplete = () => resolve({ draft: draft.result[0].schemaVersion, operation: operations.result[0].schemaVersion });
    });
    database.close();

    return { downgrade: downgrade[0].status, other: other[0].status, slot: slot[0].status, formats,
      draft: (await store.loadLocalDraft()).imageBindings, operation: (await store.readPendingSeatOperation(operationId)).draftSnapshot.imageBindings };
  }, scope);
  expect(result).toMatchObject({ downgrade: 'rejected', other: 'rejected', slot: 'rejected', formats: { draft: 3, operation: 3 } });
  expect(Object.values(result.draft)).toEqual(['0']);
  expect(result.operation).toEqual(result.draft);
});

/** 製品の席編集を開き、画像の背景読込みを待つ。 */
async function openEditor(page) {
  await page.goto('/?preview=venue-images#/events/00000000-0000-4000-8000-000000000001/seats');
  await expect(page.getByRole('button', { name: '区画を追加' })).toBeEnabled();
}

/** 席編集の同じ入力経路で区画を追加する。 */
async function addSection(page, name) {
  await page.getByRole('button', { name: '区画を追加' }).click();
  await page.getByRole('dialog').getByLabel('区画名').fill(name);
  await page.getByRole('button', { name: '追加する', exact: true }).click();
}

/** ファイル選択から確認付きの端末保存までを操作する。 */
async function addImage(page, file) {
  const viewer = page.locator('.venue-images');
  if (!await viewer.evaluate((node) => node.open)) await viewer.locator('summary').click();
  const chooser = page.waitForEvent('filechooser');
  await viewer.getByRole('button', { name: '画像を追加', exact: true }).click();
  await (await chooser).setFiles(file);
  await page.getByRole('dialog', { name: '会場画像を追加', exact: true }).getByRole('button', { name: '端末に保存する' }).click();
  await expect(viewer.locator('img')).toBeVisible();
  await expect.poll(() => viewer.locator('img').evaluate((node) => node.naturalWidth)).toBeGreaterThan(0);
}

/** 区画と画像の対応を、座席の下書きと一体で保存する。 */
async function saveDraft(page) {
  await page.getByRole('button', { name: '下書き保存', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.getByText(/^この端末に保存済み・未確定/)).toBeVisible();
}

test('IMG91-T06・REQ-NF-014 画像の下部操作・中央縮小と任意の区画連動を確認し、再起動後も表示する', async ({ page }, info) => {
  await openEditor(page);
  await addSection(page, '架空の第一区画');
  await addImage(page, await imageFile(page));
  const viewer = page.locator('.venue-images');
  await expect(viewer.getByLabel('この区画で最初に表示する画像（任意）')).toHaveValue('');
  await viewer.getByLabel('この区画で最初に表示する画像（任意）').selectOption('0');
  await viewer.getByRole('button', { name: '会場画像を縮小' }).click();
  await viewer.getByRole('button', { name: '会場画像を縮小' }).click();
  await viewer.locator('img').evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
  const placement = await viewer.evaluate((node) => {
    const viewport = node.querySelector('.venue-image-viewport').getBoundingClientRect();
    const image = node.querySelector('img').getBoundingClientRect();
    const controls = node.querySelector('.venue-image-controls').getBoundingClientRect();

    return { centered: Math.abs((image.left + image.right) / 2 - (viewport.left + viewport.right) / 2), below: controls.top >= viewport.bottom,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(placement).toMatchObject({ below: true, overflow: false });
  expect(placement.centered).toBeLessThan(2);
  await viewer.screenshot({ path: `tests/emulator/artifacts/venue-images-${info.project.name}.png` });
  for (let step = 0; step < 6; step++) await viewer.getByRole('button', { name: '会場画像を拡大' }).click();
  const widths = await viewer.locator('img').evaluate(async (node) => {
    const values = [];
    for (let index = 0; index < 4; index++) {
      await new Promise(requestAnimationFrame);
      values.push(node.getBoundingClientRect().width);
    }

    return values;
  });
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.1);
  await viewer.getByRole('button', { name: '原寸', exact: true }).click();
  await expect(viewer.locator('.venue-image-zoom-controls')).toContainText('100%');
  const actual = await viewer.locator('img').evaluate((node) => ({ width: node.getBoundingClientRect().width, natural: node.naturalWidth }));
  expect(actual.width).toBeCloseTo(actual.natural, 1);
  for (let step = 0; step < 6; step++) await viewer.getByRole('button', { name: '会場画像を拡大' }).click();
  await expect(viewer.locator('.venue-image-zoom-controls')).toContainText('400%');
  const enlarged = await viewer.locator('img').evaluate((node) => ({ width: node.getBoundingClientRect().width, natural: node.naturalWidth }));
  expect(enlarged.width).toBeCloseTo(enlarged.natural * 4, 1);
  await viewer.getByRole('button', { name: '全体表示', exact: true }).click();
  await expect(viewer.locator('.venue-image-zoom-controls > span')).toHaveText(/^\d+%$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await saveDraft(page);
  await addSection(page, '架空の第二区画');
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像1');
  await addImage(page, await imageFile(page, '#5d3b71'));
  await saveDraft(page);
  await viewer.getByRole('button', { name: '次の会場画像' }).click();
  await expect(page.getByRole('heading', { name: '架空の第二区画', exact: true })).toBeVisible();
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像1');
  await viewer.locator('.venue-image-viewport').dispatchEvent('pointerdown', { clientX: 250, clientY: 120, pointerType: 'touch' });
  await viewer.locator('.venue-image-viewport').dispatchEvent('pointerup', { clientX: 100, clientY: 120, pointerType: 'touch' });
  await expect(page.getByRole('heading', { name: '架空の第二区画', exact: true })).toBeVisible();
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像2');
  await page.getByLabel('表示する区画').selectOption({ label: '架空の第一区画' });
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像1');
  await viewer.getByRole('button', { name: '前の会場画像' }).click();
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像2');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('表示する区画').selectOption({ label: '架空の第二区画' });
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像2');
  await page.reload();
  await expect(page.getByRole('button', { name: '区画を追加' })).toBeEnabled();
  const restored = page.locator('.venue-images');
  await restored.locator('summary').click();
  await expect(restored.locator('img')).toBeVisible();
  await expect.poll(() => restored.locator('img').evaluate((node) => node.naturalWidth)).toBe(480);
  // 外観の参考にした承認済みモックも、同じ幅で比較用に記録する。
  await page.goto('http://127.0.0.1:4181/mock/index.html');
  await page.evaluate(() => { S.screen = 'seats'; S.imageOpen = true; render(); });
  await page.locator('[data-venue-image]').screenshot({ path: `tests/emulator/artifacts/venue-image-mock-${info.project.name}.png` });
});

test('IMG91-T01・06 大きすぎる画像は読込み前に拒否し、5枠と差替え失敗時の現行を守る', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openEditor(page);
  await addSection(page, '架空区画');
  const file = await imageFile(page);
  await addImage(page, file);
  const viewer = page.locator('.venue-images');
  const original = await viewer.locator('img').getAttribute('src');
  expect(await viewer.locator('img').evaluate((node) => node.getAnimations().length)).toBe(0);
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    window.imageFileReads = 0;
    // 容量超過では、本文の読込み自体を始めないことを観測する。
    File.prototype.arrayBuffer = function () { window.imageFileReads++; return read.call(this); };
  });
  const chooser = page.waitForEvent('filechooser');
  await viewer.getByRole('button', { name: '画像を差し替え', exact: true }).click();
  await (await chooser).setFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(20_000_001) });
  await expect(viewer.getByRole('alert')).toContainText('1枚20MB以下');
  expect(await page.evaluate(() => window.imageFileReads)).toBe(0);
  await expect(viewer.locator('img')).toHaveAttribute('src', original);
  for (let i = 0; i < 4; i++) await addImage(page, file);
  await viewer.locator('input[type=file]').setInputFiles(file);
  await expect(viewer.getByRole('alert')).toContainText('5枚まで');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('画像削除は影響する区画を確認し、取消し・削除後の再読込みと枠の再利用ができる', async ({ page }) => {
  await openEditor(page);
  await addSection(page, '画像を使う第一区画');
  const file = await imageFile(page);
  await addImage(page, file);
  await page.getByLabel('この区画で最初に表示する画像（任意）').selectOption('0');
  await saveDraft(page);
  await addSection(page, '画像を使う第二区画');
  const viewer = page.locator('.venue-images');
  await viewer.getByLabel('この区画で最初に表示する画像（任意）').selectOption('0');
  await saveDraft(page);
  await viewer.getByRole('button', { name: '画像を削除', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '会場画像を削除', exact: true });
  await expect(dialog).toContainText('設定している区画は2区画');
  await expect(dialog.getByRole('button', { name: '閉じる', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(viewer.locator('img')).toBeVisible();
  await viewer.getByRole('button', { name: '画像を削除', exact: true }).click();
  await dialog.getByRole('button', { name: '削除する', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(viewer.locator('img')).toBeHidden();
  await expect(viewer).toContainText('表示できる会場画像はありません');
  await expect(page.getByRole('heading', { name: '画像を使う第二区画', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '区画を追加' })).toBeEnabled();
  await viewer.locator('summary').click();
  await expect(viewer.getByRole('button', { name: '画像を削除', exact: true })).toBeDisabled();
  await expect(viewer.locator('img')).toBeHidden();
  await addImage(page, file);
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像1');
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('画像削除の保存失敗では旧画像を保持し、明示した再試行だけで削除する', async ({ page }) => {
  await openEditor(page);
  await addSection(page, '架空の区画');
  await addImage(page, await imageFile(page));
  const viewer = page.locator('.venue-images');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.failImageDelete = true;
    // 削除済み版の保存だけを失敗させ、旧画像がトランザクションに残ることを確認する。
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'venueImages' && window.failImageDelete) throw new DOMException('test quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await viewer.getByRole('button', { name: '画像を削除', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '会場画像を削除', exact: true });
  await dialog.getByRole('button', { name: '削除する', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('元の画像を保持');
  await expect(viewer.locator('img')).toBeVisible();
  await page.evaluate(() => { window.failImageDelete = false; });
  await dialog.getByRole('button', { name: '削除する', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(viewer.locator('img')).toBeHidden();
});

test('全区画から5画像を閲覧でき、未設定や優先画像の削除でも残りの画像を表示する', async ({ page }) => {
  await openEditor(page);
  await addSection(page, '１階');
  const file = await imageFile(page);
  for (let index = 0; index < 5; index++) await addImage(page, file);
  const viewer = page.locator('.venue-images');
  const preferred = viewer.getByLabel('この区画で最初に表示する画像（任意）');
  await expect(viewer).toContainText('公演全体の画像：5／5枚');
  await expect(preferred).toHaveValue('');
  await saveDraft(page);
  await addSection(page, '２階');
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像5');
  await saveDraft(page);
  for (let index = 1; index <= 5; index++) {
    await viewer.getByRole('button', { name: '次の会場画像' }).click();
    await expect(viewer.locator('img')).toHaveAttribute('alt', `会場画像${index}`);
    await expect(page.getByRole('heading', { name: '２階', exact: true })).toBeVisible();
  }
  await preferred.selectOption('2');
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像3');
  await saveDraft(page);
  await page.getByLabel('表示する区画').selectOption({ label: '１階' });
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像3');
  await viewer.getByRole('button', { name: '次の会場画像' }).click();
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像4');
  await page.getByLabel('表示する区画').selectOption({ label: '２階' });
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像3');
  await preferred.selectOption('');
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像3');
  await preferred.selectOption('2');
  await saveDraft(page);
  await viewer.getByRole('button', { name: '画像を削除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する', exact: true }).click();
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像1');
  await expect(viewer).toContainText('公演全体の画像：4／5枚');
  await page.reload();
  await expect(page.getByRole('button', { name: '区画を追加' })).toBeEnabled();
  await viewer.locator('summary').click();
  await page.getByLabel('表示する区画').selectOption({ label: '２階' });
  await expect(preferred).toHaveValue('2');
  await expect(viewer.locator('img')).toBeVisible();
  await expect(viewer.locator('img')).toHaveAttribute('alt', '会場画像1');
});
