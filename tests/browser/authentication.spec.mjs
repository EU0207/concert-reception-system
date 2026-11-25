// 本人認証画面の入力・遅延応答と、PC・スマホ幅のローカル見本を確認する。

import { test, expect } from '@playwright/test';

test('AUTH296-B01 見本でメール確認・再認証・ログアウトを通して操作できる', async ({ page }) => {
  await page.goto('/#/login');
  await expect(page.getByText('画面確認用の見本です。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'メールでログイン', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('メールアドレスの形式');
  await page.getByLabel('メールアドレス', { exact: true }).fill('fictional@example.invalid');
  await page.getByLabel('パスワード', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'メールでログイン', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('パスワード：半角英字を含めてください。');
  await page.getByLabel('パスワード', { exact: true }).fill('Abc123');
  await page.getByRole('button', { name: 'メールでログイン', exact: true }).click();
  await expect(page.getByText('メール確認が必要です', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '確認メールを再送' }).click();
  await expect(page.getByRole('status')).toContainText('確認メールを送信');
  await page.getByRole('button', { name: '確認状況を更新' }).click();
  await expect(page.getByText('見本：本人認証後の表示', { exact: true })).toBeVisible();
  await expect(page.getByText('公演の権限と端末準備は未確認です。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '本人確認をやり直す' }).click();
  await page.getByLabel('本人確認用パスワード').fill('Abc123');
  await page.getByRole('button', { name: '本人確認する', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('本人確認を更新');
  await page.evaluate(() => localStorage.setItem('fictional-retained-marker', 'unsent'));
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('端末に保存したデータは保持');
  expect(await page.evaluate(() => localStorage.getItem('fictional-retained-marker'))).toBe('unsent');
  await page.getByRole('button', { name: 'パスワードを忘れた場合' }).click();
  await expect(page.getByRole('status')).toContainText('該当するアカウントがある場合');
  await page.getByRole('button', { name: 'Googleでログイン', exact: true }).click();
  await expect(page.getByText('見本：本人認証後の表示', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('AUTH296-B02 重複送信・機密エラー・画面終了後の応答を防ぐ', async ({ page }) => {
  await page.goto('http://127.0.0.1:4181/');
  await page.evaluate(async () => {
    const { createAuthenticationScreen } = await import('/src/app/authentication-screen.ts');
    let resolve, reject;
    const delayed = new Promise((yes, no) => { resolve = yes; reject = no; });
    window.authTrial = { calls: 0, resolve, reject, unsubscribed: false };
    const port = {
      identity: async () => null,
      google: () => { window.authTrial.calls++; return delayed; },
      password: async () => {}, verification: async () => {}, refresh: async () => {},
      resetPassword: async () => {}, reauthenticate: async () => {}, signOut: async () => {},
      onChange: () => () => { window.authTrial.unsubscribed = true; },
    };
    const screen = createAuthenticationScreen(port);
    window.authTrial.port = port;
    window.authTrial.screen = screen;
    document.body.replaceChildren(screen.element);
  });
  await page.getByRole('button', { name: 'Googleでログイン', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeDisabled();
  await page.evaluate(() => document.querySelector('button').click());
  expect(await page.evaluate(() => window.authTrial.calls)).toBe(1);
  await page.evaluate(() => window.authTrial.reject({ code: 'auth/invalid-credential', message: 'SECRET-DO-NOT-DISPLAY' }));
  await expect(page.getByRole('alert')).toContainText('本人確認ができません');
  await expect(page.locator('body')).not.toContainText('SECRET-DO-NOT-DISPLAY');
  await page.evaluate(() => { window.authTrial.port.google = async () => { throw { code: 'auth/popup-closed-by-user' }; }; });
  await page.getByRole('button', { name: 'Googleでログイン', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ログインをキャンセルしました');
  await page.evaluate(() => { window.authTrial.port.google = async () => { throw { code: 'auth/network-request-failed' }; }; });
  await page.getByRole('button', { name: 'Googleでログイン', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('接続を確認');
  await page.evaluate(() => {
    window.authTrial.screen.dispose();
    document.body.append(document.createTextNode('移動済み'));
  });
  expect(await page.evaluate(() => window.authTrial.unsubscribed)).toBe(true);
  // 別画面に移動した後に届く応答が、旧画面を復活させないことを確認する。
  await page.evaluate(async () => {
    const { createAuthenticationScreen } = await import('/src/app/authentication-screen.ts');
    let resolve;
    const wait = new Promise(yes => { resolve = yes; });
    const screen = createAuthenticationScreen({ identity: () => wait, onChange: () => () => {} });
    document.body.append(screen.element);
    screen.dispose();
    resolve({ uid: 'fictional', emailVerified: true, provider: 'google.com', authenticatedAt: Date.now() });
    await wait;
  });
  await expect(page.locator('body')).toHaveText('移動済み');
});
