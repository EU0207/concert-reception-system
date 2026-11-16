// 実画像の変換、保存前の拡大確認と取消し、失敗時の保全をブラウザーで確認する。

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** 架空の席文字と決定的な模様だけで画像を作り、外部の写真を使わない。 */
async function fixture(page, noisy = false, mime = 'image/png') {
  const base64 = await page.evaluate(({ noisy, mime }) => {
    const canvas = document.createElement('canvas');
    canvas.width = noisy === 'dense' ? 1400 : noisy ? 2400 : 600;
    canvas.height = noisy === 'dense' ? 1200 : noisy ? 800 : 300;
    const draw = canvas.getContext('2d');
    draw.fillStyle = '#fff'; draw.fillRect(0, 0, canvas.width, canvas.height);
    if (noisy) {
      const pixels = draw.getImageData(0, 0, canvas.width, canvas.height);
      let seed = 12345;
      for (let index = 0; index < pixels.data.length; index += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[index] = seed & 255; pixels.data[index + 1] = seed >>> 8 & 255;
        pixels.data[index + 2] = seed >>> 16 & 255; pixels.data[index + 3] = 255;
      }
      draw.putImageData(pixels, 0, 0);
    }
    draw.fillStyle = '#111'; draw.font = '32px sans-serif'; draw.fillText('A-1  A-2  A-3', 30, 80);
    return canvas.toDataURL(mime).split(',')[1];
  }, { noisy, mime });
  return { name: 'fictional-photo', mimeType: mime, buffer: Buffer.from(base64, 'base64') };
}

/** 四隅の色が異なる人工画像で、回転の方向を画素から検査する。 */
async function rotationFile(page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 120;
    const draw = canvas.getContext('2d');
    for (const [color, x, y] of [['#ff0000', 0, 0], ['#00ff00', 120, 0], ['#0000ff', 0, 60], ['#ffff00', 120, 60]]) {
      draw.fillStyle = color; draw.fillRect(x, y, 120, 60);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'fictional-orientation.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

/** 表示中の実画像の寸法と四隅の色を読み、CSSだけの回転ではないことを確認する。 */
async function imageCorners(image) {
  return image.evaluate((node) => {
    if (!node.complete || !node.naturalWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = node.naturalWidth; canvas.height = node.naturalHeight;
    const draw = canvas.getContext('2d');
    draw.drawImage(node, 0, 0);
    const corners = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([x, y]) =>
      [...draw.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data].slice(0, 3));
    return { width: canvas.width, height: canvas.height, corners };
  });
}

/** 製品評価画面の画像欄を開き、端末復元の完了を待つ。 */
async function open(page) {
  await page.goto('/#/events/00000000-0000-4000-8000-000000000001/seats');
  await page.locator('.venue-images summary').click();
  await expect(page.getByRole('button', { name: '画像を追加', exact: true })).toBeEnabled();
}

/** 追加・差し替えの通常選択から保存前確認まで進める。 */
async function select(page, file, replace = false) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: replace ? '画像を差し替え' : '画像を追加', exact: true }).click();
  await (await chooser).setFiles(file);
  return page.getByRole('dialog', { name: replace ? '会場画像を差し替え' : '会場画像を追加', exact: true });
}

test('PHOTO294-T01 1MB超の写真を端末内で調整し、確認前と取消しでは保存しない', async ({ page }, info) => {
  const external = [];
  page.on('request', (request) => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/) && !request.url().startsWith('blob:')) external.push(request.url()); });
  await open(page);
  const file = await fixture(page, true);
  expect(file.buffer.length).toBeGreaterThan(1_000_000);
  const dialog = await select(page, file);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('JPEG');
  await expect(dialog.locator('.photo-information')).toHaveText(/^形式：JPEG　容量：[0-9.]+MB　サイズ：\d+×\d+px（元 \d+×\d+px）$/);
  await expect(dialog).not.toContainText('／1MB');
  const sizeLabel = await dialog.locator('.photo-information').innerText();
  expect(Number(sizeLabel.match(/容量：([0-9.]+)MB/)[1])).toBeLessThanOrEqual(1);
  await expect(page.locator('.venue-images')).toContainText('公演全体の画像：0／5枚');
  await dialog.getByRole('button', { name: '原寸で確認' }).click();
  await expect(dialog.getByRole('button', { name: '全体を表示' })).toHaveAttribute('aria-pressed', 'true');
  const width = await dialog.locator('.photo-preview img').evaluate((node) => node.naturalWidth);
  expect(width).toBeGreaterThanOrEqual(1600);
  expect(width).toBeLessThan(2400);
  await dialog.screenshot({ path: `tests/emulator/artifacts/photo-preview-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.locator('.venue-images')).toContainText('公演全体の画像：0／5枚');
  await select(page, file);
  await dialog.getByRole('button', { name: '端末に保存する' }).click();
  await expect(page.locator('.venue-images img')).toBeVisible();
  const viewer = page.locator('.venue-images');
  await viewer.getByRole('button', { name: '原寸', exact: true }).click();
  await expect.poll(() => viewer.locator('img').evaluate((node) => node.getBoundingClientRect().width / node.naturalWidth)).toBeCloseTo(1, 2);
  const initialViewport = page.viewportSize();
  await page.setViewportSize({ ...initialViewport, width: initialViewport.width + 80 });
  await expect.poll(() => viewer.locator('img').evaluate((node) => node.getBoundingClientRect().width / node.naturalWidth)).toBeCloseTo(1, 2);
  await page.setViewportSize(initialViewport);
  for (let step = 0; step < 8; step++) await viewer.getByRole('button', { name: '会場画像を拡大' }).click();
  await expect(viewer.locator('.venue-image-zoom-controls')).toContainText('400%');
  expect(await viewer.locator('img').evaluate((node) => node.getBoundingClientRect().width / node.naturalWidth)).toBeCloseTo(4, 2);
  await viewer.getByRole('button', { name: '全体表示', exact: true }).click();
  await expect(viewer.locator('.venue-image-zoom-controls > span')).toHaveText(/^\d+%$/);
  await page.reload();
  await page.locator('.venue-images summary').click();
  await expect(page.locator('.venue-images img')).toBeVisible();
  expect(external).toEqual([]);
});

test('PHOTO294-T02 線と文字のPNGを無劣化候補として選び、破損画像では元を保持する', async ({ page }) => {
  await open(page);
  const dialog = await select(page, await fixture(page));
  await expect(dialog).toContainText('PNG');
  await expect(dialog).toContainText('600×300px');
  await dialog.getByRole('button', { name: '端末に保存する' }).click();
  await expect(page.locator('.venue-images img')).toBeVisible();
  const prior = await page.locator('.venue-images img').getAttribute('src');
  await select(page, { name: 'fake.heic', mimeType: 'image/heic', buffer: Buffer.from('not a picture') }, true);
  await expect(page.locator('.venue-images [role=alert]')).toContainText('元の画像は保持');
  await expect(page.locator('.venue-images img')).toHaveAttribute('src', prior);
});

test('PHOTO294-T03 実HEICの追加デコーダーを製品CSP下で実行し、保存後も復号できる', async ({ page, context }) => {
  await open(page);
  const file = { name: 'rainbow.heic', mimeType: 'image/heic',
    buffer: await readFile(new URL('../fixtures/rainbow-451x461.heic', import.meta.url)) };
  const dialog = await select(page, file);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('451×461px');
  await dialog.getByRole('button', { name: '端末に保存する' }).click();
  await expect(page.locator('.venue-images img')).toHaveJSProperty('naturalWidth', 451);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.locator('.venue-images summary').click();
  await expect(page.locator('.venue-images img')).toHaveJSProperty('naturalHeight', 461);
  const offline = await select(page, file);
  await expect(offline).toContainText('451×461px');
  await offline.getByRole('button', { name: '右回り', exact: true }).click();
  await expect(offline.locator('.photo-preview img')).toHaveJSProperty('naturalWidth', 461);
  await expect(offline.locator('.photo-preview img')).toHaveJSProperty('naturalHeight', 451);
  await offline.getByRole('button', { name: '閉じる', exact: true }).click();
});

test('PHOTO294-T04 Worker取消し・入力上限・標準復号可能なWebPを確認する', async ({ page }) => {
  await page.goto('http://127.0.0.1:4181/');
  const file = await fixture(page, false, 'image/webp');
  const result = await page.evaluate(async (bytes) => {
    const { convertPhoto } = await import('/src/app/photo-conversion.ts');
    const file = new File([Uint8Array.from(bytes)], 'fixture.webp', { type: 'image/webp' });
    const controller = new AbortController();
    const cancelled = convertPhoto(file, controller.signal).catch((error) => error.message);
    controller.abort();
    const oversized = await convertPhoto(new File([new Uint8Array(20_000_001)], 'large.png'), new AbortController().signal).catch((error) => error.message);
    const invalidTurn = await convertPhoto(file, new AbortController().signal, 99).catch((error) => error.message);
    const output = await convertPhoto(file, new AbortController().signal);
    return { cancelled: await cancelled, oversized, invalidTurn, type: output.blob.type, width: output.width, size: output.blob.size };
  }, [...file.buffer]);
  expect(result).toMatchObject({ cancelled: 'PHOTO_CANCELLED', oversized: 'PHOTO_INPUT_SIZE', invalidTurn: 'PHOTO_ROTATION', type: 'image/png', width: 600 });
  expect(result.size).toBeLessThanOrEqual(1_000_000);
});

test('PHOTO294-T05 画質下限で収まらない画像を拒否し、JPEGの撮影方向を反映する', async ({ page }) => {
  await page.goto('http://127.0.0.1:4181/');
  const dense = await fixture(page, 'dense');
  const jpeg = await fixture(page, false, 'image/jpeg');
  // 架空JPEGへ標準EXIF Orientation=6だけを付け、90度回転を再現する。
  const exif = Buffer.from([0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0,
    1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
  const rotated = Buffer.concat([jpeg.buffer.subarray(0, 2), exif, jpeg.buffer.subarray(2)]);
  const result = await page.evaluate(async ({ dense, rotated }) => {
    const { convertPhoto } = await import('/src/app/photo-conversion.ts');
    const rejected = await convertPhoto(new File([Uint8Array.from(atob(dense), (value) => value.charCodeAt(0))], 'dense.png'), new AbortController().signal).catch((error) => error.message);
    const photo = await convertPhoto(new File([Uint8Array.from(atob(rotated), (value) => value.charCodeAt(0))], 'rotate.jpg'), new AbortController().signal);
    return { rejected, width: photo.width, height: photo.height };
  }, { dense: dense.buffer.toString('base64'), rotated: rotated.toString('base64') });
  expect(result).toEqual({ rejected: 'PHOTO_CANNOT_FIT', width: 300, height: 600 });
});

test('PHOTO294-T06 処理中の点表示と動きを減らす設定、キャンセルによる旧画像保全', async ({ page }) => {
  await open(page);
  const file = await fixture(page);
  const confirm = await select(page, file);
  await confirm.getByRole('button', { name: '端末に保存する' }).click();
  await expect(page.locator('.venue-images img')).toBeVisible();
  const original = await page.locator('.venue-images img').getAttribute('src');
  // Workerへの投入を保留し、端末速度に依存せず処理中の取消しを確認する。
  await page.evaluate(() => {
    window.photoPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function () {};
  });
  await select(page, file, true);
  const pending = page.getByRole('dialog', { name: '会場画像を調整中', exact: true });
  await expect(pending.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  await expect(pending.locator('.photo-progress-dots')).toHaveAttribute('aria-hidden', 'true');
  const dots = pending.locator('.photo-progress-dots span');
  await expect(dots).toHaveCount(3);
  await expect.poll(() => dots.evaluateAll((nodes) => nodes.reduce((count, node) => count + node.getAnimations().length, 0))).toBe(3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => dots.evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).animationName === 'none'))).toBe(true);
  await pending.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.venue-images img')).toHaveAttribute('src', original);
  await page.evaluate(() => { Worker.prototype.postMessage = window.photoPostMessage; });
  const retry = await select(page, file, true);
  await expect(retry).toBeVisible();
  await retry.getByRole('button', { name: '閉じる', exact: true }).click();
});

test('PHOTO294-T07 保存前の左右90度回転を画素で確認し、保存・再起動後も向きを保持する', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.photoMessages = [];
    window.photoDigests = 0;
    const post = Worker.prototype.postMessage, digest = SubtleCrypto.prototype.digest;
    Worker.prototype.postMessage = function (message) {
      window.photoMessages.push({ kind: message.kind, turn: message.quarterTurns ?? 0 });
      return post.call(this, message);
    };
    SubtleCrypto.prototype.digest = function (...args) { window.photoDigests++; return digest.apply(this, args); };
  });
  const file = await rotationFile(page);
  const dialog = await select(page, file), preview = dialog.locator('.photo-preview img');
  const red = [255, 0, 0], green = [0, 255, 0], blue = [0, 0, 255], yellow = [255, 255, 0];
  const original = { width: 240, height: 120, corners: [red, green, blue, yellow] };
  const right = { width: 120, height: 240, corners: [blue, red, yellow, green] };
  const left = { width: 120, height: 240, corners: [green, yellow, red, blue] };
  await expect(dialog.locator('.photo-preview-controls button')).toHaveText(['原寸で確認', '左回り', '右回り']);
  await dialog.getByRole('button', { name: '右回り', exact: true }).click();
  await expect.poll(() => imageCorners(preview)).toEqual(right);
  await expect(dialog.locator('.photo-information')).toContainText('サイズ：120×240px（元 240×120px）');
  await dialog.getByRole('button', { name: '左回り', exact: true }).click();
  await expect.poll(() => imageCorners(preview)).toEqual(original);
  await dialog.getByRole('button', { name: '左回り', exact: true }).click();
  await expect.poll(() => imageCorners(preview)).toEqual(left);
  await dialog.getByRole('button', { name: '右回り', exact: true }).click();
  await expect.poll(() => imageCorners(preview)).toEqual(original);
  for (let index = 0; index < 4; index++) {
    await dialog.getByRole('button', { name: '右回り', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '右回り', exact: true })).toBeEnabled();
  }
  await expect.poll(() => imageCorners(preview)).toEqual(original);
  await dialog.getByRole('button', { name: '右回り', exact: true }).click();
  await expect.poll(() => imageCorners(preview)).toEqual(right);
  const work = await page.evaluate(() => ({ messages: window.photoMessages, digests: window.photoDigests }));
  expect(work).toEqual({ messages: [{ kind: 'initialize', turn: 0 }, { kind: 'rotate', turn: 1 },
    { kind: 'rotate', turn: 3 }, { kind: 'rotate', turn: 2 }], digests: 4 });
  await dialog.getByRole('button', { name: '端末に保存する' }).click();
  await expect.poll(() => imageCorners(page.locator('.venue-images img'))).toEqual(right);
  await page.reload();
  await page.locator('.venue-images summary').click();
  await expect.poll(() => imageCorners(page.locator('.venue-images img'))).toEqual(right);
  const replacement = await select(page, file, true);
  await replacement.getByRole('button', { name: '左回り', exact: true }).click();
  await expect.poll(() => imageCorners(replacement.locator('.photo-preview img'))).toEqual(left);
  await replacement.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect.poll(() => imageCorners(page.locator('.venue-images img'))).toEqual(right);
});

test('PHOTO294-T08 回転失敗と回転中の取消しでは確認中の画像と登録画像を保持する', async ({ page }) => {
  await open(page);
  const file = await rotationFile(page);
  const initial = await select(page, file);
  await initial.getByRole('button', { name: '端末に保存する' }).click();
  await expect(page.locator('.venue-images img')).toBeVisible();
  const saved = await imageCorners(page.locator('.venue-images img'));
  const dialog = await select(page, file, true), preview = dialog.locator('.photo-preview img');
  await expect.poll(() => imageCorners(preview)).toEqual(saved);
  await page.evaluate(() => {
    window.rotationPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (input) {
      return window.rotationPostMessage.call(this, { ...input, quarterTurns: 99 });
    };
  });
  await dialog.getByRole('button', { name: '右回り', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('確認中の画像は変更していません');
  await expect.poll(() => imageCorners(preview)).toEqual(saved);
  await expect(dialog.getByRole('button', { name: '端末に保存する' })).toBeEnabled();
  await page.evaluate(() => { Worker.prototype.postMessage = function () {}; });
  await dialog.getByRole('button', { name: '左回り', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('回転しています…');
  await expect(dialog.getByRole('button', { name: '端末に保存する' })).toBeDisabled();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => { Worker.prototype.postMessage = window.rotationPostMessage; });
  await expect.poll(() => imageCorners(page.locator('.venue-images img'))).toEqual(saved);
  await page.reload();
  await page.locator('.venue-images summary').click();
  await expect.poll(() => imageCorners(page.locator('.venue-images img'))).toEqual(saved);
});

test('PHOTO294-T09 同じ向きの要求と結果を共有し、終了後と別の確認画面へキャッシュを持ち越さない', async ({ page }) => {
  await page.goto('http://127.0.0.1:4181/');
  const file = await rotationFile(page);
  const result = await page.evaluate(async (bytes) => {
    const { createPhotoSession } = await import('/src/app/photo-conversion.ts');
    const NativeWorker = Worker, messages = [];
    let created = 0, terminated = 0;
    window.Worker = new Proxy(NativeWorker, { construct(target, args) {
      created++;
      const worker = Reflect.construct(target, args), post = worker.postMessage, terminate = worker.terminate;
      worker.postMessage = function (message) {
        messages.push({ kind: message.kind, hasFile: Object.hasOwn(message, 'file') });
        return post.call(this, message);
      };
      worker.terminate = function () { terminated++; return terminate.call(this); };
      return worker;
    } });
    try {
      const source = new File([Uint8Array.from(bytes)], 'fictional-rotation.png', { type: 'image/png' });
      const controller = new AbortController(), session = createPhotoSession(source, controller.signal);
      const original = await session.original;
      const [first, duplicate] = await Promise.all([session.rotate(1), session.rotate(1)]);
      const again = await session.rotate(1), back = await session.rotate(0);
      await session.rotate(2); await session.rotate(3);
      const firstMessages = [...messages];
      session.close(); controller.abort();
      const closed = await session.rotate(1).catch((error) => error.message);
      const another = createPhotoSession(source, new AbortController().signal);
      const reopened = await another.rotate(1);
      another.close();
      return { shared: first === duplicate && first === again, original: back === original, fresh: reopened !== first,
        closed, created, terminated, firstMessages, bytes: first.blob.size };
    } finally { window.Worker = NativeWorker; }
  }, [...file.buffer]);
  expect(result).toMatchObject({ shared: true, original: true, fresh: true, closed: 'PHOTO_CANCELLED', created: 2, terminated: 2,
    firstMessages: [{ kind: 'initialize', hasFile: true }, { kind: 'rotate', hasFile: false },
      { kind: 'rotate', hasFile: false }, { kind: 'rotate', hasFile: false }] });
  expect(result.bytes).toBeLessThanOrEqual(1_000_000);
});
