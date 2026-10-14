import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runMinimalCases} from './minimal-cases.mjs';
const scope={decisionId:'TECH-DD91-090',developerApprovalRequired:true,externalTrialCount:1,maxAuthUsers:3,fakePasswordHumans:1,anonymousDevices:2,realGoogleLoginRequired:false,maxJsonNodes:2000,maxRootJsonBytes:1048576,maxApplicationCallsIncludingCleanup:200,cleanupCallReserve:60,maxObservedApplicationBodyBytes:20971520,businessRegistrationAndPublicationPreloaded:true,productionAdoptionApproved:false,tested3000:false};
if(process.argv[2]==='--plan'){console.log(JSON.stringify({...scope,externalRequestsExecuted:0}));process.exit(0);}
assert.equal(process.argv[2],'--run-approved-quarantine','explicit-approval-required');
assert(!fs.existsSync(new URL('artifacts/remote-quarantine-summary.json',import.meta.url)),'trial-already-finished');
const local=new URL('../GD91-80/firebase-client-config.local.json',import.meta.url);
execFileSync('git',['check-ignore','-q',fileURLToPath(local)],{stdio:'pipe',windowsHide:true});
assert.equal(execFileSync('git',['ls-files','--',fileURLToPath(local)],{encoding:'utf8',windowsHide:true}).trim(),'');
const s=JSON.parse(fs.readFileSync(local,'utf8'));assert.equal(s.purpose,'GD91-80');assert(s.createdByThisRun&&s.ownerVerified&&s.billingVerifiedUnlinked);assert(/^crs-authcheck-20261013-[0-9a-f]{4}$/.test(s.projectId));assert.equal(s.sdkConfig.projectId,s.projectId);assert(!s.trial,'unresolved-trial');
s.trial={purpose:'GD91-98-quarantine',authorization:'TECH-DD91-090-A',phase:'preflight',rtdbRoots:['checks/'+randomUUID()],users:[],applicationCalls:3};
fs.writeFileSync(local,JSON.stringify(s,null,2)+'\n');
const files=['remote-quarantine.mjs','minimal-cases.mjs','quarantine.mjs','quarantine-rules.mjs','generate.mjs','database.rules.json','deny.rules.json','../GD91-96/queue.mjs','../GD91-88/receipt-client.mjs','../GD91-87/receipt-client.mjs','../GD91-84/auth-rules.mjs','../GD91-82/remote-support.mjs','../GD91-80/remote-support.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')])),before=hashes();
const root=s.trial.rtdbRoots[0],deny=JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8'));
const cleanup={rulesClosed:false,rootsEmpty:false,usersDeleted:0,authRestored:false,billingAccountUnlinked:false};
let c,result,failure,normalCalls=0,applicationBodyBytes=0,cleanupMode=false,denyVerified=false,rootOwned=false,previousEmail,previousAnonymous,previousDomains;
const total=()=>c?c.requests()+normalCalls:3;
function save(){if(c){c.state.trial.applicationCalls=total();c.save();}}
function reserve(){assert(total()<(cleanupMode?200:140),'application-budget');if(c){c.state.trial.applicationCalls=total()+1;c.save();}}
function countBody(body){applicationBodyBytes+=Buffer.byteLength(JSON.stringify(body??null));if(!cleanupMode)assert(applicationBodyBytes<=scope.maxObservedApplicationBodyBytes,'application-body-budget');}
async function api(url,options){reserve();try{if(options?.body)countBody(options.body);const r=await c.api(url,options);countBody(r.body);return r;}finally{save();}}
async function owned(p,method='GET',body){reserve();try{if(body)countBody(body);const r=(await c.owner(p,method,body)).body;countBody(r);return r;}finally{save();}}
async function normalAuth(action,body){assert(['signUp','signInWithPassword'].includes(action));reserve();normalCalls++;save();countBody(body);const u=new URL('https://identitytoolkit.googleapis.com/v1/accounts:'+action);u.searchParams.set('key',s.sdkConfig.apiKey);const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});if(r.status!==200)throw Object.assign(new Error('normal-auth-rejected'),{httpStatus:r.status});const value=await r.json();countBody(value);return value;}
async function human(){const email='fake-gd98-'+randomUUID()+'@example.com',password=randomUUID()+'Aa7!';const first=await normalAuth('signUp',{email,password,returnSecureToken:true});c.state.trial.users.push(first.localId);save();await api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:update',{method:'POST',body:{localId:first.localId,emailVerified:true}});const signed=await normalAuth('signInWithPassword',{email,password,returnSecureToken:true}),claims=JSON.parse(Buffer.from(signed.idToken.split('.')[1],'base64url'));assert.equal(signed.localId,first.localId);assert.equal(claims.aud,s.projectId);assert.equal(claims.email_verified,true);assert.equal(claims.firebase.sign_in_provider,'password');return{uid:signed.localId,token:signed.idToken,claims};}
async function device(h){const u=await normalAuth('signUp',{returnSecureToken:true});c.state.trial.users.push(u.localId);save();assert(c.state.trial.users.length<=3);const claims=JSON.parse(Buffer.from(u.idToken.split('.')[1],'base64url'));assert.equal(claims.aud,s.projectId);assert.equal(claims.firebase.sign_in_provider,'anonymous');return{human:h,device:{uid:u.localId,token:u.idToken},sessionRevision:0};}
async function normal(f,p,method='GET',body){assert(!p.startsWith('/')&&!p.includes('..'));reserve();normalCalls++;save();if(body)countBody(body);const u=new URL(c.state.gd82DatabaseUrl+'/'+root+'/'+p+'.json');u.searchParams.set('auth',f.device.token);const r=await fetch(u,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});const value=await r.json().catch(()=>null);countBody(value);return{status:r.status,body:value};}
const configUrl='https://identitytoolkit.googleapis.com/admin/v2/projects/'+s.projectId+'/config';
try{
 const{remoteContext}=await import('../GD91-82/remote-support.mjs');c=await remoteContext();assert.equal(c.requests(),3);
 assert.deepEqual(await owned('.settings/rules'),deny);denyVerified=true;assert.equal(await owned(''),null);rootOwned=true;
 assert.equal(((await api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:batchGet?maxResults=10')).body.users??[]).length,0);
 const config=(await api(configUrl)).body;previousEmail={enabled:config.signIn?.email?.enabled??false,passwordRequired:config.signIn?.email?.passwordRequired??true};previousAnonymous=config.signIn?.anonymous?.enabled??false;previousDomains=config.authorizedDomains??[];
 Object.assign(c.state.trial,{previousEmail,previousAnonymous,previousAuthorizedDomains:previousDomains});c.save();
 await api(configUrl+'?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{email:{enabled:true,passwordRequired:true},anonymous:{enabled:true}}}});
 await owned('.settings/rules','PUT',JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8')));
 c.state.trial.phase='running';save();const h=await human(),a=await device(h),b=await device(h);
 const io={performanceId:root.split('/')[1],owner:(p,m='GET',body)=>owned(root+(p?'/'+p:''),m,body),normal,
  issue:async f=>{const body={schemaVersion:2,performanceId:root.split('/')[1],deviceUid:f.device.uid,humanUid:f.human.uid,active:true,emailVerified:true,authProvider:'password',roleRevision:1,revision:++f.sessionRevision,issuedAt:{'.sv':'timestamp'},expiresAt:Date.now()+3600000,humanAuthTime:f.human.claims.auth_time*1000};assert.equal((await normal({device:{token:f.human.token}},'sessions/'+f.device.uid,'PUT',body)).status,200);}};
 result=await runMinimalCases(io,a,b);
}catch(e){failure={code:e.apiCode??e.code??'trial-failed',httpStatus:e.httpStatus??null};process.exitCode=1;}
finally{
 cleanupMode=true;if(c){c.state.trial.phase='cleanup';save();
  async function clean(name,work){try{await work();}catch(e){cleanup[name+'Failed']={code:e.apiCode??e.code??'cleanup-failed',httpStatus:e.httpStatus??null};process.exitCode=1;}}
  await clean('rules',async()=>{assert(denyVerified,'preflight-rules-not-owned');await owned('.settings/rules','PUT',deny);assert.deepEqual(await owned('.settings/rules'),deny);cleanup.rulesClosed=true;});
  await clean('roots',async()=>{assert(rootOwned,'preflight-root-not-owned');await owned(root,'DELETE');assert.equal(await owned(root),null);assert.equal(await owned(''),null);cleanup.rootsEmpty=true;});
  await clean('users',async()=>{for(const uid of c.state.trial.users){await api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:delete',{method:'POST',body:{localId:uid}});cleanup.usersDeleted++;}assert.equal(((await api('https://identitytoolkit.googleapis.com/v1/projects/'+s.projectId+'/accounts:batchGet?maxResults=10')).body.users??[]).length,0);cleanup.authUsersRemaining=0;});
  await clean('settings',async()=>{assert(previousEmail,'original-settings-not-captured');await api(configUrl+'?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{email:previousEmail,anonymous:{enabled:previousAnonymous}}}});const restored=(await api(configUrl)).body;assert.deepEqual({enabled:restored.signIn?.email?.enabled??false,passwordRequired:restored.signIn?.email?.passwordRequired??true},previousEmail);assert.equal(restored.signIn?.anonymous?.enabled??false,previousAnonymous);assert.deepEqual(restored.authorizedDomains??[],previousDomains);cleanup.authRestored=true;});
  await clean('billing',async()=>{const billing=(await api('https://cloudbilling.googleapis.com/v1/projects/'+s.projectId+'/billingInfo')).body;assert(!billing.billingEnabled&&!billing.billingAccountName);cleanup.billingAccountUnlinked=true;});
 }
}
const report={sourceHashes:before,endSourceHashes:hashes(),...result,decisionId:scope.decisionId,applicationCalls:total(),ownerAndManagementCalls:c?.requests()??3,normalCalls,authUsersCreated:c?.state.trial.users.length??0,observedApplicationBodyBytes:applicationBodyBytes,realPersonalProfileUsed:false,googleAccountUsed:false,sseAndSdkWireOverheadMeasured:false,cleanup,...(failure?{failure}:{}),externalFirebaseConnected:Boolean(c),productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);assert(total()<=200);
fs.writeFileSync(new URL('artifacts/remote-quarantine-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
if(c&&cleanup.rulesClosed&&cleanup.rootsEmpty&&cleanup.authUsersRemaining===0&&cleanup.authRestored&&cleanup.billingAccountUnlinked){delete c.state.trial;c.save();}
console.log(JSON.stringify({groups:result?.reports.length??0,applicationCalls:total(),cleanup,failure:failure??null}));process.exit(process.exitCode??0);
