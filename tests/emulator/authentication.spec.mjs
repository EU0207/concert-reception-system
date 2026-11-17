// 架空アカウントだけを使い、本人認証画面を通常Firebase SDKとローカルAuthへ結合する。

import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const project = 'demo-concert-reception-product';
const endpoint = 'http://127.0.0.1:9291/identitytoolkit.googleapis.com/v1/';

/** ローカルAuthへ架空の本人を作り、メール送信の代わりにOOBコードを取得する。 */
async function authRequest(path, body, admin = false) {
  const response = await fetch(endpoint + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(admin ? { authorization: 'Bearer owner' } : {}) },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return response.json();
}

test('AUTH296-S01 通常SDKでメール確認・再認証・再設定と本人だけのログアウトを行う', async ({ page }) => {
  const email = `fictional-${randomUUID()}@example.invalid`, password = 'Fictional123';
  const account = await authRequest('accounts:signUp?key=demo-key', { email, password, returnSecureToken: true });
  const environmentId = randomUUID();
  await page.goto('http://127.0.0.1:4181/');
  await page.evaluate(async ({ environmentId, project }) => {
    const { createFirebasePrincipals, ensureDeviceIdentity } = await import('/src/adapters/firebase/principals.ts');
    const { createAuthenticationUiPort } = await import('/src/adapters/firebase/authentication-ui-port.ts');
    const { createAuthenticationScreen } = await import('/src/app/authentication-screen.ts');
    const principals = createFirebasePrincipals({ schemaVersion: 1, appVersion: '0.1.0', environmentId,
      environmentType: 'evaluation-firebase', environmentName: 'ローカル本人認証試験',
      firebase: { apiKey: 'demo-key', projectId: project, appId: 'demo-web', authDomain: 'localhost',
        databaseURL: `https://${project}-default-rtdb.firebaseio.com/` } }, 9291);
    const deviceUid = await ensureDeviceIdentity(principals);
    const screen = createAuthenticationScreen(createAuthenticationUiPort(principals));
    document.body.replaceChildren(screen.element);
    window.authenticationTrial = { principals, deviceUid, screen };
  }, { environmentId, project });
  await page.getByLabel('メールアドレス', { exact: true }).fill(email);
  await page.getByLabel('パスワード', { exact: true }).fill('Wrong123');
  await page.getByRole('button', { name: 'メールでログイン', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本人確認ができません');
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveValue('');
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'メールでログイン', exact: true }).click();
  await expect(page.getByText('メール確認が必要です', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '確認メールを再送' }).click();
  await expect(page.getByRole('status')).toContainText('確認メールを送信');
  const oobResponse = await fetch(`http://127.0.0.1:9291/emulator/v1/projects/${project}/oobCodes`);
  const oobs = (await oobResponse.json()).oobCodes;
  const verification = oobs.find(item => item.email === email && item.requestType === 'VERIFY_EMAIL');
  expect(Boolean(verification)).toBe(true);
  await authRequest('accounts:update?key=demo-key', { oobCode: verification.oobCode });
  await page.getByRole('button', { name: '確認状況を更新' }).click();
  await expect(page.getByText('本人認証済み', { exact: true })).toBeVisible();
  const before = await page.evaluate(async ({ environmentId, humanUid }) => {
    const { principals, deviceUid } = window.authenticationTrial;
    const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
    const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
    const { createLayout } = await import('/src/domain/seats/layout.ts');
    const binding = { environmentId, performanceId: crypto.randomUUID(), storageEpoch: crypto.randomUUID(), humanUid, deviceUid };
    await ensureDeviceKey(binding, true);
    const operationId = crypto.randomUUID();
    const baseVersions = { layoutRevision: 0, assignmentRevision: 0, ticketRevision: 0, controlRevision: 0, attendeeRevision: 0 };
    const store = createSeatDraftStore(binding, () => {});
    await store.prepareSeatOperation({ draftId: crypto.randomUUID(), layout: createLayout(binding), baseVersions }, 0,
      { operationId, kind: 'commit', expectedVersions: { ...baseVersions, roleRevision: 1, deviceRevision: 1 },
        command: { environmentId, performanceId: binding.performanceId, action: 'fictional-pending-save' } });
    window.authenticationTrial.retained = { binding, operationId };
    return principals.humanAuth.currentUser.uid;
  }, { environmentId, humanUid: account.localId });
  expect(before).toBe(account.localId);
  await page.getByRole('button', { name: '本人確認をやり直す' }).click();
  await page.getByLabel('本人確認用パスワード').fill(password);
  await page.getByRole('button', { name: '本人確認する', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('本人確認を更新');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page.getByRole('button', { name: 'メールでログイン', exact: true })).toBeVisible();
  const retained = await page.evaluate(async () => {
    const { principals, deviceUid, retained } = window.authenticationTrial;
    const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
    // 保存の保持だけを部品単位で確認する。ログアウト中の業務アクセスを許可する接続ではない。
    const pending = await createSeatDraftStore(retained.binding, () => {}).readPendingSeatOperation(retained.operationId);
    return { human: principals.humanAuth.currentUser, sameDevice: principals.deviceAuth.currentUser.uid === deviceUid,
      pending: { operationId: pending.operationId, status: pending.status, action: pending.command.action } };
  });
  expect(retained).toMatchObject({ human: null, sameDevice: true,
    pending: { status: 'prepared', action: 'fictional-pending-save', operationId: expect.any(String) } });
  await page.getByRole('button', { name: 'パスワードを忘れた場合' }).click();
  await expect(page.getByRole('status')).toContainText('該当するアカウントがある場合');
  const resetResponse = await fetch(`http://127.0.0.1:9291/emulator/v1/projects/${project}/oobCodes`);
  expect((await resetResponse.json()).oobCodes.some(item => item.email === email && item.requestType === 'PASSWORD_RESET')).toBe(true);
  await page.getByLabel('メールアドレス', { exact: true }).fill(`fictional-${randomUUID()}@example.invalid`);
  await page.getByRole('button', { name: 'パスワードを忘れた場合' }).click();
  await expect(page.getByRole('status')).toContainText('該当するアカウントがある場合');
});
