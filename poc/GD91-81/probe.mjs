import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {initializeApp,deleteApp} from '../POC-001/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeAuth,inMemoryPersistence,signInAnonymously} from '../POC-001/node_modules/firebase/auth/dist/index.mjs';
import {context,encode} from '../GD91-80/remote-support.mjs';
const files=['probe.mjs','candidates.rules','../GD91-80/remote-support.mjs','../GD91-80/deny.rules'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),mode=process.argv[2];assert(['--dry-run','--run-approved'].includes(mode));
if(mode==='--dry-run'){const rules=fs.readFileSync(new URL('candidates.rules',import.meta.url),'utf8');
  for(const name of ['baseline','after','guard','lease'])assert(rules.includes('/'+name+'/{id}'));
  assert(rules.includes('allow read, write: if false'));console.log(JSON.stringify({cases:4,remoteRequests:0}));process.exit(0);}
const c=await context({maxRequests:100}),s=c.state;assert(s.servicesReady&&!s.trial);
const p=s.projectId,root='projects/'+p+'/databases/(default)/documents',base='https://firestore.googleapis.com/v1/'+root;
const trial={runId:randomUUID(),users:[],documents:[],purpose:'GD91-81'};s.trial=trial;c.save();
const apps=[],reports=[],cleanup={rulesClosed:false,documentsDeleted:0,usersDeleted:0,authRestored:false};
let normalRequests=0,sdkCalls=0,stage='deploy';const deadline=Date.now()+180000;
const error=e=>({code:e.apiCode??e.code??'unexpected-error',httpStatus:e.httpStatus??null});
function guard(){assert(Date.now()<deadline);assert(c.requests()+normalRequests+sdkCalls<140,'cleanup-reserve');}
async function deploy(file){
  const source={files:[{name:'firestore.rules',content:fs.readFileSync(new URL(file,import.meta.url),'utf8')}]};
  const made=(await c.api('https://firebaserules.googleapis.com/v1/projects/'+p+'/rulesets',{method:'POST',body:{source}})).body;
  await c.api('https://firebaserules.googleapis.com/v1/projects/'+p+'/releases/cloud.firestore',{method:'PATCH',body:{release:{name:'projects/'+p+'/releases/cloud.firestore',rulesetName:made.name},updateMask:'rulesetName'}});
}
async function write(path,value){guard();assert(path.startsWith('diagnostic/'+trial.runId+'/'));
  if(!trial.documents.includes(path)){trial.documents.push(path);c.save();}
  await c.api(base+'/'+path,{method:'PATCH',body:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}});
}
async function normal(token,url,body){guard();assert(url.startsWith(base+'/')||url===base+':batchGet');normalRequests++;
  const r=await fetch(url,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  return{status:r.status,body:await r.json().catch(()=>({}))};
}
const count=v=>Array.isArray(v)?v.filter(x=>x.document||x.found).length:v.documents?.length??(v.fields?1:0);
const pub=r=>({httpStatus:r.status,documents:count(r.body)});
function q(kind){return{structuredQuery:{from:[{collectionId:kind}],limit:10}};}
const parent=base+'/diagnostic/'+trial.runId;
async function reads(token,kind,readTime){
  const path=parent+'/'+kind,sel=readTime?{readTime}:{},suffix=readTime?'&readTime='+encodeURIComponent(readTime):'';
  return[
    {method:'runQuery',...pub(await normal(token,parent+':runQuery',{...q(kind),...sel}))},
    {method:'get',...pub(await normal(token,path+'/a?mask.fieldPaths=value'+suffix))},
    {method:'list',...pub(await normal(token,path+'?pageSize=10'+suffix))},
    {method:'batchGet',...pub(await normal(token,base+':batchGet',{documents:[root+'/diagnostic/'+trial.runId+'/'+kind+'/a'],...sel}))}
  ];
}
try{
  await deploy('candidates.rules');stage='create-fictional-users';
  const users=[];
  for(let i=0;i<2;i++){
    const app=initializeApp(s.sdkConfig,randomUUID());apps.push(app);
    const auth=initializeAuth(app,{persistence:inMemoryPersistence});sdkCalls++;
    const user=(await signInAnonymously(auth)).user;trial.users.push(user.uid);c.save();users.push({uid:user.uid,token:await user.getIdToken()});
  }
  const [a,b]=users;
  for(const kind of['baseline','after','guard','lease']){
    stage=kind;
    const expires=Date.now()+(kind==='lease'?15000:3600000);
    const access='diagnostic/'+trial.runId+'/access/'+kind+'-';
    await write(access+a.uid,{active:true,expiresAt:{$timestamp:new Date(expires).toISOString()}});
    await write(access+b.uid,{active:true,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}});
    await write('diagnostic/'+trial.runId+'/'+kind+'/a',{value:'FAKE-one'});
    let initial;
    for(let n=0;n<8;n++){initial=await normal(a.token,parent+':runQuery',q(kind));if(initial.status===200)break;assert.equal(initial.status,403);await new Promise(r=>setTimeout(r,2000));}
    if(initial.status!==200){reports.push({kind,baselineUnavailable:true,httpStatus:initial.status});continue;}
    const readTime=initial.body.filter(x=>x.readTime).at(-1).readTime;
    const before=await reads(a.token,kind),historicalBefore=await reads(a.token,kind,readTime);
    assert(before.every(x=>x.httpStatus===200&&x.documents===1));assert(historicalBefore.every(x=>x.httpStatus===200&&x.documents===1));
    assert.equal((await normal(null,parent+':runQuery',q(kind))).status,403);
    if(kind==='lease')await new Promise(r=>setTimeout(r,Math.max(0,expires-Date.now()+1000)));
    else await write(access+a.uid,{active:false,expiresAt:{$timestamp:new Date(expires).toISOString()}});
    const current=await reads(a.token,kind),historical=await reads(a.token,kind,readTime);
    const transaction=await normal(a.token,parent+':runQuery',{...q(kind),newTransaction:{readOnly:{readTime}}});
    const txn=Array.isArray(transaction.body)?transaction.body.find(x=>x.transaction)?.transaction:null;
    if(txn)await c.api(base+':rollback',{method:'POST',body:{transaction:txn}});
    await write('diagnostic/'+trial.runId+'/'+kind+'/b',{value:'FAKE-two'});
    const other=pub(await normal(b.token,parent+':runQuery',q(kind)));
    const historicalAfterNew=pub(await normal(a.token,parent+':runQuery',{...q(kind),readTime}));
    assert.equal(other.httpStatus,200);assert.equal(other.documents,2);
    reports.push({kind,before,historicalBefore,current,historical,readOnlyTransaction:pub(transaction),otherActivePrincipal:other,
      historicalAfterNew,historicalReadBlocked:historical.every(x=>x.httpStatus===403)&&transaction.status===403});
    console.log(JSON.stringify({kind,current:current.map(x=>x.httpStatus),historical:historical.map(x=>x.httpStatus),transaction:transaction.status}));
  }
}catch(e){reports.push({kind:stage,error:error(e)});process.exitCode=1;}
finally{
  for(const app of apps)try{await deleteApp(app);}catch{cleanup.localAppDeletionFailed=true;process.exitCode=1;}
  try{
    await deploy('../GD91-80/deny.rules');cleanup.rulesClosed=true;
    for(const path of trial.documents){await c.api(base+'/'+path,{method:'DELETE',allowed:[200,404]});cleanup.documentsDeleted++;}
    for(const uid of trial.users){await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+p+'/accounts:delete',{method:'POST',body:{localId:uid}});cleanup.usersDeleted++;}
    await c.api('https://identitytoolkit.googleapis.com/admin/v2/projects/'+p+'/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled',{
      method:'PATCH',body:{signIn:{email:{enabled:s.previousSignIn.email?.enabled??false,passwordRequired:s.previousSignIn.email?.passwordRequired??true},anonymous:{enabled:s.previousSignIn.anonymous?.enabled??false}}}});
    cleanup.authRestored=true;delete s.trial;c.save();
  }catch(e){cleanup.error=error(e);process.exitCode=1;}
}
const report={sourceHashes,endSourceHashes:hashes(),reports,cleanup,managementAndOwnerRequests:c.requests(),normalRequests,sdkApplicationCalls:sdkCalls,
  applicationRequests:c.requests()+normalRequests+sdkCalls,sdkInternalWireRequestsMeasured:false,serverAuthorizationVerified:false,
  productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);assert(report.applicationRequests<=200);
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/remote-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:reports.length,applicationRequests:report.applicationRequests,cleanup}));process.exit(process.exitCode??0);
