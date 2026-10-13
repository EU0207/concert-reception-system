import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash,randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {startGoogleLogin} from './google-login-server.mjs';import {runGoogleCases} from './google-cases.mjs';import {sdkObserver,streamObserver} from './google-observers.mjs';
assert.equal(process.argv[2],'--continue-approved-google','explicit-approval-required');
const local=new URL('../GD91-80/firebase-client-config.local.json',import.meta.url);
execFileSync('git',['check-ignore','-q',fileURLToPath(local)],{stdio:'pipe',windowsHide:true});assert.equal(execFileSync('git',['ls-files','--',fileURLToPath(local)],{encoding:'utf8',windowsHide:true}).trim(),'');
const initialState=JSON.parse(fs.readFileSync(local,'utf8'));
assert.equal(initialState.trial?.purpose,'GD91-86-google');assert.equal(initialState.trial.authorization,'TECH-DD91-085-A');
assert.equal(initialState.trial.phase,'awaiting-google-configuration');assert.equal(initialState.trial.users.length,0);assert.equal(initialState.trial.applicationCalls,8);
const priorCalls=initialState.trial.applicationCalls;
// contextの所有者・無料状態と接続先の確認3件も、開始前に台帳へ確保する。
initialState.trial.applicationCalls+=3;initialState.trial.phase='checking-google-configuration';fs.writeFileSync(local,JSON.stringify(initialState,null,2)+'\n');
const {remoteContext}=await import('../GD91-82/remote-support.mjs');const c=await remoteContext(),s=c.state;
assert.equal(c.requests(),3);const root=s.trial.rtdbRoots[0];assert.equal(s.trial.rtdbRoots.length,1);assert(/^checks\/[0-9a-f-]{36}$/.test(root));
const configUrl='https://identitytoolkit.googleapis.com/admin/v2/projects/'+s.projectId+'/config',googleUrl='https://identitytoolkit.googleapis.com/admin/v2/projects/'+s.projectId+'/defaultSupportedIdpConfigs/google.com';
const files=['google-remote.mjs','google-cases.mjs','google-observers.mjs','google-login-server.mjs','google-login.mjs','google-login.html','model.mjs','database.rules.json','deny.rules.json','../GD91-84/generation-tests.mjs','../GD91-84/shared-tests.mjs','../GD91-84/transport.mjs','../GD91-82/remote-support.mjs','../GD91-80/remote-support.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));const before=hashes();
const require=createRequire(new URL('../POC-004/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase/app'),{initializeAuth,inMemoryPersistence,signInAnonymously}=require('firebase/auth'),{getDatabase,onValue,ref,goOffline}=require('firebase/database');
const deny=JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8')),apps=[],subjects=[],closers=[];
const cleanup={rulesClosed:false,rootsEmpty:false,usersDeleted:0,authRestored:false};let normalCalls=0,sdkCalls=0,bridge,result,failure,cleanupMode=false,loginTimer,googleUsed=false;
const total=()=>priorCalls+c.requests()+normalCalls+sdkCalls;
function save(){s.trial.applicationCalls=total();c.save();}
function reserve(){assert(total()<(cleanupMode?400:350),'application-budget');s.trial.applicationCalls=total()+1;c.save();}
async function api(url,options){reserve();try{return await c.api(url,options);}finally{save();}}
async function owner(path,method='GET',body){reserve();try{return(await c.owner(path,method,body)).body;}finally{save();}}
async function normal(f,path,method='GET',body,{stream=false,signal}={}){assert(path===''||!path.startsWith('/')&&!path.includes('..'));reserve();normalCalls++;save();const url=new URL(s.gd82DatabaseUrl+'/'+root+(path?'/'+path:'')+'.json');url.searchParams.set('auth',f.device.token);
  const r=await fetch(url,{method,headers:{'content-type':'application/json',...(stream?{accept:'text/event-stream'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal??AbortSignal.timeout(25000)});
  if(stream)return r;return{status:r.status,body:await r.json().catch(()=>null)};
}
async function lookup(token){reserve();normalCalls++;save();const url=new URL('https://identitytoolkit.googleapis.com/v1/accounts:lookup');url.searchParams.set('key',s.sdkConfig.apiKey);const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,'token-lookup-rejected');const body=await r.json();assert.equal(body.users?.length,1);const user=body.users[0],claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
  assert.equal(claims.aud,s.projectId);assert.equal(claims.iss,'https://securetoken.google.com/'+s.projectId);assert.equal(claims.sub,user.localId);
  // サービスで確認できた同プロジェクトの本人を、追加条件の検査より先に後処理対象へ記録する。
  s.trial.users.push(user.localId);save();assert.equal(claims.firebase?.sign_in_provider,'google.com');assert.equal(claims.email_verified,true);assert.equal(user.emailVerified,true);assert(user.providerUserInfo?.some(x=>x.providerId==='google.com'));assert(claims.exp*1000>Date.now());assert(Number.isSafeInteger(claims.auth_time));
  s.trial.phase='google-token-verified';save();googleUsed=true;return{uid:user.localId,token,claims};
}
const io={performanceId:root.split('/')[1],owner:(path,method,body)=>owner(root+(path?'/'+path:''),method,body),normal,
  issue:async(f,expiresAt)=>{const body={schemaVersion:2,performanceId:root.split('/')[1],deviceUid:f.device.uid,humanUid:f.human.uid,active:true,emailVerified:true,authProvider:'google.com',roleRevision:1,revision:++f.sessionRevision,issuedAt:{'.sv':'timestamp'},expiresAt,humanAuthTime:f.human.claims.auth_time*1000};
    const r=await normal({device:{token:f.human.token}},'sessions/'+f.device.uid,'PUT',body);assert.equal(r.status,200,'google-human-session-issue-rejected');},
  sdkWatch:(f,path)=>{reserve();sdkCalls++;save();const watcher=sdkObserver(f.db,root+'/'+path,onValue,ref);closers.push(watcher.close);return watcher;},
  restWatch:async(f,path)=>{const controller=new AbortController();const watcher=await streamObserver(await normal(f,path,'GET',undefined,{stream:true,signal:controller.signal}),controller);closers.push(watcher.close);return watcher;},
  record:record=>console.log(JSON.stringify(record))};
try{
  assert.deepEqual(await owner('.settings/rules'),deny);assert.equal(await owner(''),null);
  assert.equal(((await api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:batchGet?maxResults=10')).body.users??[]).length,0);
  const config=(await api(configUrl)).body,google=(await api(googleUrl)).body;
  assert.equal(google.enabled,true,'google-provider-not-enabled');assert(config.authorizedDomains?.includes('localhost'),'localhost-not-authorized');
  assert.deepEqual(config.authorizedDomains,s.trial.previousAuthorizedDomains);assert.equal(s.sdkConfig.authDomain,s.projectId+'.firebaseapp.com');
  s.trial.phase='awaiting-google-login';save();
  bridge=await startGoogleLogin(s.sdkConfig,{onBegin:async()=>{reserve();sdkCalls++;s.trial.phase='google-login-started';save();},onToken:lookup});
  console.log(JSON.stringify({phase:'awaiting-google-login',url:bridge.url,applicationCalls:total(),maxApplicationCalls:400}));
  const deadline=new Promise((_,reject)=>{loginTimer=setTimeout(()=>reject(new Error('login-deadline')),1200000);});
  const human=await Promise.race([bridge.result,deadline]);clearTimeout(loginTimer);await bridge.close();bridge=null;
  await api(configUrl+'?updateMask=signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{anonymous:{enabled:true}}}});
  for(let i=0;i<2;i++){const app=initializeApp(s.sdkConfig,randomUUID());apps.push(app);const auth=initializeAuth(app,{persistence:inMemoryPersistence});reserve();sdkCalls++;save();const user=(await signInAnonymously(auth)).user;s.trial.users.push(user.uid);save();assert(s.trial.users.length<=3);const token=await user.getIdToken(),claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));assert.equal(claims.aud,s.projectId);assert.equal(claims.firebase?.sign_in_provider,'anonymous');subjects.push({human,device:{uid:user.uid,token},db:getDatabase(app,s.gd82DatabaseUrl),sessionRevision:0});}
  assert.equal(s.trial.users.length,3);s.trial.phase='running-google-cases';save();
  await owner('.settings/rules','PUT',JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8')));
  result=await runGoogleCases(io,...subjects);s.trial.phase='cleaning-up';save();
}catch(e){failure={code:e.apiCode??e.code??'trial-failed',httpStatus:e.httpStatus??null};process.exitCode=1;}
finally{
  clearTimeout(loginTimer);if(bridge)await bridge.close();for(const close of closers)try{await close();}catch{}for(const f of subjects)goOffline(f.db);for(const app of apps)try{await deleteApp(app);}catch{cleanup.localAppDeletionFailed=true;}
  cleanupMode=true;s.trial.phase='cleaning-up';save();
  // 後処理が途中で失敗しても、後続の独立した復元を続け、未解決台帳を保持する。
  async function clean(name,work){try{await work();}catch(e){cleanup[name+'Failed']={code:e.apiCode??e.code??'cleanup-failed',httpStatus:e.httpStatus??null};process.exitCode=1;}}
  await clean('rules',async()=>{await owner('.settings/rules','PUT',deny);assert.deepEqual(await owner('.settings/rules'),deny);cleanup.rulesClosed=true;});
  await clean('roots',async()=>{await owner(root,'DELETE');assert.equal(await owner(root),null);assert.equal(await owner(''),null);cleanup.rootsEmpty=true;});
  await clean('users',async()=>{for(const uid of s.trial.users){await api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:delete',{method:'POST',body:{localId:uid}});cleanup.usersDeleted++;}assert.equal(((await api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:batchGet?maxResults=10')).body.users??[]).length,0);cleanup.authUsersRemaining=0;});
  await clean('providers',async()=>{await api(configUrl+'?updateMask=signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{anonymous:{enabled:s.trial.previousAnonymous}}}});await api(googleUrl+'?updateMask=enabled',{method:'PATCH',body:{enabled:s.trial.previousGoogleEnabled}});const restored=(await api(configUrl)).body,google=(await api(googleUrl)).body;assert.equal(restored.signIn?.anonymous?.enabled??false,s.trial.previousAnonymous);assert.deepEqual(restored.authorizedDomains??[],s.trial.previousAuthorizedDomains);assert.equal(google.enabled??false,s.trial.previousGoogleEnabled);cleanup.authRestored=true;cleanup.authorizedDomainsUnchanged=true;cleanup.newGoogleConfigMetadataRetainedDisabled=!s.trial.previousGoogleConfigExisted&&!google.enabled;});
  await clean('billing',async()=>{const billing=(await api('https://cloudbilling.googleapis.com/v1/projects/'+s.projectId+'/billingInfo')).body;assert(!billing.billingEnabled&&!billing.billingAccountName);cleanup.billingAccountUnlinked=true;});
}
const report={decisionId:'TECH-DD91-085',developerApproved:true,sourceHashes:before,endSourceHashes:hashes(),...result,googleAccountUsed:googleUsed,realGoogleHumans:googleUsed?1:0,anonymousDevices:subjects.length,googleTokenVerifiedByAuthService:googleUsed,applicationCalls:total(),priorPreflightCalls:priorCalls,ownerAndManagementCalls:c.requests()+priorCalls,normalCalls,sdkApplicationCalls:sdkCalls,sdkInternalWireRequestsMeasured:false,cleanup,...(failure?{failure}:{}),externalFirebaseConnected:true,productionAuthorizationVerified:false,productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);assert(report.applicationCalls<=400);
fs.writeFileSync(new URL('artifacts/google-remote-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
if(cleanup.rulesClosed&&cleanup.rootsEmpty&&cleanup.authUsersRemaining===0&&cleanup.authRestored&&cleanup.billingAccountUnlinked){delete s.trial;c.save();}
console.log(JSON.stringify({reports:result?.reports?.length??0,applicationCalls:total(),cleanup,failure:failure??null}));process.exit(process.exitCode??0);
