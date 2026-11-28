// 管理者の追加端末を、発行・新端末での確認と結果回収までPC・スマートフォン幅で確認する。
import {test,expect} from '@playwright/test';
const route='/#/events/00000000-0000-4000-8000-000000000001/owner-devices';

/** 見本で発行したリンクを取得し、平文の表示を閉じる。 */
async function issue(page) {
  await page.getByRole('button',{name:'リンクを発行',exact:true}).first().click();
  const link=await page.getByRole('textbox',{name:'追加端末リンク',exact:true}).inputValue();
  await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).click();
  return link;
}

test('OWNER317-B01 発行・確認・関連付けし、承認をデータ準備完了と表示しない',async({page})=>{
  await page.goto(route); const link=await issue(page);
  await expect(page.getByRole('textbox',{name:'追加端末リンク',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'発行済み：スマートフォン（2台目）',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:/：スマートフォン（2台目）$/})).toHaveCount(1);
  await page.getByRole('button',{name:'スマートフォン（2台目）',exact:true}).click();
  await page.getByLabel('受け取った追加端末リンク').fill(link);
  await page.getByRole('button',{name:'リンクを確認',exact:true}).click();
  await expect(page.getByLabel('受け取った追加端末リンク')).toHaveValue('');
  await expect(page.getByRole('dialog',{name:'この端末を関連付けますか？'})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'キャンセル',exact:true}).click();
  await expect(page.getByRole('heading',{name:'関連付け済み',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'この端末を関連付ける',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'関連付ける',exact:true}).click();
  await expect(page.getByRole('heading',{name:'関連付け済み',exact:true})).toBeVisible();
  await expect(page.getByText('受付の前に、この端末のデータ準備が必要です。')).toBeVisible();
  await page.getByRole('button',{name:'既存端末の見本',exact:true}).click();
  await expect(page.getByRole('heading',{name:/関連付け済み/})).toBeVisible();
});

test('OWNER317-B02 無効なリンクを拒否し、入力欄と確認ボタンの間に理由を表示する',async({page})=>{
  await page.goto(route); const link=await issue(page);
  await page.getByRole('button',{name:'リンクを取り消す',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'取り消す',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('取り消しました。');
  await expect(page.getByRole('heading',{name:/取消し済み/})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'承認待ち端末：スマートフォン（2台目）',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:/：スマートフォン（2台目）$/})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'リンクを発行',exact:true}).first()).toBeEnabled();
  await page.getByRole('button',{name:'スマートフォン（2台目）',exact:true}).click();
  const input = page.getByLabel('受け取った追加端末リンク');
  const alert = page.locator('textarea + [role="alert"]');
  const confirm = page.getByRole('button', { name: 'リンクを確認', exact: true });
  const otherPerformance = link.replace('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
  for (const [value, reason] of [
    ['URLではない文字列', '有効な追加端末リンクを貼り付けてください。'],
    [otherPerformance, 'この端末・公演で使えるリンクを貼り付けてください。'],
    [link, '既存の管理者端末で新しいリンクを発行し、ここに貼り付けてください。'],
  ]) {
    await input.fill(value);
    await expect(alert).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-invalid');
    await confirm.click();
    await expect(alert.getByText('このリンクは使えません', { exact: true })).toBeVisible();
    await expect(alert).toContainText(reason);
    await expect(alert).toHaveCSS('color','rgb(161, 38, 34)');
    await expect(alert.getByText('！', { exact: true })).toBeVisible();
    await expect(input).toHaveCSS('border-top-color', 'rgb(161, 38, 34)');
    await expect(input).toHaveAccessibleDescription(new RegExp(reason));
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveValue('');
    await expect(page.locator('textarea + [role="alert"] + div').getByRole('button', { name: 'リンクを確認' })).toBeVisible();
    await expect(page.getByRole('button',{name:'この端末を関連付ける',exact:true})).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('OWNER317-B03 起動時のリンク断片を設定取得前に除去し、認証・承認を自動送信しない',async({page})=>{
  const token='A'.repeat(43);
  await page.goto('/?environment=00000000-0000-4000-8000-000000000099&performance=00000000-0000-4000-8000-000000000001#owner-device-link='+token);
  await expect(page.getByRole('heading',{name:'管理者の追加端末',exact:true})).toBeVisible();
  expect(page.url()).not.toContain(token); expect(page.url()).not.toContain('environment=');
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(token);
  await expect(page.getByRole('heading',{name:'関連付け済み',exact:true})).toHaveCount(0);
});

test('OWNER317-B04 発行表示を閉じると再表示せず、再読込みから勝手に発行し直さない',async({page})=>{
  await page.goto(route); const link=await issue(page);
  await page.getByRole('button',{name:'最新の状態を確認',exact:true}).click();
  await expect(page.getByRole('button',{name:'リンクを取り消す',exact:true})).toHaveCount(1);
  expect(await page.locator('body').textContent()).not.toContain(new URL(link).hash.slice(1));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  expect(overflow).toBe(false);
});

test('OWNER317-B05 発行中の失効通知後に届いたリンクを表示しない',async({page})=>{
  await page.goto('http://127.0.0.1:4181/tests/emulator/device-management-fixture.html');
  await page.waitForFunction(()=>window.deviceFixtureReady===true);
  await page.evaluate(async()=>{
    const {createOwnerDevicePreview}=await import('/src/app/owner-device-preview.ts');
    const {createOwnerDeviceScreen}=await import('/src/app/owner-device-screen.ts');
    const backend=createOwnerDevicePreview({environmentId:crypto.randomUUID(),performanceId:crypto.randomUUID()});
    const port={...backend.issuer,onInvalidate(listener){window.invalidateOwner=listener;return()=>{};},
      async issue(...args){const value=await backend.issuer.issue(...args);await new Promise(resolve=>{window.resolveOwner=resolve;});return value;}};
    document.body.replaceChildren(createOwnerDeviceScreen(port,true).element);
  });
  await page.getByRole('button',{name:'リンクを発行',exact:true}).first().click();
  await page.waitForFunction(()=>Boolean(window.resolveOwner));
  await page.evaluate(()=>{window.invalidateOwner();window.resolveOwner();});
  await expect(page.getByRole('alert')).toContainText('本人・端末');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'リンクを発行',exact:true})).toHaveCount(0);
});

test('OWNER317-B06 有効期限を過ぎると平文表示を閉じ、新端末でも使用を拒否する',async({page})=>{
  await page.clock.install();await page.goto(route);
  await page.getByRole('button',{name:'リンクを発行',exact:true}).first().click();
  const link=await page.getByRole('textbox',{name:'追加端末リンク',exact:true}).inputValue();
  await page.clock.fastForward(900001);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'最新の状態を確認',exact:true}).click();
  await expect(page.getByRole('heading',{name:'期限切れ：スマートフォン（2台目）',exact:true})).toBeVisible();
  await issue(page);
  await page.getByRole('button',{name:'リンクを取り消す',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'取り消す',exact:true}).click();
  await expect(page.getByRole('heading',{name:'承認待ち端末：スマートフォン（2台目）',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:/：スマートフォン（2台目）$/})).toHaveCount(1);
  await page.getByRole('button',{name:'スマートフォン（2台目）',exact:true}).click();
  await page.getByLabel('受け取った追加端末リンク').fill(link);
  await page.getByRole('button',{name:'リンクを確認',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('このリンクは使えません');
});

test('OWNER317-B07 URLをコピーせず閉じても再発行でき、旧リンクは使えない', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('button', { name: 'リンクを発行', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  const urlField = dialog.getByRole('textbox', { name: '追加端末リンク', exact: true });
  const previousUrl = await urlField.inputValue();
  await expect(dialog.getByText('閉じると、このURLは再表示できません。')).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();

  const reissue = page.getByRole('button', { name: 'リンクを再発行', exact: true });
  await reissue.click();
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(reissue).toBeEnabled();
  await reissue.click();
  await expect(dialog.getByText('前のリンクは使えなくなります。')).toBeVisible();
  await dialog.getByRole('button', { name: '再発行する', exact: true }).click();
  const newUrl = await urlField.inputValue();
  expect(newUrl).not.toBe(previousUrl);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(reissue).toHaveCount(1);

  await page.getByRole('button', { name: 'スマートフォン（2台目）', exact: true }).click();
  const received = page.getByLabel('受け取った追加端末リンク');
  const verify = page.getByRole('button', { name: 'リンクを確認', exact: true });
  await received.fill(previousUrl);
  await verify.click();
  await expect(page.getByRole('alert')).toContainText('このリンクは使えません');
  await received.fill(newUrl);
  await verify.click();
  await expect(page.getByRole('dialog', { name: 'この端末を関連付けますか？' })).toBeVisible();
});

test('OWNER317-B08 旧リンクの取消し結果が不明なら再発行せず、状態の照会を案内する', async ({ page }) => {
  await page.goto('http://127.0.0.1:4181/tests/emulator/device-management-fixture.html');
  await page.waitForFunction(() => window.deviceFixtureReady === true);
  await page.evaluate(async () => {
    const { createOwnerDevicePreview } = await import('/src/app/owner-device-preview.ts');
    const { createOwnerDeviceScreen } = await import('/src/app/owner-device-screen.ts');
    const backend = createOwnerDevicePreview({ environmentId: crypto.randomUUID(), performanceId: crypto.randomUUID() });
    const { targets } = await backend.issuer.load();
    await backend.issuer.issue(targets[0], crypto.randomUUID());
    window.testIssueCount = 0;

    const port = {
      ...backend.issuer,
      // 取消し応答だけが失われた状態を作る。
      async cancel(id) {
        await backend.issuer.cancel(id);
        throw new Error('Cancel response lost');
      },
      // 照会前の発行要求を数える。
      async issue(...args) {
        window.testIssueCount++;
        return backend.issuer.issue(...args);
      },
    };
    document.body.replaceChildren(createOwnerDeviceScreen(port, true).element);
  });

  await page.getByRole('button', { name: 'リンクを再発行', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '再発行する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('最新の状態を確認してください。');
  expect(await page.evaluate(() => window.testIssueCount)).toBe(0);
  await expect(page.getByRole('button', { name: 'リンクを発行', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '最新の状態を確認', exact: true }).click();
  await expect(page.getByRole('button', { name: 'リンクを発行', exact: true }).first()).toBeEnabled();
});

test('OWNER317-B09 2台目を承認した後も3台目を別に追加できる', async ({ page }) => {
  await page.goto(route);
  const dialog = page.getByRole('dialog');
  const received = page.getByLabel('受け取った追加端末リンク');
  const verify = page.getByRole('button', { name: 'リンクを確認', exact: true });
  const oldDevice = page.getByRole('button', { name: '既存端末の見本', exact: true });
  const secondDevice = page.getByRole('button', { name: 'スマートフォン（2台目）', exact: true });
  const thirdDevice = page.getByRole('button', { name: 'タブレット（3台目）', exact: true });
  const secondUrl = await issue(page);

  await thirdDevice.click();
  await received.fill(secondUrl);
  await verify.click();
  await expect(page.getByRole('alert')).toContainText('この端末・公演で使えるリンク');
  await expect(dialog).toHaveCount(0);

  await secondDevice.click();
  await received.fill(secondUrl);
  await verify.click();
  await dialog.getByRole('button', { name: '関連付ける', exact: true }).click();
  await expect(page.getByRole('heading', { name: '関連付け済み', exact: true })).toBeVisible();

  await oldDevice.click();
  await expect(page.getByRole('heading', { name: '承認待ち端末：タブレット（3台目）' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'リンクを発行', exact: true })).toHaveCount(1);
  const thirdUrl = await issue(page);
  await thirdDevice.click();
  await received.fill(thirdUrl);
  await verify.click();
  await dialog.getByRole('button', { name: '関連付ける', exact: true }).click();
  await expect(page.getByRole('heading', { name: '関連付け済み', exact: true })).toBeVisible();

  await oldDevice.click();
  await expect(page.getByRole('heading', { name: /^関連付け済み：/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'リンクを発行', exact: true })).toHaveCount(0);
});
