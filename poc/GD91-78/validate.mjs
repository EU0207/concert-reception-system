import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fixture,seedMany,pub,getOwner} from '../GD91-75/fixtures.mjs';
import {reader} from '../GD91-73/tests/support.mjs';
import {ok} from '../GD91-60/tests/transport.mjs';
import {event,send,memoryJournal,derive} from '../GD91-77/receipt-client.mjs';
import {watchClient,wireTime,windowLimit} from './watch-client.mjs';
const files=['validate.mjs','watch-client.mjs','generate.mjs','node_modules/.cache/firestore.rules','../GD91-77/receipt-client.mjs','../GD91-77/receipt.rules',
  '../GD91-77/node_modules/.cache/firestore.rules','../GD91-75/fixtures.mjs','../GD91-72/sdk-adapter.mjs',
  '../GD91-73/tests/support.mjs','../GD91-72/tests/support.mjs','../GD91-60/tests/transport.mjs',
  '../POC-001/node_modules/@firebase/firestore/dist/index.node.mjs'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),reports=[],clients=[];
const report=(id,details={})=>{reports.push({id,status:'passed',...details});console.log(JSON.stringify(reports.at(-1)));};
async function until(predicate,{timeout=60000}={}) {
  const start=Date.now();while(!predicate()){assert(Date.now()-start<timeout,'observation-timeout');await new Promise(r=>setTimeout(r,20));}
}
async function within(work) {
  let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('operation-timeout')),30000);})]);}
  finally{clearTimeout(timer);}
}
async function build(n) {
  const f=await fixture(n),actors=[f.reader];for(let i=1;i<6;i++)actors.push(await reader(f));
  await seedMany(f.attendees.map(id=>[pub(f,'tickets/'+id),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
    attendeeId:id,cycleClosed:false,activeCredentialId:randomUUID(),credentialVersion:1}]));
  const receivers=[];
  for(const a of actors){const c=await watchClient(f.show,a,memoryJournal(f.show,a.device.uid,a.person.uid));clients.push(c);receivers.push(c);}
  await within(Promise.all(receivers.map(c=>c.start())));return{f,actors,receivers};
}
async function waitRecords(c,n){await until(()=>c.journal.snapshot().records.size===n||c.state().failure);assert.equal(c.state().failure,null);await c.idle();}
try {
  for(const [from,to] of [['.000000000',''],['.123000000','.123'],['.123456000','.123456'],['.123456789','.123456789']])
    assert.deepEqual(wireTime({nested:[{$timestamp:'2026-10-12T00:00:00'+from+'Z'}]}),{nested:[{$timestamp:'2026-10-12T00:00:00'+to+'Z'}]});
  report('L-timestamp-precision',{protobufCanonicalWidths:[0,3,6,9],nanosecondsPreserved:true});
  let sample;
  for(const n of[600,1000]){
    const o=await build(n),{f,actors,receivers}=o;
    const events=f.attendees.map((id,i)=>event(f,actors[i%6],id,Math.floor(i/6)+1));
    let writeRequests=0;
    await Promise.all(actors.map(async(a,index)=>{const mine=events.filter(e=>e.deviceUid===a.device.uid);
      for(let i=0;i<mine.length;i+=3){await receivers[index].send(mine.slice(i,i+3));writeRequests++;}}));
    await Promise.all(receivers.map(c=>waitRecords(c,n)));
    const expected=derive(receivers[0].journal.snapshot().records);assert.equal(expected.length,n);assert(expected.every(x=>x.status==='received'));
    for(const c of receivers){assert.deepEqual(derive(c.journal.snapshot().records),expected);assert(c.stats.maximumSnapshotSize<windowLimit);assert.equal(c.journal.snapshot().cursor,null);}
    const before=receivers.map(c=>({...c.stats}));
    // 変更なしの短い観測。長時間安定性やSDK内部通信0件を証明しない。
    await new Promise(r=>setTimeout(r,1000));await Promise.all(receivers.map(c=>c.idle()));
    assert(receivers.every((c,i)=>c.stats.serverSnapshots===before[i].serverSnapshots));
    report('L-'+n,{people:n,independentHumans:new Set(actors.map(a=>a.person.uid)).size,
      independentDevices:new Set(actors.map(a=>a.device.uid)).size,receiptWrites:n,writeRequests,
      receivedByEach:receivers.map(c=>c.journal.snapshot().records.size),stats:receivers.map(c=>({...c.stats})),
      idleObservationMs:1000,idleApplicationQueries:0,normalRegistrationVerified:false});
    if(n===600)sample={...o,events,journals:receivers.map(c=>c.journal)};
    // 別公演の購読を残さず、人数別に6つのSDKクライアントへ揃える。
    for(const c of receivers){await c.close();clients.splice(clients.indexOf(c),1);}
  }
  const {f,actors,events}=sample,receivers=[];
  for(let i=0;i<6;i++){const c=await watchClient(f.show,actors[i],sample.journals[i]);clients.push(c);receivers.push(c);}
  await within(Promise.all(receivers.map(c=>c.start())));
  const c=receivers[0],a=actors[0];
  const extra=event(f,a,f.attendees[0],101,{kind:'reread',reason:'架空：再入場'});
  await c.offline();ok(await send([extra],a.device.token));
  await Promise.all(receivers.slice(1).map(x=>waitRecords(x,601)));
  assert.equal(c.journal.snapshot().records.size,600);await c.online();await waitRecords(c,601);
  report('L-offline-reconnect',{receivedAfterNetworkRecovery:true,serverSnapshotsOnlyApplied:true});
  await c.stop();const stopped={...c.stats};
  const next=event(f,a,f.attendees[1],102);ok(await send([next],a.device.token));
  await Promise.all(receivers.slice(1).map(x=>waitRecords(x,602)));await c.idle();
  assert.equal(c.journal.snapshot().records.size,601);assert.equal(c.stats.applied,stopped.applied);
  await within(c.start());await waitRecords(c,602);
  report('L-stop-resume',{detachedListener:true,unchangedQueryResubscribed:true,fullResultReconnectionBudgetRequired:true});
  const role=await getOwner(pub(f,'roles/'+a.person.uid));
  await seedMany([[pub(f,'roles/'+a.person.uid),{...role,active:false,revision:2}]]);
  await until(()=>c.state().failure);assert.equal(c.state().failure.code,'permission-denied');assert.equal(c.state().running,false);
  const retained=c.journal.snapshot().records.size;assert.equal(retained,602);
  await seedMany([[pub(f,'roles/'+a.person.uid),role]]);await within(c.start());
  report('L-dependent-role-revocation',{listenerRejectedWithoutNewReceipt:true,localRecordsRetained:true,serverSecurityOnlyEmulator:true});
  const control=await getOwner(pub(f,'control/current'));
  await seedMany([[pub(f,'control/current'),{...control,state:'preparing',revision:2}]]);
  await Promise.all(receivers.map(x=>until(()=>x.state().failure)));
  assert(receivers.every(x=>x.state().failure.code==='permission-denied'));
  await seedMany([[pub(f,'control/current'),control]]);await within(Promise.all(receivers.map(x=>x.start())));
  report('L-dependent-stop',{allListenersRejectedWithoutNewReceipt:true,lateArrivalFlowNotTested:true});
  const failedJournal=memoryJournal(f.show,a.device.uid,a.person.uid);
  const saving=await watchClient(f.show,a,failedJournal);clients.push(saving);await within(saving.start());
  const before=failedJournal.snapshot();failedJournal.failNext();
  const last=event(f,a,f.attendees[2],103);ok(await send([last],a.device.token));
  await until(()=>saving.state().failure);assert.equal(saving.state().running,false);
  assert.deepEqual(failedJournal.snapshot(),before);
  await within(saving.start());await waitRecords(saving,603);
  report('L-local-save-failure',{cursorNotAdvanced:true,previousRecordsRetained:true,explicitRestartRecovers:true,realIndexedDBNotTested:true});
  const boundaryJournal=memoryJournal(f.show,actors[1].device.uid,actors[1].person.uid);
  const boundary=await watchClient(f.show,actors[1],boundaryJournal);clients.push(boundary);
  await within(boundary.start());await boundary.stop();
  const at='2026-10-12T00:00:00.123456789Z';
  const equalTime=events.slice(10,13).map((e,i)=>({...e,eventId:randomUUID(),sequence:1000+i,receivedAt:{$timestamp:at}}));
  // 同時刻のサーバー応答境界だけは架空のowner投入で再現する。
  await seedMany(equalTime.map(e=>[pub(f,'receiptEvents/'+e.eventId),e]));await within(boundary.start());await waitRecords(boundary,606);
  assert(equalTime.every(e=>boundaryJournal.snapshot().records.has(e.eventId)));
  report('L-equal-timestamp-boundary',{fixedQueryPreservesAllIds:true,ownerInjectedTimestamp:true});
  const wrong=await watchClient(randomUUID(),a,memoryJournal('FAKE-mismatch',a.device.uid,a.person.uid)).catch(e=>e);
  assert(wrong instanceof Error);report('L-scope-mismatch');
  const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);
  fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
  fs.writeFileSync(new URL('artifacts/watch-summary.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes,reports,
    productionFreeTierVerified:false,normalRegistrationVerified:false,realDeviceVerified:false,
    durableJournalVerified:false,sharingLatencyRequirementVerified:false,wireBytesMeasured:false,
    sdkAuthRefreshVerified:false,historicalDirectApiSecurityVerified:false,tested3000:false},null,2)+'\n');
}catch(error){
  fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
  fs.writeFileSync(new URL('artifacts/failed-'+Date.now()+'.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes:hashes(),reports,
    error:{message:error.message,code:error.code??null},clients:clients.map(c=>({state:c.state(),records:c.journal.snapshot().records.size,
      stats:{...c.stats}}))},null,2)+'\n');throw error;
}finally{for(const c of clients)await c.close();}
