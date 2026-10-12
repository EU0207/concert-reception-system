import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fixture,seedMany,pub} from '../GD91-75/fixtures.mjs';
import {ok} from '../GD91-60/tests/transport.mjs';
import {event,send,memoryJournal} from '../GD91-77/receipt-client.mjs';
import {watchClient} from '../GD91-78/watch-client.mjs';
const paths=['regression.mjs','../GD91-78/watch-client.mjs','../GD91-78/node_modules/.cache/firestore.rules','../GD91-77/receipt-client.mjs','../GD91-75/fixtures.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),reports=[],clients=[];
async function until(test){const end=Date.now()+10000;while(!test()){assert(Date.now()<end,'observation-timeout');await new Promise(r=>setTimeout(r,20));}}
try{
  const f=await fixture(10),a=f.reader,j=memoryJournal(f.show,a.device.uid,a.person.uid),shown=[];
  await seedMany(f.attendees.slice(0,2).map(id=>[pub(f,'tickets/'+id),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
    attendeeId:id,cycleClosed:false,activeCredentialId:randomUUID(),credentialVersion:1}]));
  const c=await watchClient(f.show,a,j,{onApplied:p=>{shown.push(p);}});clients.push(c);await c.start();
  ok(await send([event(f,a,f.attendees[0],1)],a.device.token));await until(()=>j.snapshot().records.size===1);await c.idle();
  const before=j.snapshot(),count=shown.length;assert.equal(before.records.size,1);
  j.failNext();ok(await send([event(f,a,f.attendees[1],2)],a.device.token));
  await until(()=>c.state().failure);assert.equal(c.state().running,false);assert.deepEqual(j.snapshot(),before);assert.equal(shown.length,count);
  await c.start();await until(()=>j.snapshot().records.size===2);
  reports.push({id:'save-failure',status:'passed',previousRecordsRetained:1,recordsAfterRecovery:2,displayBeforeDurableSave:false,explicitRestartRecovers:true,realIndexedDB:false});
  await c.stop();const at='2026-10-12T00:00:00.123456789Z';
  const tied=[3,4,5].map(sequence=>({...event(f,a,f.attendees[0],sequence),receivedAt:{$timestamp:at}}));
  await seedMany(tied.map(e=>[pub(f,'receiptEvents/'+e.eventId),e]));await c.start();await until(()=>j.snapshot().records.size===5);
  assert(tied.every(e=>j.snapshot().records.has(e.eventId)));assert.equal(j.snapshot().cursor,null);
  reports.push({id:'equal-time',status:'passed',ownerInjected:true,distinctIdsRetained:3,cursorAdvanced:false});
  await assert.rejects(()=>watchClient(randomUUID(),a,memoryJournal('FAKE-mismatch',a.device.uid,a.person.uid)));
  reports.push({id:'scope-mismatch',status:'passed'});
}catch(e){reports.push({id:'unexpected-failure',status:'failed',message:e.message});process.exitCode=1;}
finally{for(const c of clients)await c.close();}
const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/regression.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes,reports,tested3000:false},null,2)+'\n');
console.log(JSON.stringify(reports));
