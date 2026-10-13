import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {trial,project,namespace,request,owner,user,provision,issue,ok,sourceHashes,metrics,hash} from './transport.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase/app');
const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth');
const {getDatabase,connectDatabaseEmulator,ref,onValue,goOffline}=require('firebase/database');
const files=['stream-probe.mjs','transport.mjs','auth-rules.mjs','generation-rules.mjs','shared-rules.mjs','generate.mjs','database.rules.json','deny.rules.json','firebase.json'];
const before=sourceHashes(files),apps=[],dbs=[],listeners=[],reports=[],restStreams=[];let failure;
const fenced=process.argv[2]==='--data-revision',deployedRules=JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'));
if(fenced)deployedRules.rules.checks.$run.probes.general['.read']+=' && data.child(\'revision\').isNumber() && data.child(\'revision\').val() > 0';
async function wait(test,ms){const until=Date.now()+ms;while(Date.now()<until&&!test())await new Promise(r=>setTimeout(r,20));return test();}
async function rules(file){ok(await request('.settings/rules',{method:'PUT',token:'owner',body:JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'))}));}
async function subject(role){const f=await provision(role),app=initializeApp({projectId:project,apiKey:'demo-api-key'},randomUUID());apps.push(app);
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});const signed=(await signInAnonymously(auth)).user;
  f.device={uid:signed.uid,token:await signed.getIdToken()};f.registration={...f.registration,deviceUid:signed.uid};
  await owner(trial+'/devices/'+signed.uid,'PUT',f.registration);const db=getDatabase(app,'http://127.0.0.1:9000/?ns='+namespace);connectDatabaseEmulator(db,'127.0.0.1',9000);dbs.push(db);return{f,db};}
function watch(db){const state={seen:[],error:null};const stop=onValue(ref(db,trial+'/probes/general'),s=>state.seen.push(s.val()?.value),e=>{state.error=e.code;});listeners.push(stop);return{state,stop};}
async function restWatch(f){const controller=new AbortController(),url=new URL('http://127.0.0.1:9000/'+trial+'/probes/general.json');url.searchParams.set('ns',namespace);url.searchParams.set('auth',f.device.token);
  const response=await fetch(url,{headers:{accept:'text/event-stream'},signal:controller.signal});assert.equal(response.status,200);const reader=response.body.getReader(),decoder=new TextDecoder(),state={seen:[],error:null};let buffer='';
  const task=(async()=>{try{while(true){const next=await reader.read();if(next.done)break;buffer+=decoder.decode(next.value,{stream:true}).replace(/\r\n/g,'\n');let end;
    while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=block.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim(),data=block.split('\n').find(x=>x.startsWith('data:'))?.slice(5).trim();
      if(['cancel','auth_revoked'].includes(event)){state.error=event;continue;}if(['put','patch'].includes(event)&&data){const value=JSON.parse(data);if(value.path==='/')state.seen.push(value.data?.value);}
    }
  }}catch{if(!controller.signal.aborted)state.error='stream-failed';}})();
  const close=async()=>{controller.abort();await task;};restStreams.push(close);assert(await wait(()=>state.seen.length>0,2000));return{state,close};
}
let cleanup={rulesClosed:false,trialRootEmpty:false};
try{
  ok(await request('.settings/rules',{method:'PUT',token:'owner',body:deployedRules}));
  for(const kind of ['role','device','session','control','session-expiry','role-expiry']){
    await owner(trial+'/control','PUT',{state:'operating',revision:1});await owner(trial+'/probes/general','PUT',{revision:1,value:'FAKE-before'});
    const a=await subject('owner'),b=await subject('deputy');const expires=Date.now()+3000;
    if(kind==='role-expiry')await owner(trial+'/roles/'+a.f.human.uid+'/endsAt','PUT',expires);
    ok(await issue(a.f,1,{expiresAt:kind.endsWith('expiry')?expires:Date.now()+3600000}));ok(await issue(b.f));
    const wa=watch(a.db),wb=watch(b.db),rest=await restWatch(a.f);assert(await wait(()=>wa.state.seen.length&&wb.state.seen.length,2000));
    const started=Date.now();
    if(kind==='role')await owner(trial+'/roles/'+a.f.human.uid+'/active','PUT',false);
    if(kind==='device')await owner(trial+'/devices/'+a.f.device.uid+'/active','PUT',false);
    if(kind==='session')await owner(trial+'/sessions/'+a.f.device.uid+'/active','PUT',false);
    if(kind==='control')await owner(trial+'/control/state','PUT','stopped');
    if(kind.endsWith('expiry'))await wait(()=>Date.now()>expires+200,3500);
    await wait(()=>wa.state.error!==null,1000);
    const cancelledBeforePayload=wa.state.error!==null,current=await user('probes/general',a.f.device);assert.equal(current.status,401);
    await owner(trial+'/probes/general','PUT',{revision:2,value:'FAKE-after'});
    await wait(()=>wa.state.error!==null||wa.state.seen.includes('FAKE-after'),1500);
    if(kind!=='control')assert(await wait(()=>wb.state.seen.includes('FAKE-after'),1500));
    await wait(()=>rest.state.error!==null||rest.state.seen.includes('FAKE-after'),1500);
    const result={kind,currentRestStatus:current.status,cancelledBeforePayload,cancelledAfterPayload:wa.state.error!==null,
      postInvalidationDataReceived:wa.state.seen.includes('FAKE-after'),retainedLastValue:wa.state.seen.at(-1),
      restStreamCancelled:rest.state.error!==null,restStreamPostInvalidationDataReceived:rest.state.seen.includes('FAKE-after'),
      otherContinues:kind==='control'?null:wb.state.seen.includes('FAKE-after'),elapsedMs:Date.now()-started,
      roleAndSessionExpiryCoincide:kind==='role-expiry',serverRejectionVerified:wa.state.error!==null&&!wa.state.seen.includes('FAKE-after')&&rest.state.error!==null&&!rest.state.seen.includes('FAKE-after')};
    // 期限切れ後も受信した場合、依存する状態の明示変更で停止するかを診断する。
    if(kind.endsWith('expiry')){await owner(trial+'/sessions/'+a.f.device.uid+'/active','PUT',false);await wait(()=>wa.state.error!==null&&rest.state.error!==null,1500);result.explicitRevocationStopsBoth=wa.state.error!==null&&rest.state.error!==null;}
    reports.push(result);console.log(JSON.stringify(result));wa.stop();wb.stop();await rest.close();
  }
}catch(e){failure={code:e.code??'ASSERTION',message:e.message};process.exitCode=1;}
finally{for(const stop of listeners)stop();for(const close of restStreams)await close();for(const db of dbs)goOffline(db);for(const app of apps)await deleteApp(app);await rules('deny.rules.json');cleanup.rulesClosed=JSON.stringify((await request('.settings/rules',{token:'owner'})).body)===JSON.stringify(JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8')));await owner(trial,'DELETE');cleanup.trialRootEmpty=(await owner(trial))===null;}
const report={sourceHashes:before,endSourceHashes:sourceHashes(files),reports,metrics,cleanup,...(failure?{failure}:{}),
  ruleVariant:fenced?'data-revision':'baseline',deployedRulesHash:hash(deployedRules),allComparedRevocationsVerified:reports.length===6&&reports.every(r=>r.serverRejectionVerified),externalFirebaseConnected:false,productionAuthorizationVerified:false,productionFreeTierVerified:false,tested3000:false};
assert.deepEqual(report.sourceHashes,report.endSourceHashes);fs.writeFileSync(new URL('artifacts/'+(fenced?'stream-fence-summary.json':'stream-summary.json'),import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({groups:reports.length,ruleVariant:report.ruleVariant,allComparedRevocationsVerified:report.allComparedRevocationsVerified,cleanup,failure:failure??null}));process.exit(process.exitCode??0);
