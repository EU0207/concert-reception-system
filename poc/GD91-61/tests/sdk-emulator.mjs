import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {client,plan,send,inspect,rawBatch,decode} from '../sdk-adapter.mjs';
import {ready,proposal,writes,stored,accept,path} from '../../GD91-60/tests/publication-support.mjs';
import {statePlan} from '../../GD91-60/tests/access-support.mjs';
import {seed} from '../../GD91-60/tests/support.mjs';
import {budgets,comparison} from '../../GD91-60/tests/budgets.mjs';
import {proxy} from './proxy.mjs';

const reports=[],clients=[];
const open=async (token,options)=>{const c=await client(token,options);clients.push(c);return c;};
const a=f=>({show:f.show,device:f.manager,human:f.person});
const pub=(f,p=proposal(f))=>plan(f,writes(f,p),p.id,'publication');
const start=async f=>{const p=await statePlan(a(f),'operating');return plan(f,p.writes,p.id,'state');};
const snapshot=f=>Promise.all(['versions/current','assignmentState/current','control/current','publicStatus/current'].map(p=>stored(f,p,'owner')));
async function rejected(fn,allowed){try{await fn();assert.fail('unexpected success');}catch(e){assert(allowed.includes(e.code),e.stack);return e.code;}}
const sources=['../sdk-adapter.mjs','sdk-emulator.mjs','proxy.mjs','../../GD91-60/firebase.json','../../POC-001/package.json','../../POC-001/package-lock.json',
 '../../POC-001/node_modules/@firebase/firestore/dist/index.node.mjs','../../POC-001/node_modules/@firebase/firestore/dist/common-DjihRWhV.node.mjs',
 ...['publication-support','access-support','support','transport','comparison-support','candidate-support','global-support','budgets'].map(n=>'../../GD91-60/tests/'+n+'.mjs'),
 '../../GD91-60/firestore.rules','../../GD91-59/firestore.rules','../../GD91-39/firestore.rules','../../GD91-42/firestore.rules','../../GD91-49/codec.mjs','../../GD91-48/comparison.mjs','../../GD91-07/planner.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes();
const gate=await proxy();
async function run(id,label,test){const began=Date.now();reports.push({id,label,status:'passed',...await test(),elapsedMs:Date.now()-began});console.log(JSON.stringify({id,status:'passed'}));}
try{
 await run('S01','SDK transaction publishes the ordinary completed candidate',async()=>{const f=await ready({add:true}),p=proposal(f),c=await open(f.manager.token),t={callbacks:0,writes:0};assert.equal((await send(c,pub(f,p),{trace:t})).state,'committed');await accept(f,p);return{...t,writesPerCommit:3};});
 await run('S02','SDK state transition advances the shared version atomically',async()=>{const f=await ready(),c=await open(f.manager.token),p=await start(f);await send(c,p);const [v,,control,status]=await snapshot(f);assert.equal(v.values.control,2);assert.equal(control.state,'operating');assert.equal(status.state,'operating');assert.equal(control.firstReceptionStartedAt.$timestamp,status.firstReceptionStartedAt.$timestamp);assert.equal((await inspect(c,p)).state,'committed');return{writesPerCommit:4,commonVersion:2};});
 await run('S03','same ID and payload return the existing result without another update',async()=>{const f=await ready(),c=await open(f.manager.token),p=pub(f);await send(c,p);const before=await snapshot(f),t={callbacks:0,writes:0};for(let i=0;i<2;i++)assert.equal((await send(c,p,{trace:t})).state,'already-committed');assert.deepEqual(await snapshot(f),before);return{replays:2,...t};});
 await run('S04','same ID with a different event is rejected before writes',async()=>{const f=await ready(),c=await open(f.manager.token),p=pub(f);await send(c,p);const changed=structuredClone(p);changed.writes.find(w=>w.path===p.eventPath).value.kind='FAKE-different';const t={callbacks:0,writes:0},before=await snapshot(f);const code=await rejected(()=>send(c,changed,{trace:t}),['operation-id-conflict']);assert.equal(t.writes,0);assert.deepEqual(await snapshot(f),before);return{code,...t};});
 await run('S05','a stale confirmed proposal is not rebuilt from new state',async()=>{const f=await ready(),c=await open(f.manager.token),old=pub(f);await send(c,await start(f));const before=await snapshot(f),t={callbacks:0,writes:0};const code=await rejected(()=>send(c,old,{trace:t}),['stale-version']);assert.equal(t.writes,0);assert.deepEqual(await snapshot(f),before);assert.equal((await inspect(c,old)).state,'absent');return{code,...t};});
 await run('S06','revoked identity returns permission-denied without application resend',async()=>{const f=await ready(),c=await open(f.manager.token),p=pub(f),role=await stored(f,'roles/'+f.person.uid,'owner');await seed(path(f,'roles/'+f.person.uid),{...role,active:false});const before=await snapshot(f),t={callbacks:0,writes:0};const code=await rejected(()=>send(c,p,{trace:t}),['permission-denied']);assert.equal(t.callbacks,1);assert.equal(t.writes,0);assert.deepEqual(await snapshot(f),before);assert.equal((await inspect(c,p)).state,'unknown');return{code,...t,resultNotMisreportedAbsent:true};});
 await run('S07','negative control: disableNetwork does not block a transaction in this SDK runtime',async()=>{const f=await ready(),c=await open(f.manager.token),p=pub(f);await c.offline();const t={callbacks:0,writes:0};assert.equal((await send(c,p,{trace:t})).state,'committed');await c.online();assert.equal((await inspect(c,p)).state,'committed');return{...t,negativeControlOnly:true,disableNetworkNotASendGuard:true};});
 await run('S08','negative control: writeBatch queues while offline and sends on reconnect',async()=>{const f=await ready(),c=await open(f.manager.token),p=pub(f),before=await snapshot(f);await c.offline();let settled=false;const queued=rawBatch(c,p).finally(()=>{settled=true;});await new Promise(r=>setTimeout(r,100));assert.equal(settled,false);assert.deepEqual(await snapshot(f),before);await c.online();await queued;assert.equal((await inspect(c,p)).state,'committed');return{automaticallyAppliedOnReconnect:true,negativeControlOnly:true,excludedFromAdapter:true};});
 await run('S09','discarded success is recovered by another SDK instance with the original ID',async()=>{const f=await ready(),c=await open(f.manager.token),p=pub(f);await send(c,p);const before=await snapshot(f),next=await open(f.manager.token);assert.equal((await inspect(next,p)).state,'committed');const t={callbacks:0,writes:0};assert.equal((await send(next,p,{trace:t})).state,'already-committed');assert.equal(t.writes,0);assert.deepEqual(await snapshot(f),before);return{discardedAcknowledgement:true,newClientInstance:true,...t,processRestartTested:false};});
 await run('S10','offline result lookup is unknown and must not authorize resend',async()=>{const f=await ready(),c=await open(f.manager.token),p=pub(f);await c.offline();const result=await inspect(c,p);assert.equal(result.state,'unknown');assert.equal(result.code,'unavailable');await c.online();assert.equal((await inspect(c,p)).state,'absent');return{lookup:result,automaticResend:false};});
 await run('S11','ten SDK publication versus start races preserve one result and fixed proposals',async()=>{
  const races=[];
  for(let i=0;i<10;i++){
   const f=await ready({add:true}),c=await open(f.manager.token),d=await open(f.manager.token),p=pub(f),q=await start(f),before=await snapshot(f),traces=[{callbacks:0,writes:0},{callbacks:0,writes:0}];
   const r=await Promise.allSettled([send(c,p,{trace:traces[0]}),send(d,q,{trace:traces[1]})]);
   const successes=r.filter(x=>x.status==='fulfilled').length;assert(successes<=1);
   for(const x of r)if(x.status==='rejected')assert(['stale-version','permission-denied','aborted'].includes(x.reason.code),x.reason.stack);
   const observations=await Promise.all([inspect(c,p),inspect(d,q)]);assert(observations.every(x=>x.state!=='unknown'));
   if(successes===0){assert.deepEqual(await snapshot(f),before);assert(observations.every(x=>x.state==='absent'));await send(c,p);}
   const final=await Promise.all([inspect(c,p),inspect(d,q)]);assert.equal(final.filter(x=>x.state==='committed').length,1);
   const losing=final[0].state==='committed'?[d,q]:[c,p];const t={callbacks:0,writes:0};assert.equal(await rejected(()=>send(...losing,{trace:t}),['stale-version']),'stale-version');assert.equal(t.writes,0);
   const after=await snapshot(f);assert.equal(after[0].values.commit,f.publicationVersion.values.commit+1);
   if(final[0].state==='committed'){assert.equal(after[2].state,'preparing');assert.equal(after[0].values.control,1);}else{assert.equal(after[2].state,'operating');assert.deepEqual(after[1],f.assignment);}
   races.push({initialSuccesses:successes,codes:r.map(x=>x.status==='fulfilled'?x.value.state:x.reason.code),traces,explicitRetry:successes===0,winner:final[0].state==='committed'?'publication':'start'});
  }
  return{raceCount:10,races,maximumInitialSuccesses:1,finalSuccessesPerRace:1,recomputeProposalOnRetry:false};
 });
 await run('S12','a malformed partial SDK transaction is denied with no changes',async()=>{const f=await ready({add:true}),c=await open(f.manager.token),p=pub(f);p.writes=p.writes.filter(w=>!w.path.endsWith('/assignmentState/current'));const before=await snapshot(f),code=await rejected(()=>send(c,p),['permission-denied']);assert.deepEqual(await snapshot(f),before);assert.equal((await inspect(c,p)).state,'absent');return{code,noPartialState:true};});
 await run('S13','explicit offline guard makes no callback and reconnect alone leaves the operation absent',async()=>{const f=await ready(),c=await open(f.manager.token),p=pub(f),t={callbacks:0,writes:0},before=await snapshot(f);await c.offline();const code=await rejected(()=>send(c,p,{online:false,trace:t}),['explicit-offline']);await c.online();assert.deepEqual(t,{callbacks:0,writes:0});assert.equal((await inspect(c,p)).state,'absent');assert.deepEqual(await snapshot(f),before);return{code,...t};});
 await run('S14','injected gRPC UNAVAILABLE exhausts bounded retries without queuing; recovery needs explicit send',async()=>{const f=await ready(),c=await open(f.manager.token,{port:8281}),p=pub(f),t={callbacks:0,writes:0},before=await snapshot(f);gate.block();const code=await rejected(()=>send(c,p,{trace:t}),['unavailable']);assert.equal(t.writes,0);assert.equal(t.callbacks,3);assert(gate.stats().rejected>=3);gate.unblock();assert.equal((await inspect(c,p)).state,'absent');assert.deepEqual(await snapshot(f),before);await send(c,p);assert.equal((await inspect(c,p)).state,'committed');return{code,...t,proxy:gate.stats(),explicitSendAfterRecovery:true,realRadioOutageTested:false};});
 const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
 await writeFile(new URL('../artifacts/sdk-summary.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),runtime:{node:process.version,firebase:'12.18.0',transport:'Firebase Web SDK in Node.js, in-memory cache, local emulator only'},sourceHashes,endSourceHashes,budgets,comparison,scope:'SDK publication/state transactions, fixed proposals, error classification, ID result lookup and offline negative control. No browser, Auth SDK, IndexedDB, real response loss, full business C or real devices.',reports},null,2)+'\n');
 console.log(JSON.stringify({scenarios:reports.length,passed:reports.length,sourceHashes:Object.keys(sourceHashes).length}));
}catch(e){await writeFile(new URL('../artifacts/failed-run-'+Date.now()+'.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),sourceHashes,endSourceHashes:await hashes(),passed:reports,error:{name:e.name,code:e.code??null,message:e.message}},null,2)+'\n');throw e;}
finally{for(const c of clients)await c.close();await gate.close();}
