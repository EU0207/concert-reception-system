import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';

// この関数は承認済み実行の分岐からだけ呼ぶ。import・--planでは認証も通信もしない。
export async function appCheckTrial({state,persist,management,count,bodyMeter,fetcher=fetch,ownerToken}){
  assert(/^crs-authcheck-20261013-[a-f0-9]{4}$/.test(state.projectId));
  const appId=state.sdkConfig.appId;assert(/^1:\d+:web:[a-f0-9]+$/.test(appId));
  const projectNumber=appId.split(':')[1],project='projects/'+projectNumber;
  const app=project+'/apps/'+appId,service=project+'/services/firebasedatabase.googleapis.com';
  const api='https://firebaseappcheck.googleapis.com/v1/';
  const serviceUsage='https://serviceusage.googleapis.com/v1/'+project+'/services/firebaseappcheck.googleapis.com';
  const journal=state.trial.appCheck??={marker:'GD91-123-'+randomUUID(),previousDebugNames:[]};persist();
  let accessToken=ownerToken,debugSecret,credential;
  async function admin(resource,{method='GET',body,allowed=[200]}={}){
    const path=resource.split('?')[0];
    assert(path===service||path===app+'/debugTokens'||path.startsWith(app+'/debugTokens/')||path===app+':exchangeDebugToken');
    assert(!resource.includes('..'));
    if(!accessToken){const require=createRequire(import.meta.url),auth=require('../POC-004/node_modules/firebase-tools/lib/auth.js');
      const account=auth.getGlobalDefaultAccount();accessToken=(await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform'])).access_token;}
    count();if(body!==undefined)bodyMeter(body);
    const r=await fetcher(api+resource,{method,headers:{authorization:'Bearer '+accessToken,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
    const value=await r.json().catch(()=>({}));bodyMeter(value);
    if(!allowed.includes(r.status))throw Object.assign(new Error('app-check-api-rejected'),{httpStatus:r.status,apiCode:value.error?.status??'unknown'});
    return{status:r.status,body:value};
  }
  async function serviceChange(suffix){
    const r=await management(serviceUsage+suffix,{method:'POST',body:suffix===':disable'?{disableDependentServices:false}:{}});
    if(r.body.name&&!r.body.done)await management('https://serviceusage.googleapis.com/v1/'+r.body.name,{pollOperation:true});
  }
  async function token(){
    if(credential&&credential.expiresAt>Date.now()+300000)return credential.token;
    assert(debugSecret,'debug-secret-not-in-memory');
    const r=await admin(app+':exchangeDebugToken',{method:'POST',body:{debugToken:debugSecret}});
    assert(typeof r.body.token==='string'&&r.body.token.length>0);
    const ttl=Number(String(r.body.ttl).replace(/s$/,''));assert(Number.isFinite(ttl)&&ttl>=300);
    credential={token:r.body.token,expiresAt:Date.now()+ttl*1000};return credential.token;
  }
  async function prepare(){
    const metadata=(await management('https://firebase.googleapis.com/v1beta1/projects/'+state.projectId)).body;
    assert.equal(String(metadata.projectNumber),projectNumber,'project-number-mismatch');
    journal.previousApiState=(await management(serviceUsage)).body.state;persist();
    assert(['ENABLED','DISABLED'].includes(journal.previousApiState));
    if(journal.previousApiState==='DISABLED'){journal.apiEnableAttempted=true;persist();await serviceChange(':enable');}
    journal.previousMode=(await admin(service)).body.enforcementMode??'OFF';persist();
    assert(['OFF','UNENFORCED','ENFORCED'].includes(journal.previousMode));
    const debug=(await admin(app+'/debugTokens')).body.debugTokens??[];
    assert(debug.length<20,'debug-token-capacity');journal.previousDebugNames=debug.map(x=>x.name);persist();
    debugSecret=randomUUID();journal.debugCreateAttempted=true;persist();
    const created=(await admin(app+'/debugTokens',{method:'POST',body:{displayName:journal.marker,token:debugSecret}})).body;
    assert(created.name?.startsWith(app+'/debugTokens/'));journal.debugName=created.name;persist();
    await token();journal.enforcementChangeAttempted=true;persist();
    await admin(service+'?updateMask=enforcementMode',{method:'PATCH',body:{name:service,enforcementMode:'ENFORCED'}});
  }
  async function restore(){
    const result={enforcementRestored:false,debugTokensRemoved:false,apiStateRestored:false};
    if(journal.enforcementChangeAttempted){
      await admin(service+'?updateMask=enforcementMode',{method:'PATCH',body:{name:service,enforcementMode:journal.previousMode}});
      assert.equal((await admin(service)).body.enforcementMode??'OFF',journal.previousMode);
    }
    result.enforcementRestored=true;
    if(journal.debugCreateAttempted){
      const created=(await admin(app+'/debugTokens')).body.debugTokens??[];
      for(const item of created.filter(x=>x.displayName===journal.marker&&!journal.previousDebugNames.includes(x.name))){
        assert(item.name.startsWith(app+'/debugTokens/'));await admin(item.name,{method:'DELETE',allowed:[200,204]});
      }
      const remaining=(await admin(app+'/debugTokens')).body.debugTokens??[];
      assert(!remaining.some(x=>x.displayName===journal.marker&&!journal.previousDebugNames.includes(x.name)));
    }
    result.debugTokensRemoved=true;
    if(journal.apiEnableAttempted)await serviceChange(':disable');
    if(journal.previousApiState)assert.equal((await management(serviceUsage)).body.state,journal.previousApiState);
    result.apiStateRestored=true;debugSecret=undefined;credential=undefined;return result;
  }
  return{prepare,restore,token,expiresAt:()=>credential?.expiresAt??0};
}
