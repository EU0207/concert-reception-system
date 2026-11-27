// 独立したAuth・保存領域の二端末を、追加端末画面と通常SDK・製品Rulesで関連付ける。
import {test,expect} from '@playwright/test';
import {setup} from './management-fixture.mjs';

/** 新しいブラウザーで同じ管理者をGoogle再認証し、通常の承認待ち登録を行う。 */
async function newOwner(browser,f) {
  const context=await browser.newContext(), page=await context.newPage();
  await page.goto('http://127.0.0.1:4181/tests/emulator/device-management-fixture.html');
  await page.waitForFunction(()=>window.deviceFixtureReady===true);
  const binding=await page.evaluate(async({settings,owner,ownerGoogle,scope})=>{
    const {createFirebasePrincipals,signInHumanPassword}=await import('/src/adapters/firebase/principals.ts');
    const {reauthenticateFictionalGoogle}=await import('/tests/emulator/sdk-fixture.mjs');
    const {createAuthorizationPort}=await import('/src/adapters/firebase/authorization-port.ts');
    window.ownerPrincipals=createFirebasePrincipals(settings,9291);
    await signInHumanPassword(window.ownerPrincipals,owner.email,owner.password);
    await reauthenticateFictionalGoogle(window.ownerPrincipals,ownerGoogle);
    window.ownerPort=await createAuthorizationPort(window.ownerPrincipals,scope,{emulatorDatabasePort:9100});
    const request=await window.ownerPort.registration.request(); await window.ownerPort.registration.bindHuman();
    return {...scope,humanUid:owner.uid,deviceUid:request.deviceUid,storageEpoch:request.storageEpoch};
  },{settings:f.settings,owner:f.owner,ownerGoogle:f.ownerGoogle,scope:f.scope});
  return {context,page,binding};
}

/** 同じSDKの発行元または新端末の操作を画面へ接続する。 */
async function mount(page,binding,mode,loss='') {
  await page.evaluate(async({binding,mode,loss})=>{
    const {createOwnerDeviceUiPort}=await import('/src/adapters/firebase/owner-device-ui-port.ts');
    const {createOwnerDeviceScreen}=await import('/src/app/owner-device-screen.ts');
    const sdk=mode==='issuer'?window.managementPort:window.ownerPort;
    const port=createOwnerDeviceUiPort(sdk,binding,mode);
    const originalLoad=port.load; window.ownerUiErrors=[];
    port.load=async()=>{try{return await originalLoad();}catch(cause){
      const code=String(cause?.code??'UNCLASSIFIED');window.ownerUiErrors.push(/^[A-Z0-9_/-]+$/i.test(code)?code:'REDACTED');throw cause;
    }};
    if(loss) {
      const original=port[loss]; let once=true;
      port[loss]=async(...args)=>{const result=await original(...args);if(once){once=false;throw Error('FICTIONAL_RESPONSE_LOSS');}return result;};
    }
    window.ownerUiPort=port;window.ownerScreen=createOwnerDeviceScreen(port);
    document.body.replaceChildren(window.ownerScreen.element);
  },{binding,mode,loss});
  await expect(page.getByRole('button',{name:'最新の状態を確認',exact:true})).toBeEnabled();
}

/** 保存済みの本人・匿名端末を復元し、読取り証跡だけから再開する。 */
async function reopen(f,receiver,loss='') {
  await receiver.page.reload(); await receiver.page.waitForFunction(()=>window.deviceFixtureReady===true);
  await receiver.page.evaluate(async({settings,binding})=>{
    const {createFirebasePrincipals}=await import('/src/adapters/firebase/principals.ts');
    const {createAuthorizationPort}=await import('/src/adapters/firebase/authorization-port.ts');
    window.ownerPrincipals=createFirebasePrincipals(settings,9291);
    await Promise.all([window.ownerPrincipals.humanAuth.authStateReady(),window.ownerPrincipals.deviceAuth.authStateReady()]);
    window.ownerPort=await createAuthorizationPort(window.ownerPrincipals,binding,{emulatorDatabasePort:9100});
  },{settings:f.settings,binding:receiver.binding});
  await mount(receiver.page,receiver.binding,'receiver',loss);
  await receiver.page.waitForFunction(()=>document.querySelector('.owner-device-card')||document.querySelector('[role="alert"]')?.textContent);
  const errors=await receiver.page.evaluate(()=>window.ownerUiErrors);
  if(errors.length){
    expect(errors).toEqual(['NETWORK_RECONFIRMATION_REQUIRED']);
    // 認証復元直後は実際の接続を待ち、利用者の再確認操作で取得し直す。製品の拒否は維持する。
    await receiver.page.evaluate(async()=>{
      const {getFictionalDeviceDatabase,ref,onValue}=await import('/tests/emulator/sdk-fixture.mjs');
      await new Promise((resolve,reject)=>{let stop;const timeout=setTimeout(()=>{stop?.();reject(Error('FICTIONAL_CONNECTION_TIMEOUT'));},5000);
        stop=onValue(ref(getFictionalDeviceDatabase(window.ownerPrincipals),'.info/connected'),value=>{
          if(value.val()===true){clearTimeout(timeout);queueMicrotask(()=>stop());resolve();}
        },reject);
      });
    });
    await receiver.page.getByRole('button',{name:'最新の状態を確認',exact:true}).click();
  }
}

test('OWNER317-S01 発行・読取り後に再起動して同じIDで承認し、平文を保存せず準備版も変更しない',async({page,browser})=>{
  const f=await setup(page,browser), receiver=await newOwner(browser,f);
  try{
    await mount(page,f.binding,'issuer');
    await page.getByRole('button',{name:'リンクを発行',exact:true}).click();
    const link=await page.getByRole('textbox',{name:'追加端末リンク',exact:true}).inputValue();
    await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).click();
    await mount(receiver.page,receiver.binding,'receiver');
    const targetUrl=new URL(receiver.page.url()), original=new URL(link);
    // 試験は配信入口のパスだけが製品と異なるため、同じ発行先のリンクを新端末へ渡す。
    targetUrl.search=original.search;targetUrl.hash=original.hash;
    await receiver.page.getByLabel('受け取った追加端末リンク').fill(targetUrl.href);
    await receiver.page.getByRole('button',{name:'リンクを確認',exact:true}).click();
    await expect(receiver.page.getByRole('dialog',{name:'この端末を関連付けますか？'})).toBeVisible();
    await reopen(f,receiver,'approve');
    await expect(receiver.page.getByRole('button',{name:'この端末を関連付ける',exact:true})).toBeVisible();
    await receiver.page.getByRole('button',{name:'この端末を関連付ける',exact:true}).click();
    await receiver.page.getByRole('dialog').getByRole('button',{name:'関連付ける',exact:true}).click();
    await expect(receiver.page.getByRole('alert')).not.toBeEmpty();
    await receiver.page.getByRole('button',{name:'最新の状態を確認',exact:true}).click();
    await expect(receiver.page.getByRole('heading',{name:'関連付け済み',exact:true})).toBeVisible();
    const stored=await(await fetch(f.root,{headers:{authorization:'Bearer owner'}})).json();
    const device=stored.devices[receiver.binding.deviceUid];
    expect(device.approved).toBe(true);expect(device.preparedRoleRevision).toBe(0);
    expect(device.storageEpoch).toBe(receiver.binding.storageEpoch);expect(stored.roles[f.owner.uid].revision).toBe(1);
    expect(Object.keys(stored.ownerDeviceLinkResults)).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(original.hash.split('=')[1]);
    const fixed=await page.evaluate(async(binding)=>{
      const {createAuthorizationOperationJournal}=await import('/src/storage/authorization-operations.ts');
      const journal=createAuthorizationOperationJournal(binding),access=()=>{};
      const ids=await journal.list(access);return Promise.all(ids.map(id=>journal.read(id,access)));
    },f.binding);
    expect(JSON.stringify(fixed)).not.toContain(original.hash.split('=')[1]);
  } finally {await receiver.context.close();await f.other.close();}
});

test('OWNER317-S02 発行の応答喪失から照会・取消しし、他端末の読取りと取消し済みリンクを拒否する',async({page,browser})=>{
  const f=await setup(page,browser),receiver=await newOwner(browser,f);
  try{
    await mount(page,f.binding,'issuer','issue');
    await page.getByRole('button',{name:'リンクを発行',exact:true}).click();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await page.getByRole('button',{name:'最新の状態を確認',exact:true}).click();
    await expect(page.getByRole('button',{name:'リンクを発行',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'リンクを取り消す',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'取り消す',exact:true}).click();
    await expect(page.getByRole('button',{name:'リンクを発行',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'リンクを発行',exact:true}).click();
    const link=await page.getByRole('textbox',{name:'追加端末リンク',exact:true}).inputValue(),token=new URL(link).hash.split('=')[1];
    const denied=await f.target.evaluate(async token=>{
      try{await window.staffPort.ownerDeviceLinks.readToken(token);return false;}catch{return true;}
    },token);
    expect(denied).toBe(true);
    await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).click();
    await page.getByRole('button',{name:'リンクを取り消す',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'取り消す',exact:true}).click();
    expect(await receiver.page.evaluate(async token=>{
      try{await window.ownerPort.ownerDeviceLinks.readToken(token);return false;}catch{return true;}
    },token)).toBe(true);
    const stored=await(await fetch(f.root,{headers:{authorization:'Bearer owner'}})).json();
    expect(stored.devices[receiver.binding.deviceUid].approved).toBe(false);
    expect(Object.keys(stored.ownerDeviceLinkIssues)).toHaveLength(2);
    expect(stored.ownerDeviceLinkResults??null).toBe(null);
  }finally{await receiver.context.close();await f.other.close();}
});
