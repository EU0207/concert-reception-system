import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {runRevocations,restObserver} from './revocation-cases.mjs';

const scope={purpose:'GD91-84-expiry',variants:['baseline','data-revision'],maxAuthUsersPerTrial:4,maxJsonNodes:150,maxApplicationCallsPerTrial:200,externalTrials:2,expiryWindowMs:10000,billingAccountRequired:false,productionAdoptionApproved:false};
if(process.argv[2]==='--plan'){console.log(JSON.stringify({...scope,externalRequestsExecuted:0}));process.exit(0);}
assert.equal(process.argv[2],'--run-approved-expiry','explicit-approval-required');
const variant=process.argv[3];assert(scope.variants.includes(variant));
const {remoteContext}=await import('../GD91-82/remote-support.mjs');
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase/app');
const {initializeAuth,inMemoryPersistence,signInAnonymously}=require('firebase/auth'),{getDatabase,ref,onValue,goOffline}=require('firebase/database');
const c=await remoteContext(),s=c.state;assert(!s.trial,'unresolved-trial');
const configUrl='https://identitytoolkit.googleapis.com/admin/v2/projects/'+s.projectId+'/config';
const originalRules=(await c.owner('.settings/rules')).body;assert.deepEqual(originalRules,JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8')));
assert.equal((await c.owner('')).body,null,'database-not-empty');
assert.equal(((await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:batchGet?maxResults=10')).body.users??[]).length,0,'existing-auth-users');
const beforeConfig=(await c.api(configUrl)).body;
const emailSettings=config=>({enabled:config.signIn?.email?.enabled??false,passwordRequired:config.signIn?.email?.passwordRequired??true});
const previousEmail=emailSettings(beforeConfig);
const previousAnonymous=beforeConfig.signIn?.anonymous?.enabled??false,root='checks/'+randomUUID();
s.trial={purpose:scope.purpose,variant,rtdbRoots:[root],users:[],previousAnonymous,previousEmail};c.save();
const files=['remote-expiry.mjs','revocation-cases.mjs','database.rules.json','deny.rules.json','generate.mjs','auth-rules.mjs','generation-rules.mjs','shared-rules.mjs','../GD91-82/remote-support.mjs','../GD91-80/remote-support.mjs'];
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const hashes=()=>Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n'))]));
const before=hashes(),apps=[],subjects=[],listeners=[],streams=[],cleanup={rulesClosed:false,rootsEmpty:false,usersDeleted:0,authRestored:false};
// 最初の基準試行は認証方式の事前条件で停止した。変更前の7読取りも同じ上限へ算入する。
const priorPreflightCalls=variant==='baseline'?7:0;
let normalCalls=0,sdkCalls=0,result,error;
const total=()=>priorPreflightCalls+c.requests()+normalCalls+sdkCalls,guard=()=>assert(total()<160,'reserve-40-cleanup-calls');
async function normal(path,{method='GET',body,token,stream=false,signal}={}){
  guard();assert(path===root||path.startsWith(root+'/'));normalCalls++;
  const url=new URL(s.gd82DatabaseUrl+'/'+path+'.json');if(token)url.searchParams.set('auth',token);
  return fetch(url,{method,headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal??AbortSignal.timeout(25000)});
}
async function normalAuth(action,body){guard();assert(['signUp','signInWithPassword'].includes(action));normalCalls++;
  const url=new URL('https://identitytoolkit.googleapis.com/v1/accounts:'+action);url.searchParams.set('key',s.sdkConfig.apiKey);
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  if(r.status!==200)throw Object.assign(new Error('normal-auth-rejected'),{httpStatus:r.status});return r.json();
}
const io={owner:async(p,method='GET',body)=>{guard();return(await c.owner(p?root+'/'+p:root,method,body)).body;},
  subjects:async()=>{for(let i=0;i<2;i++){
    const email='fake-gd84-'+randomUUID()+'@example.com',password=randomUUID()+'Aa7!';
    const signup=await normalAuth('signUp',{email,password,returnSecureToken:true});s.trial.users.push(signup.localId);c.save();
    await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:update',{method:'POST',body:{localId:signup.localId,emailVerified:true}});
    const signed=await normalAuth('signInWithPassword',{email,password,returnSecureToken:true});
    const claims=JSON.parse(Buffer.from(signed.idToken.split('.')[1],'base64url'));assert.equal(claims.aud,s.projectId);assert.equal(claims.email_verified,true);assert.equal(claims.firebase.sign_in_provider,'password');
    const app=initializeApp(s.sdkConfig,randomUUID());apps.push(app);const auth=initializeAuth(app,{persistence:inMemoryPersistence});guard();sdkCalls++;
    const device=(await signInAnonymously(auth)).user;s.trial.users.push(device.uid);c.save();assert(s.trial.users.length<=4);
    const token=await device.getIdToken();assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).aud,s.projectId);
    subjects.push({human:{uid:signed.localId,token:signed.idToken,claims},device:{uid:device.uid,token},db:getDatabase(app,s.gd82DatabaseUrl),sessionRevision:0});
  }return subjects;},
  reset:async(f,endsAt)=>{await io.owner('roles/'+f.human.uid,'PUT',{active:true,role:'receptionist',revision:1,receptionBaselineRevision:0,startsAt:0,endsAt});await io.owner('devices/'+f.device.uid,'PUT',{schemaVersion:2,performanceId:root.split('/')[1],deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1});},
  issue:async(f,expiresAt)=>{const body={schemaVersion:2,performanceId:root.split('/')[1],deviceUid:f.device.uid,humanUid:f.human.uid,active:true,emailVerified:true,authProvider:'password',roleRevision:1,revision:++f.sessionRevision,issuedAt:{'.sv':'timestamp'},expiresAt,humanAuthTime:f.human.claims.auth_time*1000};const response=await normal(root+'/sessions/'+f.device.uid,{method:'PUT',body,token:f.human.token});assert.equal(response.status,200);await response.arrayBuffer();},
  sdkWatch:f=>{guard();sdkCalls++;const state={seen:[],error:null},close=onValue(ref(f.db,root+'/probes/general'),snap=>state.seen.push(snap.val()?.value),e=>{state.error=e.code;});listeners.push(close);return{state,close};},
  restWatch:async f=>{const controller=new AbortController(),stream=await restObserver(await normal(root+'/probes/general',{token:f.device.token,stream:true,signal:controller.signal}),controller);streams.push(stream.close);return stream;},
  current:async f=>{const r=await normal(root+'/probes/general',{token:f.device.token});await r.arrayBuffer();return{status:r.status};},
  record:r=>console.log(JSON.stringify({kind:r.kind,serverRejectionVerified:r.serverRejectionVerified}))};
const deployed=JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'));
if(variant==='data-revision')deployed.rules.checks.$run.probes.general['.read']+=' && data.child(\'revision\').isNumber() && data.child(\'revision\').val() > 0';
try{
  await c.api(configUrl+'?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{email:{enabled:true,passwordRequired:true},anonymous:{enabled:true}}}});
  await c.owner('.settings/rules','PUT',deployed);result=await runRevocations(io,{expiryWindowMs:scope.expiryWindowMs});assert.equal(result.subjectsCreated,s.trial.users.length);
}catch(e){error={code:e.apiCode??e.code??'trial-failed',httpStatus:e.httpStatus??null};process.exitCode=1;}
finally{
  for(const stop of listeners)stop();for(const close of streams)await close();for(const f of subjects)goOffline(f.db);for(const app of apps)try{await deleteApp(app);}catch{cleanup.localAppDeletionFailed=true;}
  try{
    const deny=JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8'));await c.owner('.settings/rules','PUT',deny);assert.deepEqual((await c.owner('.settings/rules')).body,deny);cleanup.rulesClosed=true;
    await c.owner(root,'DELETE');assert.equal((await c.owner(root)).body,null);assert.equal((await c.owner('')).body,null);cleanup.rootsEmpty=true;
    for(const uid of s.trial.users){await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:delete',{method:'POST',body:{localId:uid}});cleanup.usersDeleted++;}
    assert.equal(((await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:batchGet?maxResults=10')).body.users??[]).length,0);cleanup.authUsersRemaining=0;
    await c.api(configUrl+'?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{email:previousEmail,anonymous:{enabled:previousAnonymous}}}});
    const restored=(await c.api(configUrl)).body;assert.equal(restored.signIn?.anonymous?.enabled??false,previousAnonymous);assert.deepEqual(emailSettings(restored),previousEmail);cleanup.authRestored=true;
    const billing=(await c.api('https://cloudbilling.googleapis.com/v1/projects/'+s.projectId+'/billingInfo')).body;assert(!billing.billingEnabled&&!billing.billingAccountName);cleanup.billingAccountUnlinked=true;
    delete s.trial;c.save();
  }catch(e){cleanup.error={code:e.apiCode??e.code??'cleanup-failed',httpStatus:e.httpStatus??null};process.exitCode=1;}
}
const report={sourceHashes:before,endSourceHashes:hashes(),...result,ruleVariant:variant,deployedRulesHash:hash(deployed),applicationCalls:total(),priorPreflightCalls,ownerAndManagementCalls:c.requests()+priorPreflightCalls,normalCalls,sdkApplicationCalls:sdkCalls,
  sdkInternalWireRequestsMeasured:false,verificationMailFlowTested:false,cleanup,...(error?{error}:{}),externalFirebaseConnected:true,productionAuthorizationVerified:false,productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);assert(report.applicationCalls<=200);fs.writeFileSync(new URL('artifacts/remote-expiry-'+variant+'-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({variant,reports:report.reports?.length??0,applicationCalls:total(),cleanup,error:error??null}));process.exit(process.exitCode??0);
