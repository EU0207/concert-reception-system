import {sourceHashes} from '../GD91-105/source-audit.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {restoreTrial} from './restore.mjs';
import {appCheckTrial} from '../GD91-125/app-check.mjs';
const deny={rules:{'.read':false,'.write':false}},project='crs-authcheck-20261013-0000';
const configUrl='https://identitytoolkit.googleapis.com/admin/v2/projects/'+project+'/config';
const googleUrl=configUrl+'/google';
const source=sourceHashes(new URL('./',import.meta.url),['restore-check.mjs']);let checks=0;
function fixture(fail){
 const trial={preflightOwnedAndEmpty:true,rulesChangeAttempted:true,authChangeAttempted:true,rtdbRoots:['owned/source','owned/target'],users:['a','b'],previousAnonymous:false,previousGoogleEnabled:false,previousAuthorizedDomains:['localhost']};
 const state={trial},users=new Set(['a','b']),roots=new Set(trial.rtdbRoots),attempted=new Set();
 let rules={rules:{'.read':true}},anonymous=true,google=true,failed=false;
 const attempt=name=>{attempted.add(name);if(fail===name&&!failed){failed=true;throw Error('injected');}};
 return{state,project,configUrl,googleUrl,deny,persist:()=>{},attempted,users,roots,
  appCheck:{restore:async()=>{attempt('appCheck');return{enforcementRestored:true,debugTokensRemoved:true,apiStateRestored:true};}},
  owned:async(p,m='GET',body)=>{attempt('rules-or-roots');if(p==='.settings/rules'){if(m==='PUT')rules=body;return rules;}if(p==='')return roots.size?{}:null;if(m==='DELETE')roots.delete(p);return roots.has(p)?{}:null;},
  api:async(url,o={})=>{
   if(url.includes('accounts:batchGet')){attempt('users');return{body:{users:[...users].map(localId=>({localId}))}};}
   if(url.includes('accounts:delete')){users.delete(o.body.localId);return{body:{}};}
   if(url===configUrl||url.startsWith(configUrl+'?')){attempt('settings');if(o.method==='PATCH')anonymous=o.body.signIn.anonymous.enabled;return{body:{signIn:{anonymous:{enabled:anonymous}},authorizedDomains:['localhost']}};}
   if(url===googleUrl||url.startsWith(googleUrl+'?')){if(o.method==='PATCH')google=o.body.enabled;return{body:{enabled:google}};}
   if(url.includes('billingInfo')){attempt('billing');return{body:{billingEnabled:false}};}
   throw Error('unexpected-mock-endpoint');
  }
 };
}
for(const fail of [null,'appCheck','rules-or-roots','users','settings','billing']){
 const f=fixture(fail),r=await restoreTrial(f);
 assert.equal(r.complete,!fail);for(const name of ['appCheck','rules-or-roots','users','settings','billing'])assert(f.attempted.has(name));
 if(fail){const again=await restoreTrial(f);assert(again.complete);}
 assert.equal(f.users.size,0);assert.equal(f.roots.size,0);checks++;
}
{
 const f=fixture();f.users.delete('a');f.state.trial.deletedUsers=[];
 const r=await restoreTrial(f);assert(r.complete);assert.equal(f.users.size,0);checks++;
}
{
 const f=fixture();f.users.add('unowned');const r=await restoreTrial(f);assert(!r.complete);assert(f.users.has('unowned'));assert.equal(f.users.size,3);assert(r.authSettingsRestored&&r.billingUnlinked);checks++;
}
// 既存App Check helperを実通信なしで呼び、設定変更後の途中失敗でも復元する。
for(const failExchange of [false,true]){
 const state={projectId:project,sdkConfig:{appId:'1:100:web:abcdef',apiKey:'fake-public-key'},trial:{}};
 let apiState='DISABLED',mode='OFF',tokens=[];const service='projects/100/services/firebasedatabase.googleapis.com';
 const management=async(url,o={})=>{
  if(url.includes('firebase.googleapis.com'))return{body:{projectNumber:'100'}};
  if(url.endsWith(':enable'))apiState='ENABLED';else if(url.endsWith(':disable'))apiState='DISABLED';
  return{body:{state:apiState}};
 };
 const fetcher=async(url,o={})=>{
  const u=new URL(url);if(u.pathname.endsWith(':exchangeDebugToken'))return new Response(JSON.stringify(failExchange?{error:{status:'DENIED'}}:{token:'fake-attestation',ttl:'3600s'}),{status:failExchange?401:200});
  const body=o.body?JSON.parse(o.body):null;
  if(u.pathname.endsWith('/debugTokens')&&o.method==='POST'){const name='projects/100/apps/1:100:web:abcdef/debugTokens/one';tokens.push({name,displayName:body.displayName});return new Response(JSON.stringify({name}));}
  if(u.pathname.endsWith('/debugTokens'))return new Response(JSON.stringify({debugTokens:tokens}));
  if(u.pathname.endsWith('/debugTokens/one')&&o.method==='DELETE'){tokens=[];return new Response('{}');}
  if(u.pathname.endsWith('/services/firebasedatabase.googleapis.com')){if(o.method==='PATCH')mode=body.enforcementMode;return new Response(JSON.stringify({name:service,enforcementMode:mode}));}
  throw Error('unexpected-appcheck-mock-endpoint');
 };
 const a=await appCheckTrial({state,persist:()=>{},management,count:()=>{},bodyMeter:()=>{},ownerToken:'fake-owner-token',fetcher});
 if(failExchange)await assert.rejects(()=>a.prepare(),e=>e.httpStatus===401);else await a.prepare();
 assert(!JSON.stringify(state).includes('fake-attestation'));const restored=await a.restore();assert(Object.values(restored).every(v=>v));
 assert.equal(apiState,'DISABLED');assert.equal(mode,'OFF');assert.equal(tokens.length,0);checks++;
}
const result={sourceHashes:source,endSourceHashes:sourceHashes(new URL('./',import.meta.url),['restore-check.mjs']),checks,externalRequestsExecuted:0,independentCleanupContinuedAfterFailure:true,recoveryOnlyIdempotenceVerified:true,unownedAuthUserPreserved:true,appCheckSuccessAndExchangeFailureRestored:true};
fs.writeFileSync(new URL('artifacts/restore-check-summary.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
