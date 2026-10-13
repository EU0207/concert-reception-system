// 少量の認可比較だけを実行する。アプリの業務成立・無料人数の証明ではない。
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {initializeApp,deleteApp} from '../POC-001/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeAuth,inMemoryPersistence,createUserWithEmailAndPassword,signInAnonymously} from '../POC-001/node_modules/firebase/auth/dist/index.mjs';
import {initializeFirestore,collection,query,limit,onSnapshot,terminate,setLogLevel} from '../POC-001/node_modules/firebase/firestore/dist/index.mjs';
import {context,encode} from './remote-support.mjs';
const files=['probe.mjs','remote-support.mjs','remote.rules','deny.rules','generate-rules.mjs',
  '../GD91-79/minimal.rules','../GD91-77/receipt.rules','../GD91-78/node_modules/.cache/firestore.rules'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),mode=process.argv[2];
assert(['--dry-run','--run-approved'].includes(mode),'explicit-mode-required');
if(mode==='--dry-run'){
  const rules=fs.readFileSync(new URL('remote.rules',import.meta.url),'utf8');
  assert(rules.includes('request.auth.token.firebase.sign_in_provider'));assert(rules.includes('allow write: if false;'));
  assert(!rules.includes('allow write: if true'));assert(rules.includes("control(p).state == 'operating'"));
  console.log(JSON.stringify({contractCheck:true,remoteRequests:0,credentialsLoaded:false}));process.exit(0);
}
const c=await context({maxRequests:180}),s=c.state;assert(s.servicesReady,'services-not-ready');assert(!s.trial,'previous-trial-needs-cleanup');
const p=s.projectId,root='projects/'+p+'/databases/(default)/documents',base='https://firestore.googleapis.com/v1/'+root;
const trial={runId:randomUUID(),users:[],documents:[]};s.trial=trial;c.save();
const reports=[],cleanup={rulesClosed:false,documentsDeleted:0,usersDeleted:0,authRestored:false},apps=[];
const errorCode=e=>e.apiCode??e.code??(e.message==='sdk-deadline'?'sdk-deadline':'unexpected-error');
let db,unsub=null,sdkCalls=0,normalRequests=0,normalWrites=0,ownerWrites=0,stage='deploy-read-only-rules';
setLogLevel('silent');const started=Date.now(),deadline=started+210000;
function guard(){assert(Date.now()<deadline,'trial-deadline');assert(c.requests()+normalRequests<140,'reserve-cleanup-budget');assert(sdkCalls<20,'sdk-call-budget');}
async function bounded(work,ms=15000){let t;try{return await Promise.race([work,new Promise((_,r)=>{t=setTimeout(()=>r(new Error('sdk-deadline')),ms);})]);}finally{clearTimeout(t);}}
async function wait(test,ms=10000){const end=Date.now()+ms;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return test();}
async function deploy(file){
  const rules=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  const made=(await c.api('https://firebaserules.googleapis.com/v1/projects/'+p+'/rulesets',{method:'POST',body:{source:{files:[{name:'firestore.rules',content:rules}]}}})).body;
  const url='https://firebaserules.googleapis.com/v1/projects/'+p+'/releases/cloud.firestore';
  const old=await c.api(url,{allowed:[200,404]});
  const release={name:'projects/'+p+'/releases/cloud.firestore',rulesetName:made.name};
  await c.api(old.status===404?'https://firebaserules.googleapis.com/v1/projects/'+p+'/releases':url,{method:old.status===404?'POST':'PATCH',body:old.status===404?release:{release,updateMask:'rulesetName'}});
}
async function write(path,value){guard();
  assert(path.startsWith('diagnostic/'+trial.runId+'/')||path.startsWith('publicationShows/'+trial.runId+'-'));
  if(!trial.documents.includes(path)){trial.documents.push(path);c.save();}
  await c.api(base+'/'+path,{method:'PATCH',body:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}});ownerWrites++;
}
async function normal(token,url,body){guard();assert(url.startsWith(base+'/')||url===base+':batchGet');normalRequests++;
  const r=await fetch(url,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const v=await r.json().catch(()=>({}));return{status:r.status,body:v};
}
function documents(v){return Array.isArray(v)?v.filter(x=>x.document||x.found).length:v.documents?.length??(v.fields?1:0);}
const publicResponse=r=>({httpStatus:r.status,documents:documents(r.body),code:r.body.error?.status??null});
async function requests(token,path,id,readTime){
  const selector=readTime?{readTime}:{},suffix=readTime?'&readTime='+encodeURIComponent(readTime):'';
  const q={structuredQuery:{from:[{collectionId:path.split('/').at(-1)}],limit:10},...selector};
  const parent=path.slice(0,path.lastIndexOf('/'));
  const rows=[];
  rows.push({method:'runQuery',...publicResponse(await normal(token,base+'/'+parent+':runQuery',q))});
  rows.push({method:'get',...publicResponse(await normal(token,base+'/'+path+'/'+id+'?mask.fieldPaths=value'+suffix))});
  rows.push({method:'list',...publicResponse(await normal(token,base+'/'+path+'?pageSize=10'+suffix))});
  rows.push({method:'batchGet',...publicResponse(await normal(token,base+':batchGet',{documents:[root+'/'+path+'/'+id],...selector}))});
  return rows;
}
async function watch(path){guard();unsub?.();sdkCalls++;const state={records:0,error:null,serverSnapshots:0};
  const ready=new Promise((resolve,reject)=>{unsub=onSnapshot(query(collection(db,path),limit(10)),snapshot=>{
    if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
    state.records=snapshot.size;state.serverSnapshots++;resolve();
  },e=>{state.error=e.code;reject(e);});});ready.catch(()=>{});await bounded(ready);return state;
}
try{
  await deploy('remote.rules');
  stage='create-two-fictional-auth-users';
  const humanApp=initializeApp(s.sdkConfig,randomUUID());apps.push(humanApp);sdkCalls++;
  const humanAuth=initializeAuth(humanApp,{persistence:inMemoryPersistence});
  const human=(await bounded(createUserWithEmailAndPassword(humanAuth,'fake-'+randomUUID()+'@example.invalid',randomUUID()+'aA7!'))).user;
  trial.users.push(human.uid);c.save();
  await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+p+'/accounts:update',{method:'POST',body:{localId:human.uid,emailVerified:true}});
  sdkCalls++;const humanToken=await human.getIdToken(true);assert.equal(JSON.parse(Buffer.from(humanToken.split('.')[1],'base64url')).email_verified,true);
  const deviceApp=initializeApp(s.sdkConfig,randomUUID());apps.push(deviceApp);sdkCalls++;
  const deviceAuth=initializeAuth(deviceApp,{persistence:inMemoryPersistence}),device=(await bounded(signInAnonymously(deviceAuth))).user;
  trial.users.push(device.uid);c.save();const token=await device.getIdToken();assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).aud,p);
  db=initializeFirestore(deviceApp,{experimentalForceLongPolling:true});
  for(const kind of['minimal','role','device','session','control']){
    stage=kind;guard();const show=trial.runId+'-'+kind;
    let path,changedPath,original;
    if(kind==='minimal'){
      path='diagnostic/'+trial.runId+'/items';changedPath='diagnostic/'+trial.runId+'/access/current';original={active:true,subjectUid:device.uid};await write(changedPath,original);
    }else{
      const common={schemaVersion:2,environmentId:'FAKE-environment',performanceId:show};
      const role={...common,role:'receptionist',active:true,revision:1,receptionBaselineRevision:0,startsAt:{$timestamp:'2000-01-01T00:00:00Z'},endsAt:{$timestamp:'2100-01-01T00:00:00Z'}};
      const dev={...common,deviceUid:device.uid,humanUid:human.uid,active:true,preparedRoleRevision:1,preparedDataRevision:1};
      const session={...common,deviceUid:device.uid,humanUid:human.uid,active:true,emailVerified:true,authProvider:'password',roleRevision:1,revision:1,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}};
      const control={state:'operating',revision:1};
      const entries={role:['roles/'+human.uid,role],device:['devices/'+device.uid,dev],session:['sessions/'+device.uid,session],control:['control/current',control]};
      for(const [key,value]of Object.values(entries))await write('publicationShows/'+show+'/'+key,value);
      changedPath='publicationShows/'+show+'/'+entries[kind][0];original=entries[kind][1];path='publicationShows/'+show+'/receiptEvents';
    }
    await write(path+'/a',{value:'FAKE-one'});
    const parent=path.slice(0,path.lastIndexOf('/')),q={structuredQuery:{from:[{collectionId:path.split('/').at(-1)}],limit:10}};
    let first;
    for(let i=0;i<8;i++){first=await normal(token,base+'/'+parent+':runQuery',q);if(first.status===200)break;assert.equal(first.status,403);await new Promise(r=>setTimeout(r,3000));}
    assert.equal(first.status,200,'baseline-read-must-succeed');const readTime=first.body.filter(x=>x.readTime).at(-1).readTime;
    const baseline=await requests(token,path,'a');assert(baseline.every(r=>r.httpStatus===200&&r.documents===1),'baseline-method-must-succeed');
    const historicalBefore=await requests(token,path,'a',readTime);
    if(kind==='minimal'){
      for(const t of[null,humanToken]){const rejected=await normal(t,base+'/'+parent+':runQuery',q);assert.equal(rejected.status,403);}
    }
    const activeWatch=await watch(path);assert.equal(activeWatch.records,1);
    await write(changedPath,kind==='control'?{...original,state:'preparing',revision:2}:{...original,active:false,revision:2});
    const changedAt=Date.now(),stoppedWithoutItemChange=await wait(()=>Boolean(activeWatch.error));
    const current=await requests(token,path,'a'),historical=await requests(token,path,'a',readTime);
    const transaction=await normal(token,base+'/'+parent+':runQuery',{...q,newTransaction:{readOnly:{readTime}}});
    const transactionId=Array.isArray(transaction.body)?transaction.body.find(x=>x.transaction)?.transaction:null;
    if(transactionId)await c.api(base+':rollback',{method:'POST',body:{transaction:transactionId}});
    await write(path+'/b',{value:'FAKE-two'});await wait(()=>Boolean(activeWatch.error)||activeWatch.records>1);
    const afterItemChange={...activeWatch};unsub?.();unsub=null;
    let freshError=null;
    try{const state=await watch(path);freshError=state.error;}catch(e){freshError=errorCode(e);}unsub?.();unsub=null;
    reports.push({kind,baseline,historicalBefore,current,historical,readOnlyTransaction:publicResponse(transaction),
      stoppedWithoutItemChange,stopObservationMs:10000,observedElapsedMs:Date.now()-changedAt,afterItemChange,freshListenError:freshError,
      normalPrincipal:'Firebase-ID-token',ownerSeededMetadata:true,sessionIssuanceVerified:false});
    console.log(JSON.stringify({kind,current:current.map(r=>r.httpStatus),historical:historical.map(r=>r.httpStatus),stoppedWithoutItemChange,freshError}));
  }
}catch(e){reports.push({kind:stage,error:{code:errorCode(e),httpStatus:e.httpStatus??null}});process.exitCode=1;}
finally{
  stage='cleanup';unsub?.();
  const localCleanupErrors=[];
  if(db)try{await bounded(terminate(db));}catch{localCleanupErrors.push('firestore-termination');}
  for(const app of apps)try{await bounded(deleteApp(app));}catch{localCleanupErrors.push('app-deletion');}
  if(localCleanupErrors.length){cleanup.localErrors=localCleanupErrors;process.exitCode=1;}
  try{
    await deploy('deny.rules');cleanup.rulesClosed=true;
    for(const path of trial.documents){await c.api(base+'/'+path,{method:'DELETE',allowed:[200,404]});cleanup.documentsDeleted++;}
    for(const uid of trial.users){await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+p+'/accounts:delete',{method:'POST',body:{localId:uid}});cleanup.usersDeleted++;}
    const authConfig='https://identitytoolkit.googleapis.com/admin/v2/projects/'+p+'/config';
    await c.api(authConfig+'?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled',{method:'PATCH',body:{signIn:{email:{enabled:s.previousSignIn.email?.enabled??false,passwordRequired:s.previousSignIn.email?.passwordRequired??true},anonymous:{enabled:s.previousSignIn.anonymous?.enabled??false}}}});
    cleanup.authRestored=true;delete s.trial;c.save();
  }catch(e){cleanup.error={code:errorCode(e),httpStatus:e.httpStatus??null};process.exitCode=1;}
}
const report={sourceHashes,endSourceHashes:hashes(),reports,cleanup,managementAndOwnerRequests:c.requests(),normalRequests,sdkApplicationCalls:sdkCalls,ownerWrites,
  applicationRequests:c.requests()+normalRequests+sdkCalls,sdkInternalWireRequestsMeasured:false,productionIdentityServiceTested:true,
  productionFreeTierVerified:false,fullApplicationAuthorizationVerified:false,realDevicesVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);assert(report.applicationRequests<=200);
fs.writeFileSync(new URL('artifacts/remote-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:reports.length,cleanup,applicationRequests:report.applicationRequests,productionFreeTierVerified:false}));
process.exit(process.exitCode??0);
