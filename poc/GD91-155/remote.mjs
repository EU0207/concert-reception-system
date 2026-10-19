import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scope} from './scope.mjs';
import {meter} from './meter.mjs';
import {generated} from './rules.mjs';
import {runCases} from './cases.mjs';
import {hash} from '../GD91-128/conversion.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {appCheckTrial} from '../GD91-125/app-check.mjs';
import {startGoogleLogin} from '../GD91-86/google-login-server.mjs';
import {failureDiagnostic} from '../GD91-111/failure-diagnostic.mjs';
import {restoreTrial} from './restore.mjs';

const mode=process.argv[2],root=new URL('./',import.meta.url);
if(mode==='--plan'){
 console.log(JSON.stringify({...scope,developerApprovalRequired:true,approvalRecorded:false,externalRequestsExecuted:0}));
 process.exit(0);
}
assert(['--run-approved-119','--cleanup-only'].includes(mode),'explicit-119-approval-required');
const recovery=mode==='--cleanup-only';
const configFile=new URL('../GD91-80/firebase-client-config.local.json',root);
const journalFile=new URL('node_modules/.cache/trial.local.json',root);
for(const file of [configFile,journalFile]){
 execFileSync('git',['check-ignore','-q',fileURLToPath(file)],{windowsHide:true,stdio:'pipe'});
 assert.equal(execFileSync('git',['ls-files','--',fileURLToPath(file)],{windowsHide:true,encoding:'utf8'}).trim(),'');
}
if(!recovery){
 execFileSync(process.execPath,[fileURLToPath(new URL('audit.mjs',root))],{windowsHide:true,stdio:'pipe'});
 assert(!fs.existsSync(new URL('artifacts/remote-summary.json',root)),'119-trial-already-finished');
 assert(!fs.existsSync(journalFile),'119-journal-already-exists');
}
let state=JSON.parse(fs.readFileSync(configFile,'utf8'));
assert.equal(state.purpose,'GD91-80');assert(state.createdByThisRun&&state.ownerVerified&&state.billingVerifiedUnlinked);
assert(/^crs-authcheck-20261013-[a-f0-9]{4}$/.test(state.projectId));assert.equal(state.sdkConfig.projectId,state.projectId);
const fixtureSummary=JSON.parse(fs.readFileSync(new URL('artifacts/source-fixture-summary.json',root)));
const fixture=recovery?null:JSON.parse(fs.readFileSync(new URL('node_modules/.cache/source-fixture.json',root)));
if(!recovery)assert.equal(hash(fixture),fixtureSummary.fixtureHash);
const project=state.projectId,number=state.sdkConfig.appId.split(':')[1];
const db='https://'+project+'-default-rtdb.asia-southeast1.firebasedatabase.app';
const environment={source:'gd155-source-'+randomUUID(),target:'gd155-target-'+randomUUID()};
let journal=recovery?JSON.parse(fs.readFileSync(journalFile,'utf8')):{
 purpose:'GD91-155',authorization:'TECH-DD91-119-A',phase:'preflight',
 environments:environment,performanceId:fixtureSummary.performanceId,
 rtdbRoots:Object.values(environment).map(e=>'environments/'+e+'/performances/'+fixtureSummary.performanceId),users:[],progress:[]
};
assert.equal(journal.purpose,'GD91-155');assert.equal(journal.authorization,'TECH-DD91-119-A');
assert.equal(journal.performanceId,fixtureSummary.performanceId);
assert(journal.rtdbRoots.length===2&&journal.rtdbRoots.every(p=>/^environments\/gd155-(source|target)-[a-f0-9-]{36}\/performances\/[a-f0-9-]{36}$/.test(p)));
if(recovery){assert.equal(state.trial?.purpose,'GD91-155');assert.equal(state.trial?.authorization,journal.authorization);assert.deepEqual(state.trial.rtdbRoots,journal.rtdbRoots);}
else assert(!state.trial,'unresolved-previous-trial');
state.trial=journal;
let c,b,appCheck,bridge,timer,result,failure,cleanup;
const originalFetch=globalThis.fetch;
function persist(){
 if(b)journal.observed=b.snapshot();
 state.trial=journal;fs.mkdirSync(new URL('node_modules/.cache/',root),{recursive:true});
 // 独立台帳を先に保存し、共通context側の設定保存で呼出し計測を失わない。
 writeLocal(journalFile,journal);writeLocal(configFile,state);
}
function writeLocal(file,value){const temporary=fileURLToPath(file)+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');fs.renameSync(temporary,fileURLToPath(file));}
persist();
const endpoints=new Set(['cloudresourcemanager.googleapis.com','cloudbilling.googleapis.com','firebase.googleapis.com','identitytoolkit.googleapis.com','serviceusage.googleapis.com','firebasedatabase.googleapis.com','firebaseappcheck.googleapis.com']);
b=meter({fetcher:originalFetch,allow:u=>u.protocol==='https:'&&(u.origin===db||endpoints.has(u.hostname)),
 maxCalls:scope.maxApplicationCallsIncludingCleanup-scope.manualLoginApiCallReservation,
 normalCallLimit:scope.maxApplicationCallsIncludingCleanup-scope.manualLoginApiCallReservation-scope.cleanupCallReserve,
 maxBodyBytes:scope.maxObservedRequestAndResponseBodyBytes-scope.externalSetupBodyReservationBytes,onRequest:persist,onProgress:persist});
if(recovery){
 const observed=journal.observed??{};
 for(const k of ['requests','requestBodyBytes','responseBodyBytes']){assert(Number.isSafeInteger(observed[k])&&observed[k]>=0);b.state[k]=observed[k];}
 b.state.groups={...observed.groups};b.cleanup();
}
globalThis.fetch=b.fetch;
const files=['remote.mjs','restore.mjs','rules.mjs','cases.mjs','post-publish.mjs','importer.mjs','scope.mjs','meter.mjs','../GD91-125/app-check.mjs','../GD91-82/remote-support.mjs','../GD91-86/google-login-server.mjs','../GD91-86/google-login.mjs','../GD91-86/google-login.html'];
const before=sourceHashes(root,files);
const configUrl='https://identitytoolkit.googleapis.com/admin/v2/projects/'+project+'/config';
const googleUrl='https://identitytoolkit.googleapis.com/admin/v2/projects/'+project+'/defaultSupportedIdpConfigs/google.com';
const deny={rules:{'.read':false,'.write':false}};
const api=(url,options)=>c.api(url,options);
async function owned(path,method='GET',body){
 assert(path==='.settings/rules'||path===''&&method==='GET'||journal.rtdbRoots.some(p=>path===p||path.startsWith(p+'/')),'outside-owned-trial');
 const u=new URL(db+'/'+path+'.json');if(method!=='GET')u.searchParams.set('print','silent');if(path==='')u.searchParams.set('shallow','true');
 return(await c.request(u.href,{method,body,allowed:[200,204]})).body;
}
async function normal(f,which,path='',method='GET',body,attestation='valid'){
 assert(['source','target'].includes(which));assert(!path.startsWith('/')&&!path.includes('..'));
 const prefix='environments/'+journal.environments[which]+'/performances/'+journal.performanceId;
 const u=new URL(db+'/'+prefix+(path?'/'+path:'')+'.json');u.searchParams.set('auth',f.device.token);
 if(attestation!=='missing')u.searchParams.set('ac',attestation==='invalid'?'invalid-attestation':await appCheck.token());
 if(method!=='GET')u.searchParams.set('print','silent');
 const r=await fetch(u,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const text=await r.text();return{status:r.status,body:text?JSON.parse(text):null};
}
async function normalAuth(action,body){
 assert(['signUp','lookup'].includes(action));const u=new URL('https://identitytoolkit.googleapis.com/v1/accounts:'+action);u.searchParams.set('key',state.sdkConfig.apiKey);
 const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 if(r.status!==200)throw Object.assign(Error('auth-request-failed'),{httpStatus:r.status});return r.json();
}
function recordUser(uid){assert(typeof uid==='string'&&uid.length>0);if(!journal.users.includes(uid))journal.users.push(uid);persist();assert(journal.users.length<=scope.maxAuthUsers);}
const claims=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
async function lookup(token){
 const response=await normalAuth('lookup',{idToken:token});assert.equal(response.users?.length,1);
 const user=response.users[0],data=claims(token);assert.equal(data.aud,project);assert.equal(data.iss,'https://securetoken.google.com/'+project);assert.equal(data.sub,user.localId);
 recordUser(user.localId);assert.equal(data.firebase?.sign_in_provider,'google.com');assert.equal(data.email_verified,true);assert.equal(user.emailVerified,true);
 assert(user.providerUserInfo?.some(p=>p.providerId==='google.com'));assert(data.exp*1000>Date.now());assert(Number.isSafeInteger(data.auth_time));
 return{uid:user.localId,token,claims:data};
}
try{
 const {remoteContext}=await import('../GD91-82/remote-support.mjs');c=await remoteContext();state=c.state;state.trial=journal;persist();assert.equal(state.gd82DatabaseUrl,db);
 if(!recovery){
  assert.deepEqual(await owned('.settings/rules'),deny,'preflight-rules-must-be-deny');assert.equal(await owned(''),null,'preflight-root-must-be-empty');
  assert.equal(((await api('https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:batchGet?maxResults=10')).body.users??[]).length,0);
  journal.preflightOwnedAndEmpty=true;const config=(await api(configUrl)).body;
  journal.previousAnonymous=config.signIn?.anonymous?.enabled??false;journal.previousAuthorizedDomains=config.authorizedDomains??[];
  journal.previousGoogleEnabled=(await api(googleUrl)).body.enabled??false;persist();
 }
 appCheck=await appCheckTrial({state,persist,count:()=>{},bodyMeter:()=>{},management:async(url,options={})=>{
  if(!options.pollOperation)return api(url,options);
  for(let i=0;i<20;i++){const r=await api(url);if(r.body.done){assert(!r.body.error);return r;}await new Promise(r=>setTimeout(r,2000));}
  throw Error('service-operation-deadline');
 }});
 if(!recovery){
  await appCheck.prepare();journal.authChangeAttempted=true;persist();
  await api(configUrl+'?updateMask=signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{anonymous:{enabled:true}}}});
  await api(googleUrl+'?updateMask=enabled',{method:'PATCH',body:{enabled:true}});
  journal.rulesChangeAttempted=true;persist();await owned('.settings/rules','PUT',generated());journal.rulesAccepted=true;persist();
  const loginConfig={...state.sdkConfig,authDomain:project+'.firebaseapp.com'};
  assert(journal.previousAuthorizedDomains.includes('localhost')&&journal.previousAuthorizedDomains.includes(loginConfig.authDomain));
  journal.phase='awaiting-google-login';persist();
  bridge=await startGoogleLogin(loginConfig,{onBegin:async()=>{journal.manualLoginBegun=true;persist();},onToken:lookup});
  console.log(JSON.stringify({phase:'awaiting-google-login',url:bridge.url,decisionId:scope.decisionId}));
  const human=await Promise.race([bridge.result,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('login-deadline')),1200000);})]);
  clearTimeout(timer);await bridge.close();bridge=null;journal.phase='running';persist();
  const io={performanceId:journal.performanceId,sourceEnvironment:journal.environments.source,
   anonymous:async()=>{assert(journal.users.length<scope.maxAuthUsers);const a=await normalAuth('signUp',{returnSecureToken:true});recordUser(a.localId);const data=claims(a.idToken);assert.equal(data.aud,project);assert.equal(data.firebase.sign_in_provider,'anonymous');return{uid:a.localId,token:a.idToken,claims:data};},
   owner:(which,path='',method='GET',body)=>{assert(['source','target'].includes(which));assert(!path.startsWith('/')&&!path.includes('..'));return owned('environments/'+journal.environments[which]+'/performances/'+journal.performanceId+(path?'/'+path:''),method,body);},normal,
   report:r=>{journal.progress.push(r);b.phase(r.id);persist();console.log(JSON.stringify({id:r.id,passed:r.passed,requests:b.state.requests}));},
   attestationGate:async f=>{
    let observed=false,rounds=0;for(;rounds<scope.propagationRoundsAtMost;rounds++){
     const valid=await normal(f,'target','control'),missing=await normal(f,'target','control','GET',undefined,'missing'),invalid=await normal(f,'target','control','GET',undefined,'invalid');
     assert.equal(valid.status,200);if([401,403].includes(missing.status)&&[401,403].includes(invalid.status)){observed=true;break;}
     assert([200,401,403].includes(missing.status)&&[200,401,403].includes(invalid.status));
     if(rounds+1<scope.propagationRoundsAtMost)await new Promise(r=>setTimeout(r,scope.propagationIntervalMillis));
    }
    assert(observed,'app-check-enforcement-not-observed');assert([401,403].includes((await normal({device:{token:'invalid-auth'}},'target','control')).status));
    journal.appCheckGate={validAccepted:true,missingAndInvalidDenied:true,invalidAuthDenied:true,propagationRounds:rounds+1};persist();
   }
  };
  result=await runCases(io,fixture,human);
 }
}catch(e){failure={code:e.apiCode??e.code??e.name,httpStatus:e.httpStatus??null,...failureDiagnostic(e)};process.exitCode=1;}
finally{
 clearTimeout(timer);if(bridge)await bridge.close();b.cleanup();journal.phase='cleanup';persist();
 if(c)cleanup=await restoreTrial({state,project,configUrl,googleUrl,deny,api,owned,appCheck,persist});
 else cleanup={preflightContextFailed:true,noServiceMutationAttempted:!journal.authChangeAttempted&&!journal.rulesChangeAttempted&&!journal.appCheck?.apiEnableAttempted};
 globalThis.fetch=originalFetch;
 const report={sourceHashes:before,endSourceHashes:sourceHashes(root,files),...result,decisionId:scope.decisionId,recoveryOnly:recovery,
  rulesAccepted:journal.rulesAccepted??false,progress:journal.progress,appCheckGate:journal.appCheckGate??null,
  observed:b.snapshot(),manualLoginCallReservation:scope.manualLoginApiCallReservation,
  callsIncludingManualReservation:b.state.requests+scope.manualLoginApiCallReservation,
  bodyReservationBytes:scope.externalSetupBodyReservationBytes,bodyBytesIncludingReservation:b.state.requestBodyBytes+b.state.responseBodyBytes+scope.externalSetupBodyReservationBytes,
  authUsersCreated:journal.users.length,cleanup,...(failure?{failure}:{}),externalFirebaseConnected:true,productionImplementation:false,productionFreeTierVerified:false};
 assert.deepEqual(report.sourceHashes,report.endSourceHashes);
 fs.writeFileSync(new URL(recovery?'artifacts/recovery-summary.json':'artifacts/remote-summary.json',root),JSON.stringify(report,null,2)+'\n');
 if(cleanup?.complete){delete state.trial;writeLocal(configFile,state);journal.phase='finished';journal.cleanupComplete=true;writeLocal(journalFile,journal);}
 else process.exitCode=1;
 console.log(JSON.stringify({groups:result?.reports?.length??0,requests:report.callsIncludingManualReservation,cleanup,failure:failure??null}));
}
