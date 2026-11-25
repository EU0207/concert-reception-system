import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../../config/app-config.local.example.json', import.meta.url), 'utf8'));
async function ready(page) {
  await page.goto('/'); await expect(page.getByRole('heading', { name: '公演一覧', exact: true })).toBeVisible();
}
async function binding(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('concert-reception-bootstrap', 1);
    request.onerror = reject;
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('settings'), result = tx.objectStore('settings').get('binding');
      tx.oncomplete = () => { db.close(); resolve(result.result); };
    };
  }));
}
async function seedProtectedData(page) {
  await page.evaluate(async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('concert-reception-test-sentinel', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onerror = reject;
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put('fictional-unsent', 'event'); tx.objectStore('records').put(key, 'key');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
}
async function expectProtectedData(page) {
  const result = await page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('concert-reception-test-sentinel', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('records'), store = tx.objectStore('records');
      const event = store.get('event'), key = store.get('key');
      tx.oncomplete = () => { db.close(); resolve({ event: event.result, extractable: key.result.extractable, type: key.result.type }); };
    };
  }));
  expect(result).toEqual({ event: 'fictional-unsent', extractable: false, type: 'secret' });
}
test('APP258-B01 公演選択・戻る・接続状態とスマホのメニューを操作する', async ({ page }, testInfo) => {
  await ready(page);
  await page.locator('a.skip').focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '公演一覧', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /秋の室内楽コンサート/ }).click();
  await expect(page.getByRole('heading', { name: '秋の室内楽コンサート' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'お客様の席を設定', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '接続と端末の状態' }).click();
  await expect(page.getByRole('dialog')).toContainText('未送信件数：未取得');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.goBack(); await expect(page.getByRole('heading', { name: '公演一覧', exact: true })).toBeVisible();
  if (testInfo.project.name === 'phone-layout') {
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await page.getByRole('complementary', { name: '画面メニュー' }).getByRole('link', { name: 'このアプリについて' }).click();
  } else await page.getByRole('navigation').getByRole('link', { name: 'このアプリについて' }).click();
  await expect(page.getByRole('heading', { name: 'このアプリについて' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('APP258-B10 メニューは左端から開き、閉じる操作と幅900pxの切替を保つ', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 844 }); await ready(page);
  const toggle = page.getByRole('button', { name: 'メニューを開く' });
  const menu = page.getByRole('complementary', { name: '画面メニュー' });
  const close = menu.getByRole('button', { name: 'メニューを閉じる' });
  await expect(menu).not.toBeVisible(); await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true'); await expect(close).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await menu.boundingBox())?.x).toBe(0);
  expect((await menu.boundingBox()).width).toBe(320);
  expect(await page.locator('.content').evaluate(node => node.inert)).toBe(true);
  await page.keyboard.press('Shift+Tab'); await expect(menu.getByRole('link', { name: 'このアプリについて' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(menu).not.toBeVisible(); await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await page.locator('.content').evaluate(node => node.inert)).toBe(false);
  await toggle.click(); await close.click(); await expect(toggle).toBeFocused();
  await toggle.click(); await page.locator('.drawer-backdrop').click({ position: { x: 850, y: 400 } });
  await expect(menu).not.toBeVisible(); await expect(toggle).toBeFocused();
  await toggle.click(); await menu.getByRole('link', { name: 'このアプリについて' }).click();
  await expect(page.getByRole('heading', { name: 'このアプリについて' })).toBeVisible(); await expect(menu).not.toBeVisible();
  await toggle.click(); await page.setViewportSize({ width: 901, height: 844 });
  await expect(menu).toBeVisible(); await expect(toggle).not.toBeVisible();
  await expect(page.locator('main')).toBeFocused();
  expect(await page.locator('.content').evaluate(node => node.inert)).toBe(false);
  await page.setViewportSize({ width: 900, height: 844 }); await expect(menu).not.toBeVisible();
});
for (const [name, body, status] of [
  ['未設定', '', 404], ['不正形式', { ...config, schemaVersion: 9 }, 200],
  ['アプリ版違い', { ...config, appVersion: 'invalid-version' }, 200],
  ['実環境の認可基盤待ち', { ...config, environmentType: 'production', firebase: {
    apiKey: 'fictional', authDomain: 'fictional.invalid', projectId: 'fictional', appId: 'fictional', databaseURL: 'https://fictional.firebaseio.com/',
  } }, 200],
]) {
  test(`APP258-B02 ${name}では外部接続も業務画面表示もしない`, async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.route('**/app-config.json', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
    await page.goto('/'); await expect(page.getByRole('heading', { name: '利用を開始できません' })).toBeVisible();
    expect(requests.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))).toBe(0);
  });
}
test('APP258-B03 同じブラウザーの設定をAからBへ差し替えると停止し、元の結付きを残す', async ({ page }) => {
  await ready(page); const original = await binding(page);
  await page.route('**/app-config.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...config, environmentId: '00000000-0000-4000-8000-000000000259' }) }));
  await page.reload(); await expect(page.getByRole('heading', { name: '利用を開始できません' })).toBeVisible();
  await expect(page.getByText('このブラウザーに保存された利用環境と設定が異なります。', { exact: false })).toBeVisible();
  expect(await binding(page)).toEqual(original);
});
test('APP258-B04 保存領域が使えなければ成功扱いにしない', async ({ page }) => {
  await page.addInitScript(() => { indexedDB.open = () => { throw new DOMException('fictional failure', 'QuotaExceededError'); }; });
  await page.goto('/'); await expect(page.getByRole('heading', { name: '利用を開始できません' })).toBeVisible();
  await expect(page.getByText('この端末へ設定を保存できません。', { exact: false })).toBeVisible();
});
test('APP258-B05 保存済みでも明示的な不正設定・サーバー拒否から旧設定へ逃げない', async ({ page }) => {
  await ready(page);
  await page.route('**/app-config.json', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }));
  await page.reload(); await expect(page.getByRole('heading', { name: '利用を開始できません' })).toBeVisible();
});
test('APP258-B06 設定由来の文字列をHTMLとして実行しない', async ({ page }) => {
  await page.route('**/app-config.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...config, environmentName: '<img src=x onerror=alert(1)>' }) }));
  await ready(page); expect(await page.locator('img').count()).toBe(0);
  await expect(page.getByText('<img src=x onerror=alert(1)> · 架空データのみ', { exact: true })).toBeVisible();
});
test('APP258-B07 PWA完全オフライン再起動で公演移動ができ、未受領・非抽出鍵を保持する', async ({ page, context }) => {
  await ready(page); await seedProtectedData(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload(); await expect(page.getByRole('heading', { name: '公演一覧', exact: true })).toBeVisible();
  // navigator.onLineだけを信頼せず、取得失敗時もオンライン成功へ戻さない。
  await expect(page.getByRole('button', { name: '接続と端末の状態' })).toHaveText(/^(通信できません|接続を確認できません)$/);
  await expect(page.getByText('オフライン起動の準備を完了できませんでした。', { exact: false })).toHaveCount(0);
  await page.getByRole('link', { name: /冬のピアノリサイタル/ }).click();
  await expect(page.getByRole('heading', { name: '冬のピアノリサイタル' })).toBeVisible();
  await expectProtectedData(page);
  await context.setOffline(false);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(r => new URL(r.url).pathname)))).flat();
  });
  expect(cached).toContain('/index.html'); expect(cached).not.toContain('/app-config.json');
  // 写真変換で追加した配布ライセンスも、オフラインで読める静的資産に含める。
  const staticFiles = ['/index.html', '/icon.svg', '/manifest.webmanifest',
    '/licenses/photo-conversion.html', '/licenses/GPL-3.0.txt', '/licenses/heic-to-1.6.7-LICENSE.txt',
    '/licenses/libde265-LGPL-3.0.txt', '/licenses/libheif-LGPL-3.0.txt'];
  expect(cached).toEqual(expect.arrayContaining(staticFiles));
  expect(cached.every(url => url.startsWith('/assets/') || staticFiles.includes(url))).toBe(true);
});
test('APP258-B08 古い設定の指紋が壊れていればオフライン起動を止める', async ({ page, context }) => {
  await ready(page); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await page.reload();
  await page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('concert-reception-bootstrap', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('settings', 'readwrite'), store = tx.objectStore('settings');
      const read = store.get('binding'); read.onsuccess = () => store.put({ ...read.result, fingerprint: 'invalid' }, 'binding');
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('heading', { name: '利用を開始できません' })).toBeVisible();
});
test('APP258-B09 更新待ちは自動反映・再読込せず、未受領・鍵を保持する', async ({ page }) => {
  await ready(page); await seedProtectedData(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const workerPath = new URL('../../dist/sw.js', import.meta.url), original = await readFile(workerPath, 'utf8');
  try {
    await writeFile(workerPath, original.replace(/concert-shell-[a-f\d]+/, 'concert-shell-browser-test-' + Date.now()));
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await expect(page.getByText('新しいアプリ版の準備ができました。', { exact: false })).toBeVisible();
    await expectProtectedData(page);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.waiting !== null))).toBe(true);
  } finally { await writeFile(workerPath, original); }
});
