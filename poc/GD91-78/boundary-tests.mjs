import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture,seedMany,pub} from '../GD91-75/fixtures.mjs';
import {base,request} from '../GD91-60/tests/transport.mjs';
import {event,memoryJournal} from '../GD91-77/receipt-client.mjs';
import {watchClient,windowLimit} from './watch-client.mjs';
const paths=['boundary-tests.mjs','watch-client.mjs','node_modules/.cache/firestore.rules',
  '../GD91-77/receipt-client.mjs','../GD91-75/fixtures.mjs','../GD91-60/tests/transport.mjs',
  '../GD91-72/sdk-adapter.mjs','../POC-001/node_modules/@firebase/firestore/dist/index.node.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),reports=[],clients=[];
const report=(id,details={})=>{reports.push({id,status:'passed',...details});console.log(JSON.stringify(reports.at(-1)));};
async function until(test){const end=Date.now()+60000;while(!test()){assert(Date.now()<end,'observation-timeout');await new Promise(r=>setTimeout(r,20));}}
try{
  const f=await fixture(10),a=f.reader,journal=memoryJournal(f.show,a.device.uid,a.person.uid);
  const c=await watchClient(f.show,a,journal);clients.push(c);await c.start();
  await seedMany([[pub(f,'tickets/'+f.attendees[0]),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
    attendeeId:f.attendees[0],cycleClosed:false,activeCredentialId:'FAKE-credential',credentialVersion:1}]]);
  const e=event(f,a,f.attendees[0],1);await c.send([e]);await until(()=>journal.snapshot().records.size===1);
  await assert.rejects(()=>c.send([e]),error=>error.code==='permission-denied');
  assert.equal(journal.snapshot().records.size,1);report('B-sdk-duplicate-create');
  const good=event(f,a,f.attendees[0],2),bad=event(f,a,f.attendees[0],3,{humanUid:'FAKE-wrong'});
  await assert.rejects(()=>c.send([good,bad]),error=>error.code==='permission-denied');
  const absent=await request(base+'/'+pub(f,'receiptEvents/'+good.eventId),a.device.token);assert.equal(absent.status,404);
  report('B-sdk-atomic-denial',{validSubsetNotCommitted:true});
  const other=await fixture(10),foreign=await watchClient(other.show,a,memoryJournal(other.show,a.device.uid,a.person.uid));clients.push(foreign);
  await assert.rejects(()=>foreign.start(),error=>error.code==='permission-denied');report('B-cross-performance');
  await c.stop();const before=journal.snapshot();
  const fillers=Array.from({length:windowLimit-1},(_,i)=>event(f,a,f.attendees[0],i+2,
    {kind:'reread',reason:'架空：購読上限の境界試験',receivedAt:{$timestamp:'2026-10-12T00:00:00Z'}}));
  await seedMany(fillers.map(x=>[pub(f,'receiptEvents/'+x.eventId),x]));
  await assert.rejects(()=>c.start(),/watch-window-saturated/);assert.deepEqual(journal.snapshot(),before);
  report('B-saturation',{fixturePeople:10,ownerInjectedEvents:windowLimit-1,totalEvents:windowLimit,
    previousRecordsRetained:true,fullSuccessNotReported:true,notAPersonCapacityTest:true});
  const excessive=await request(base+'/publicationShows/'+f.show+':runQuery',a.device.token,'POST',
    {structuredQuery:{from:[{collectionId:'receiptEvents'}],limit:windowLimit+1}});
  assert.equal(excessive.status,403);report('B-rules-query-limit');
  const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);
  fs.writeFileSync(new URL('artifacts/boundary-summary.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes,reports,
    productionLimitsVerified:false,tested3000:false},null,2)+'\n');
}catch(error){
  fs.writeFileSync(new URL('artifacts/failed-boundary-'+Date.now()+'.json',import.meta.url),JSON.stringify({sourceHashes,reports,
    error:{message:error.message,code:error.code??null}},null,2)+'\n');throw error;
}finally{for(const c of clients)await c.close();}
