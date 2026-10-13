import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {trial,project,namespace,request,owner,user,provision,issue,ok,sourceHashes,metrics} from './transport.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase/app');
const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth');
const {getDatabase,connectDatabaseEmulator,ref,onValue,goOffline}=require('firebase/database');
const files=['stream-probe.mjs','transport.mjs','auth-rules.mjs','generation-rules.mjs','shared-rules.mjs','generate.mjs','database.rules.json','deny.rules.json','firebase.json'];
const before=sourceHashes(files),apps=[],dbs=[],listeners=[],reports=[];let failure;
async function wait(test,ms){const until=Date.now()+ms;while(Date.now()<until&&!test())await new Promise(r=>setTimeout(r,20));return test();}
async function rules(file){ok(await request('.settings/rules',{method:'PUT',token:'owner',body:JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'))}));}
async function subject(role){const f=await provision(role),app=initializeApp({projectId:project,apiKey:'demo-api-key'},randomUUID());apps.push(app);
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});const signed=(await signInAnonymously(auth)).user;
  f.device={uid:signed.uid,token:await signed.getIdToken()};f.registration={...f.registration,deviceUid:signed.uid};
  await owner(trial+'/devices/'+signed.uid,'PUT',f.registration);const db=getDatabase(app,'http://127.0.0.1:9000/?ns='+namespace);connectDatabaseEmulator(db,'127.0.0.1',9000);dbs.push(db);return{f,db};}
function watch(db){const state={seen:[],error:null};const stop=onValue(ref(db,trial+'/probes/general'),s=>state.seen.push(s.val()),e=>{state.error=e.code;});listeners.push(stop);return{state,stop};}
let cleanup={rulesClosed:false,trialRootEmpty:false};
try{
  await rules('database.rules.json');
  for(const kind of ['role','device','session','control','session-expiry','role-expiry']){
    await owner(trial+'/control','PUT',{state:'operating',revision:1});await owner(trial+'/probes/general','PUT','FAKE-before');
    const a=await subject('owner'),b=await subject('deputy');const expires=Date.now()+3000;
    if(kind==='role-expiry')await owner(trial+'/roles/'+a.f.human.uid+'/endsAt','PUT',expires);
    ok(await issue(a.f,1,{expiresAt:kind.endsWith('expiry')?expires:Date.now()+3600000}));ok(await issue(b.f));
    const wa=watch(a.db),wb=watch(b.db);assert(await wait(()=>wa.state.seen.length&&wb.state.seen.length,2000));
    const started=Date.now();
    if(kind==='role')await owner(trial+'/roles/'+a.f.human.uid+'/active','PUT',false);
    if(kind==='device')await owner(trial+'/devices/'+a.f.device.uid+'/active','PUT',false);
    if(kind==='session')await owner(trial+'/sessions/'+a.f.device.uid+'/active','PUT',false);
    if(kind==='control')await owner(trial+'/control/state','PUT','stopped');
    if(kind.endsWith('expiry'))await wait(()=>Date.now()>expires+200,3500);
    await wait(()=>wa.state.error!==null,1000);
    const cancelledBeforePayload=wa.state.error!==null,current=await user('probes/general',a.f.device);assert.equal(current.status,401);
    await owner(trial+'/probes/general','PUT','FAKE-after');
    await wait(()=>wa.state.error!==null||wa.state.seen.includes('FAKE-after'),1500);
    if(kind!=='control')assert(await wait(()=>wb.state.seen.includes('FAKE-after'),1500));
    const result={kind,currentRestStatus:current.status,cancelledBeforePayload,cancelledAfterPayload:wa.state.error!==null,
      postInvalidationDataReceived:wa.state.seen.includes('FAKE-after'),retainedLastValue:wa.state.seen.at(-1),
      otherContinues:kind==='control'?null:wb.state.seen.includes('FAKE-after'),elapsedMs:Date.now()-started,
      serverRejectionVerified:wa.state.error!==null&&!wa.state.seen.includes('FAKE-after')};
    reports.push(result);console.log(JSON.stringify(result));wa.stop();wb.stop();
  }
}catch(e){failure={code:e.code??'ASSERTION',message:e.message};process.exitCode=1;}
finally{for(const stop of listeners)stop();for(const db of dbs)goOffline(db);for(const app of apps)await deleteApp(app);await rules('deny.rules.json');cleanup.rulesClosed=JSON.stringify((await request('.settings/rules',{token:'owner'})).body)===JSON.stringify(JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8')));await owner(trial,'DELETE');cleanup.trialRootEmpty=(await owner(trial))===null;}
const report={sourceHashes:before,endSourceHashes:sourceHashes(files),reports,metrics,cleanup,...(failure?{failure}:{}),
  allComparedRevocationsVerified:reports.length===6&&reports.every(r=>r.serverRejectionVerified),externalFirebaseConnected:false,productionAuthorizationVerified:false,productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);fs.writeFileSync(new URL('artifacts/stream-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({groups:reports.length,allComparedRevocationsVerified:report.allComparedRevocationsVerified,cleanup,failure:failure??null}));process.exit(process.exitCode??0);
