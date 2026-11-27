// 管理者の追加端末を、発行・新端末での確認と結果回収までPC・スマートフォン幅で確認する。
import {test,expect} from '@playwright/test';
const route='/#/events/00000000-0000-4000-8000-000000000001/owner-devices';

/** 見本で発行したリンクを取得し、平文の表示を閉じる。 */
async function issue(page) {
  await page.getByRole('button',{name:'リンクを発行',exact:true}).click();
  const link=await page.getByRole('textbox',{name:'追加端末リンク',exact:true}).inputValue();
  await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).click();
  return link;
}

test('OWNER317-B01 発行・確認・関連付けし、承認をデータ準備完了と表示しない',async({page})=>{
  await page.goto(route); const link=await issue(page);
  await expect(page.getByRole('textbox',{name:'追加端末リンク',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'リンクを発行',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'新しい端末の見本',exact:true}).click();
  await page.getByLabel('受け取った追加端末リンク').fill(link);
  await page.getByRole('button',{name:'リンクを確認',exact:true}).click();
  await expect(page.getByLabel('受け取った追加端末リンク')).toHaveValue('');
  await page.getByRole('button',{name:'この端末を関連付ける',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'キャンセル',exact:true}).click();
  await expect(page.getByRole('heading',{name:'関連付け済み',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'この端末を関連付ける',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'関連付ける',exact:true}).click();
  await expect(page.getByRole('heading',{name:'関連付け済み',exact:true})).toBeVisible();
  await expect(page.getByText('受付の前に、この端末のデータ準備が必要です。')).toBeVisible();
  await page.getByRole('button',{name:'既存端末の見本',exact:true}).click();
  await expect(page.getByRole('heading',{name:/関連付け済み/})).toBeVisible();
});

test('OWNER317-B02 取消し確認後のリンクと、他公演のリンクを新端末で拒否する',async({page})=>{
  await page.goto(route); const link=await issue(page);
  await page.getByRole('button',{name:'リンクを取り消す',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'取り消す',exact:true}).click();
  await expect(page.getByRole('button',{name:'リンクを発行',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'新しい端末の見本',exact:true}).click();
  for(const value of [link.replace('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),link]){
    await page.getByLabel('受け取った追加端末リンク').fill(value);
    await page.getByRole('button',{name:'リンクを確認',exact:true}).click();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.getByRole('alert')).toHaveCSS('color','rgb(161, 38, 34)');
    await expect(page.getByLabel('受け取った追加端末リンク')).toHaveValue('');
    await expect(page.getByRole('button',{name:'この端末を関連付ける',exact:true})).toHaveCount(0);
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
  await page.getByRole('button',{name:'リンクを発行',exact:true}).click();
  await page.waitForFunction(()=>Boolean(window.resolveOwner));
  await page.evaluate(()=>{window.invalidateOwner();window.resolveOwner();});
  await expect(page.getByRole('alert')).toContainText('本人・端末');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'リンクを発行',exact:true})).toHaveCount(0);
});

test('OWNER317-B06 有効期限を過ぎると平文表示を閉じ、新端末でも使用を拒否する',async({page})=>{
  await page.clock.install();await page.goto(route);
  await page.getByRole('button',{name:'リンクを発行',exact:true}).click();
  const link=await page.getByRole('textbox',{name:'追加端末リンク',exact:true}).inputValue();
  await page.clock.fastForward(900001);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'新しい端末の見本',exact:true}).click();
  await page.getByLabel('受け取った追加端末リンク').fill(link);
  await page.getByRole('button',{name:'リンクを確認',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('利用できません');
});
