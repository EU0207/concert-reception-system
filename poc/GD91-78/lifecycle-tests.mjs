import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fixture,seedMany,pub,getOwner} from '../GD91-75/fixtures.mjs';
import {reader} from '../GD91-73/tests/support.mjs';
import {ok} from '../GD91-60/tests/transport.mjs';
import {event,send,memoryJournal} from '../GD91-77/receipt-client.mjs';
import {watchClient} from './watch-client.mjs';
const paths=['lifecycle-tests.mjs','watch-client.mjs','node_modules/.cache/firestore.rules','../GD91-77/receipt-client.mjs',
  '../GD91-75/fixtures.mjs','../GD91-72/sdk-adapter.mjs','../GD91-73/tests/support.mjs',
  '../GD91-72/tests/support.mjs','../GD91-60/tests/transport.mjs','../POC-001/node_modules/@firebase/firestore/dist/index.node.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),reports=[],clients=[];
const report=(id,details={})=>{reports.push({id,status:'passed',...details});console.log(JSON.stringify(reports.at(-1)));};
async function until(test){const end=Date.now()+15000;while(!test()){assert(Date.now()<end,'observation-timeout');await new Promise(r=>setTimeout(r,20));}}
async function within(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('operation-timeout')),15000);})]);}finally{clearTimeout(timer);}}
async function received(c,n){await until(()=>c.journal.snapshot().records.size===n||c.state().failure);assert.equal(c.state().failure,null);await c.idle();}
try{
  const f=await fixture(10),actors=[f.reader];for(let i=1;i<6;i++)actors.push(await reader(f));
  await seedMany(f.attendees.map(id=>[pub(f,'tickets/'+id),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
    attendeeId:id,cycleClosed:false,activeCredentialId:randomUUID(),credentialVersion:1}]));
  const receivers=[];for(const a of actors){const c=await watchClient(f.show,a,memoryJournal(f.show,a.device.uid,a.person.uid));clients.push(c);receivers.push(c);}
  await within(Promise.all(receivers.map(c=>c.start())));
  const events=f.attendees.map((id,i)=>event(f,actors[i%6],id,Math.floor(i/6)+1));
  await within(Promise.all(receivers.map((c,i)=>c.send(events.filter(e=>e.deviceUid===actors[i].device.uid)))));
  await Promise.all(receivers.map(c=>received(c,10)));
  const c=receivers[0],a=actors[0],extra=event(f,a,f.attendees[0],101,{kind:'reread',reason:'架空：再入場'});
  await c.offline();ok(await send([extra],a.device.token));await Promise.all(receivers.slice(1).map(x=>received(x,11)));
  assert.equal(c.journal.snapshot().records.size,10);await c.online();await received(c,11);
  report('S-offline-reconnect',{fixturePeople:10,serverConfirmedOnly:true});
  await c.stop();const stopped=c.stats.applied,next=event(f,a,f.attendees[1],102);
  ok(await send([next],a.device.token));await Promise.all(receivers.slice(1).map(x=>received(x,12)));
  assert.equal(c.journal.snapshot().records.size,11);assert.equal(c.stats.applied,stopped);await within(c.start());await received(c,12);
  report('S-stop-resume',{detached:true,unchangedQueryResubscribed:true});
  const role=await getOwner(pub(f,'roles/'+a.person.uid));
  await seedMany([[pub(f,'roles/'+a.person.uid),{...role,active:false,revision:2}]]);
  await until(()=>c.state().failure);assert.equal(c.state().failure.code,'permission-denied');assert.equal(c.state().running,false);
  assert.equal(c.journal.snapshot().records.size,12);await seedMany([[pub(f,'roles/'+a.person.uid),role]]);await within(c.start());
  report('S-dependent-role-revocation',{rejectedWithoutNewReceipt:true,localRecordsRetained:true});
  const control=await getOwner(pub(f,'control/current'));
  await seedMany([[pub(f,'control/current'),{...control,state:'preparing',revision:2}]]);
  await Promise.all(receivers.map(x=>until(()=>x.state().failure)));assert(receivers.every(x=>x.state().failure.code==='permission-denied'));
  await seedMany([[pub(f,'control/current'),control]]);await within(Promise.all(receivers.map(x=>x.start())));
  report('S-dependent-stop',{allSixRejectedWithoutNewReceipt:true,lateArrivalNotTested:true});
  const journal=memoryJournal(f.show,a.device.uid,a.person.uid),saving=await watchClient(f.show,a,journal);clients.push(saving);await within(saving.start());
  const before=journal.snapshot();journal.failNext();const last=event(f,a,f.attendees[2],103);ok(await send([last],a.device.token));
  await until(()=>saving.state().failure);assert.equal(saving.state().running,false);assert.deepEqual(journal.snapshot(),before);
  await within(saving.start());await received(saving,13);
  report('S-local-save-failure',{previousRecordsRetained:true,explicitRestartRecovers:true,realIndexedDBNotTested:true});
  const boundary=await watchClient(f.show,actors[1],memoryJournal(f.show,actors[1].device.uid,actors[1].person.uid));clients.push(boundary);await within(boundary.start());await boundary.stop();
  const equalTime=events.slice(0,3).map((e,i)=>({...e,eventId:randomUUID(),sequence:1000+i,receivedAt:{$timestamp:'2026-10-12T00:00:00.123456789Z'}}));
  await seedMany(equalTime.map(e=>[pub(f,'receiptEvents/'+e.eventId),e]));await within(boundary.start());await received(boundary,16);
  assert(equalTime.every(e=>boundary.journal.snapshot().records.has(e.eventId)));report('S-equal-timestamp',{ownerInjectedTimestamp:true,idsRetained:3});
  await assert.rejects(()=>watchClient(randomUUID(),a,memoryJournal('FAKE-mismatch',a.device.uid,a.person.uid)));
  report('S-scope-mismatch');
  const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);
  fs.writeFileSync(new URL('artifacts/lifecycle-summary.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes,reports,
    fixturePeople:10,productionFreeTierVerified:false,durableJournalVerified:false,historicalDirectApiSecurityVerified:false,tested3000:false},null,2)+'\n');
}catch(error){fs.writeFileSync(new URL('artifacts/failed-lifecycle-'+Date.now()+'.json',import.meta.url),JSON.stringify({sourceHashes,reports,error:{message:error.message,code:error.code??null}},null,2)+'\n');throw error;}
finally{for(const c of clients)await c.close();}
