import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {appCheckTrial} from './app-check.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const entries=['app-check-test.mjs','app-check.mjs','remote.mjs','generate.mjs'];
const before=sourceHashes(new URL('./',import.meta.url),entries);
const reports=[];
async function scenario(id,{apiState='ENABLED',mode='OFF',failAt}={}){
  const original={apiState,mode},server={apiState,mode,debug:[{name:'projects/1234/apps/1:1234:web:abcd/debugTokens/existing',displayName:'existing'}]};
  const state={projectId:'crs-authcheck-20261013-abcd',sdkConfig:{appId:'1:1234:web:abcd',apiKey:'fake-web-api-key'},trial:{}};
  let secret,calls=0,failed=false,managementCalls=0;const markerNames=[];
  const management=async(url,options={})=>{
    managementCalls++;
    if(options.pollOperation)return{body:{done:true}};
    if(url.startsWith('https://firebase.googleapis.com/'))return{body:{projectNumber:failAt==='foreign-project'?'999':1234}};
    if(url.endsWith(':enable')){server.apiState='ENABLED';if(failAt==='enable'&&!failed){failed=true;throw Error('injected-enable-response-loss');}return{body:{done:true}};}
    if(url.endsWith(':disable')){server.apiState='DISABLED';return{body:{done:true}};}
    assert(url.startsWith('https://serviceusage.googleapis.com/'));return{body:{state:server.apiState}};
  };
  const fetcher=async(input,options)=>{
    const url=new URL(input);assert.equal(url.origin,'https://firebaseappcheck.googleapis.com');
    
    const exchange=url.pathname.endsWith(':exchangeDebugToken');
    if(exchange){assert.equal(url.searchParams.get('key'),'fake-web-api-key');assert.equal(options.headers.authorization,undefined);
      assert.equal(url.pathname,'/v1/projects/crs-authcheck-20261013-abcd/apps/1:1234:web:abcd:exchangeDebugToken');}
    else{assert.equal(url.searchParams.get('key'),null);assert.equal(options.headers.authorization,'Bearer fake-owner');}
    const body=options.body?JSON.parse(options.body):null;let value={};
    if(url.pathname.endsWith('/services/firebasedatabase.googleapis.com')){
      if(options.method==='PATCH'){server.mode=body.enforcementMode;
        if(failAt==='enforcement'&&!failed){failed=true;throw Error('injected-enforcement-response-loss');}}
      value={enforcementMode:server.mode};
    }else if(url.pathname.endsWith(':exchangeDebugToken')){
      
      assert.deepEqual(Object.keys(body),['debug_token']);assert.equal(body.debug_token,secret);
      if(failAt==='exchange-401')return{status:401,json:async()=>({error:{status:'UNAUTHENTICATED'}})};
      value={token:'fake-issued-'+randomUUID(),ttl:'3600s'};
    }else if(url.pathname.endsWith('/debugTokens')&&options.method==='POST'){
      secret=body.token;assert(!JSON.stringify(state).includes(secret));
      const created={name:'projects/1234/apps/1:1234:web:abcd/debugTokens/'+randomUUID(),displayName:body.displayName};
      markerNames.push(created.name);server.debug.push(created);value={...created,token:secret};
      if(failAt==='create'&&!failed){failed=true;throw Error('injected-create-response-loss');}
    }else if(options.method==='DELETE')server.debug=server.debug.filter(x=>'/v1/'+x.name!==url.pathname);
    else value={debugTokens:structuredClone(server.debug)};
    return{status:200,json:async()=>value};
  };
  const trial=await appCheckTrial({state,persist:()=>{},management,count:()=>calls++,bodyMeter:()=>{},fetcher,ownerToken:'fake-owner'});
  if(failAt)await assert.rejects(()=>trial.prepare());else{await trial.prepare();assert.equal(server.mode,'ENFORCED');assert(await trial.token());}
  const result=await trial.restore();
  assert(result.enforcementRestored&&result.debugTokensRemoved&&result.apiStateRestored);
  assert.deepEqual({apiState:server.apiState,mode:server.mode},original);
  assert.equal(server.debug.length,1);assert.equal(server.debug[0].displayName,'existing');
  if(secret)assert(!JSON.stringify(state).includes(secret));
  reports.push({id,adminCalls:calls,managementCalls,settingsRestored:true,existingDebugTokenPreserved:true,
    ownTokenRemoved:markerNames.every(n=>!server.debug.some(x=>x.name===n)),secretsNotPersisted:true});
}
await scenario('enabled-off');await scenario('enabled-unenforced',{mode:'UNENFORCED'});
await scenario('enabled-enforced',{mode:'ENFORCED'});await scenario('disabled-api',{apiState:'DISABLED'});
await scenario('lost-debug-create-response',{failAt:'create'});
await scenario('lost-enforcement-response',{failAt:'enforcement'});
await scenario('lost-enable-response',{apiState:'DISABLED',failAt:'enable'});
await scenario('foreign-project-number',{failAt:'foreign-project'});await scenario('exchange-401-restored',{failAt:'exchange-401'});
const remote=fileURLToPath(new URL('remote.mjs',import.meta.url));
const plan=spawnSync(process.execPath,[remote,'--plan'],{encoding:'utf8'});assert.equal(plan.status,0);
const scope=JSON.parse(plan.stdout);assert.equal(scope.decisionId,'TECH-DD91-114');assert.equal(scope.externalRequestsExecuted,0);
assert.equal(scope.maxApplicationCallsIncludingCleanup,600);assert.equal(scope.cleanupCallReserve,80);
for(const flag of ['--unapproved','--plan-diagnostic','--run-approved-other']){
  assert.notEqual(spawnSync(process.execPath,[remote,flag],{encoding:'utf8'}).status,0);
}
reports.push({id:'plan-and-unapproved-flags',planRequests:0,unapprovedFlagsRejected:3});
const hashes=sourceHashes(new URL('./',import.meta.url),entries);assert.deepEqual(before,hashes);
fs.writeFileSync(new URL('artifacts/app-check-plan-test-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes,
  reports,mockedControlPlane:true,actualAppCheckEnforcementVerified:false,externalRequestsExecuted:0},null,2)+'\n');
console.log(JSON.stringify({httpContractVerified:true,mockAndGuardCases:reports.length,externalRequestsExecuted:0,actualAppCheckEnforcementVerified:false}));
