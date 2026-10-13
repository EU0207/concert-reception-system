import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {initializeApp,deleteApp} from '../POC-001/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeAuth,inMemoryPersistence,signInAnonymously} from '../POC-001/node_modules/firebase/auth/dist/index.mjs';
import {context,encode} from '../GD91-80/remote-support.mjs';
assert.equal(process.argv[2],'--run-approved');
const files=['lease-window.mjs','candidates.rules','../GD91-80/remote-support.mjs','../GD91-80/deny.rules'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),c=await context({maxRequests:60}),s=c.state;assert(s.servicesReady&&!s.trial);
const p=s.projectId,base='https://firestore.googleapis.com/v1/projects/'+p+'/databases/(default)/documents';
const trial={runId:randomUUID(),users:[],documents:[],purpose:'GD91-81-window'};s.trial=trial;c.save();
const apps=[],cleanup={rulesClosed:false,documentsDeleted:0,usersDeleted:0,authRestored:false};let normalRequests=0,results;
async function deploy(file){const made=(await c.api('https://firebaserules.googleapis.com/v1/projects/'+p+'/rulesets',{
  method:'POST',body:{source:{files:[{name:'firestore.rules',content:fs.readFileSync(new URL(file,import.meta.url),'utf8')}]}}})).body;
  await c.api('https://firebaserules.googleapis.com/v1/projects/'+p+'/releases/cloud.firestore',{method:'PATCH',body:{release:{name:'projects/'+p+'/releases/cloud.firestore',rulesetName:made.name},updateMask:'rulesetName'}});}
async function write(path,data){assert(path.startsWith('diagnostic/'+trial.runId+'/'));if(!trial.documents.includes(path)){trial.documents.push(path);c.save();}
  await c.api(base+'/'+path,{method:'PATCH',body:{fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encode(v)]))}});}
async function read(token,method,readTime){assert(++normalRequests<=25);const parent=base+'/diagnostic/'+trial.runId;
  const r=await fetch(method==='get'?parent+'/lease/a'+(readTime?'?readTime='+encodeURIComponent(readTime):''):parent+':runQuery',{
    method:method==='get'?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    ...(method==='get'?{}:{body:JSON.stringify({structuredQuery:{from:[{collectionId:'lease'}],limit:10},...(readTime?{readTime}:{})})}),signal:AbortSignal.timeout(15000)});
  const body=await r.json();return{httpStatus:r.status,documents:Array.isArray(body)?body.filter(x=>x.document).length:(body.fields?1:0),body};}
const pub=r=>({httpStatus:r.httpStatus,documents:r.documents});
try{
  await deploy('candidates.rules');const users=[];
  for(let i=0;i<2;i++){const app=initializeApp(s.sdkConfig,randomUUID());apps.push(app);const auth=initializeAuth(app,{persistence:inMemoryPersistence});
    const user=(await signInAnonymously(auth)).user;trial.users.push(user.uid);c.save();users.push({uid:user.uid,token:await user.getIdToken()});}
  const [a,b]=users,expires=Date.now()+20000,grant='diagnostic/'+trial.runId+'/access/lease-';
  await write(grant+a.uid,{active:true,expiresAt:{$timestamp:new Date(expires).toISOString()}});
  await write(grant+b.uid,{active:true,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}});
  await write('diagnostic/'+trial.runId+'/lease/a',{value:'FAKE-before-revocation'});
  const initial=await read(a.token,'query');assert.equal(initial.httpStatus,200);const readTime=initial.body.filter(x=>x.readTime).at(-1).readTime;
  await write(grant+a.uid,{active:false,expiresAt:{$timestamp:new Date(expires).toISOString()}});
  const beforeExpiry=[];for(const method of['get','query'])beforeExpiry.push({method,current:pub(await read(a.token,method)),historical:pub(await read(a.token,method,readTime))});
  assert(Date.now()<expires,'pre-expiry-observation-missed');assert(beforeExpiry.every(x=>x.current.httpStatus===403&&x.historical.httpStatus===200&&x.historical.documents===1));
  await new Promise(r=>setTimeout(r,Math.max(0,expires-Date.now()+1000)));
  const afterExpiry=[];for(const method of['get','query'])afterExpiry.push({method,current:pub(await read(a.token,method)),historical:pub(await read(a.token,method,readTime))});
  assert(afterExpiry.every(x=>x.current.httpStatus===403&&x.historical.httpStatus===403));const other=pub(await read(b.token,'query'));assert.equal(other.httpStatus,200);
  results={leaseDurationMs:20000,beforeExpiry,afterExpiry,otherActivePrincipal:other,immediateHistoricalRevocationVerified:false};
}catch(e){results={error:{code:e.apiCode??e.code??'unexpected-error',httpStatus:e.httpStatus??null}};process.exitCode=1;}
finally{
  for(const app of apps)try{await deleteApp(app);}catch{cleanup.localAppDeletionFailed=true;process.exitCode=1;}
  try{await deploy('../GD91-80/deny.rules');cleanup.rulesClosed=true;
    for(const path of trial.documents){await c.api(base+'/'+path,{method:'DELETE',allowed:[200,404]});cleanup.documentsDeleted++;}
    for(const uid of trial.users){await c.api('https://identitytoolkit.googleapis.com/v1/projects/'+p+'/accounts:delete',{method:'POST',body:{localId:uid}});cleanup.usersDeleted++;}
    await c.api('https://identitytoolkit.googleapis.com/admin/v2/projects/'+p+'/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled',{
      method:'PATCH',body:{signIn:{email:{enabled:s.previousSignIn.email?.enabled??false,passwordRequired:s.previousSignIn.email?.passwordRequired??true},anonymous:{enabled:s.previousSignIn.anonymous?.enabled??false}}}});
    cleanup.authRestored=true;delete s.trial;c.save();
  }catch(e){cleanup.error={code:e.apiCode??e.code??'unexpected-error'};process.exitCode=1;}
}
const report={sourceHashes,endSourceHashes:hashes(),results,cleanup,normalRequests,managementAndOwnerRequests:c.requests(),sdkApplicationCalls:2,
  applicationRequests:normalRequests+c.requests()+2,sdkInternalWireRequestsMeasured:false,productionFreeTierVerified:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);assert(report.applicationRequests<=100);
fs.writeFileSync(new URL('artifacts/lease-window.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({results,cleanup,applicationRequests:report.applicationRequests}));process.exit(process.exitCode??0);
