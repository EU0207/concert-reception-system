import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fixture,seedMany,pub,getOwner} from '../GD91-75/fixtures.mjs';
import {reader} from '../GD91-73/tests/support.mjs';
import {base,request,fields,ok,data} from '../GD91-60/tests/transport.mjs';
import {readerClient} from '../GD91-75/read-client.mjs';
import {assemble} from '../GD91-75/projection.mjs';
import {cachedReader} from '../GD91-76/cached-reader.mjs';
import {event,eventWrite,eventPath,send,inspect,memoryJournal,deltaClient,derive,sameEvent} from './receipt-client.mjs';

const paths=['validate.mjs','receipt-client.mjs','receipt.rules','generate.mjs','node_modules/.cache/firestore.rules',
  '../GD91-73/node_modules/.cache/firestore.rules','../GD91-75/fixtures.mjs','../GD91-75/read-client.mjs',
  '../GD91-75/projection.mjs','../GD91-76/cached-reader.mjs','../GD91-73/tests/support.mjs',
  '../GD91-72/tests/support.mjs','../GD91-60/tests/transport.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(
  fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),reports=[];
const report=(id,details={})=>{reports.push({id,status:'passed',...details});console.log(JSON.stringify(reports.at(-1)));};
const root=base.slice(base.indexOf('/projects/')+1);
async function build(n){
  const f=await fixture(n),actors=[f.reader];
  for(let i=1;i<6;i++)actors.push(await reader(f));
  await seedMany(f.attendees.map(id=>[pub(f,'tickets/'+id),{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,
    attendeeId:id,cycleClosed:false,activeCredentialId:randomUUID(),credentialVersion:1}]));
  const receivers=actors.map(a=>deltaClient(f.show,a,memoryJournal(f.show,a.device.uid,a.person.uid)));
  let saved=null;
  const store={load:async()=>structuredClone(saved),save:async(c,entries,{expectedVersion})=>{
    assert.equal(saved?.version??0,expectedVersion);saved={version:expectedVersion+1,entries:structuredClone(entries)};return{version:saved.version};}};
  const core=readerClient({performanceId:f.show,humanUid:actors[0].person.uid,deviceUid:actors[0].device.uid,token:actors[0].device.token});
  const cached=cachedReader(core,store);
  function projection(records){
    const statuses=new Map(derive(records).map(e=>[e.attendeeId,e.status]));
    return assemble({session:work=>cached.session(many=>work(async refs=>{
      if(refs.length&&refs.every(r=>r.kind==='publication'&&r.path.startsWith('receptionRecords/')))
        return refs.map(r=>({status:statuses.get(r.path.split('/')[1])??'notReceived'}));
      return many(refs);
    }))});
  }
  return{f,actors,receivers,core,projection};
}
async function denied(events,token){const r=await send(events,token);assert.equal(r.status,403);return r;}
try{
  let sample;
  for(const n of[600,1000]){
    const o=await build(n),{f,actors,receivers}=o;
    const empty=await o.projection(new Map());assert.equal(empty.counts.received,0);
    const before={...o.core.stats};
    await o.projection(new Map());
    const warm={requests:o.core.stats.requests-before.requests,documents:o.core.stats.requestedDocuments-before.requestedDocuments};
    const events=f.attendees.map((id,i)=>event(f,actors[i%6],id,Math.floor(i/6)+1));
    let requests=0,writes=0;
    await Promise.all(actors.map(async(a,i)=>{
      const mine=events.filter(e=>e.deviceUid===a.device.uid);
      for(let j=0;j<mine.length;j+=3){const group=mine.slice(j,j+3);ok(await send(group,a.device.token));requests++;writes+=group.length;}
    }));
    const states=await Promise.all(receivers.map(c=>c.sync())),expected=derive(states[0].records);
    assert.equal(expected.length,n);assert(expected.every(e=>e.status==='received'));
    for(const s of states){assert.equal(s.records.size,n);assert.deepEqual(derive(s.records),expected);}
    const projected=await o.projection(states[0].records);assert.equal(projected.counts.received,n);assert.equal(projected.counts.assigned,n);
    const previous=receivers.map(c=>c.stats.documents);
    await Promise.all(receivers.map(c=>c.sync()));
    const overlapReads=receivers.map((c,i)=>c.stats.documents-previous[i]);
    assert(overlapReads.every(x=>x>=0&&x<=3),'completed-watermark-avoids-full-refetch');
    assert.equal(writes,n);
    report('R-'+n,{people:n,normalReceiptWrites:writes,normalWriteRequests:requests,
      independentHumans:new Set(actors.map(a=>a.person.uid)).size,independentDevices:new Set(actors.map(a=>a.device.uid)).size,
      receivedByEach:states.map(s=>s.records.size),warmGeometry:warm,overlapReads,
      legacyPersonStatusRequests:0,normalRegistrationAndTicketIssuingVerified:false,
      browserStorageAndTimingVerified:false});
    if(n===600)sample={...o,events};
  }
  const {f,actors,receivers,events}=sample,a=actors[0],id=f.attendees[0];
  const e=event(f,a,id,101);
  ok(await send([e],a.device.token)); // 受理後の応答を利用しない。
  assert.equal((await inspect(e,a.device.token)).state,'committed');
  const duplicate=await send([e],a.device.token);assert([403,409].includes(duplicate.status));
  assert.equal((await inspect(e,a.device.token)).state,'committed');
  assert.equal((await inspect({...e,observedAt:{$timestamp:'2000-01-01T00:00:00Z'}},a.device.token)).state,'id-conflict');
  report('R-lost-response',{sameIdResult:true,observedAtCompared:true,noDuplicateCreate:true});
  await denied([event(f,a,id,102,{humanUid:actors[1].person.uid})],a.device.token);report('R-forged-human');
  await denied([event(f,a,id,102,{deviceUid:actors[1].device.uid})],a.device.token);report('R-forged-device');
  await denied([event(f,a,id,102,{attendeeId:randomUUID()})],a.device.token);report('R-unknown-ticket');
  await denied([event(f,a,id,102,{credentialVersion:0})],a.device.token);report('R-old-credential');
  await denied([event(f,a,id,102,{buyerName:'架空の購入者'})],a.device.token);report('R-extra-personal-field');
  await denied([event(f,a,id,102,{kind:'reread',reason:' '})],a.device.token);report('R-reread-without-reason');
  const valid=event(f,a,id,102),invalid=event(f,a,id,103,{humanUid:'FAKE-wrong'});
  await denied([valid,invalid],a.device.token);assert.equal((await inspect(valid,a.device.token)).state,'absent');
  report('R-atomic-subset',{validWriteNotPartiallyCommitted:true});
  const name=root+'/'+eventPath(f.show,e.eventId);
  for(const writes of [[{update:{name,fields:fields({...e,reason:'changed'})},currentDocument:{exists:true}}],[{delete:name,currentDocument:{exists:true}}]])
    assert.equal((await request(base+':commit',a.device.token,'POST',{writes})).status,403);
  report('R-immutable-event');
  const other=await build(10);
  assert.equal((await request(base+'/'+eventPath(f.show,e.eventId),other.actors[0].device.token)).status,403);
  await assert.rejects(()=>deltaClient(f.show,other.actors[0],memoryJournal(f.show,other.actors[0].device.uid,other.actors[0].person.uid)).sync());
  report('R-cross-performance');
  const role=await getOwner(pub(f,'roles/'+a.person.uid));
  await seedMany([[pub(f,'roles/'+a.person.uid),{...role,active:false,revision:2}]]);
  await denied([event(f,a,id,102)],a.device.token);await assert.rejects(()=>receivers[0].sync());
  await seedMany([[pub(f,'roles/'+a.person.uid),role]]);report('R-revoked');
  const partial=memoryJournal(f.show,a.device.uid,a.person.uid),interrupted=deltaClient(f.show,a,partial,{pageSize:100});
  let stopped=false;
  await assert.rejects(()=>interrupted.sync({afterPage:async()=>{if(!stopped){stopped=true;
    await seedMany([[pub(f,'roles/'+a.person.uid),{...role,active:false,revision:2}]]);}}}));
  assert.equal(partial.snapshot().records.size,100);
  await seedMany([[pub(f,'roles/'+a.person.uid),role]]);await interrupted.sync();assert.equal(partial.snapshot().records.size,601);
  report('R-revoked-between-pages',{latestAuthorityCheckedOnEachPage:true,partialCursorResumes:true});
  const control=await getOwner(pub(f,'control/current'));
  await seedMany([[pub(f,'control/current'),{...control,state:'preparing',revision:2}]]);
  await denied([event(f,a,id,102)],a.device.token);await assert.rejects(()=>receivers[0].sync());
  await seedMany([[pub(f,'control/current'),control]]);report('R-stopped',{lateArrivalRouteNotTested:true});
  const journal=memoryJournal(f.show,a.device.uid,a.person.uid),c=deltaClient(f.show,a,journal,{pageSize:2});journal.failNext();
  await assert.rejects(()=>c.sync());assert.equal(journal.snapshot().cursor,null);assert.equal(journal.snapshot().records.size,0);
  const full=await c.sync();assert.equal(full.records.size,601);report('R-save-before-cursor',{injectedFailure:true,realIndexedDBNotTested:true});
  const restart=deltaClient(f.show,a,journal,{pageSize:2});await restart.sync();assert.equal(journal.snapshot().records.size,601);
  report('R-cursor-restart',{sameTimestampInclusive:true,processRestartNotTested:true});
  const snapshot=memoryJournal(f.show,actors[1].device.uid,actors[1].person.uid),race=deltaClient(f.show,actors[1],snapshot,{pageSize:100});
  let added;
  await race.sync({afterPage:async()=>{if(!added){added=event(f,actors[1],f.attendees[1],101,{kind:'reread',reason:'架空：再入場確認'});ok(await send([added],actors[1].device.token));}}});
  assert(!snapshot.snapshot().records.has(added.eventId));await race.sync();assert(snapshot.snapshot().records.has(added.eventId));
  report('R-arrival-during-pages',{timestampUpperBoundAndNextSync:true});
  const conflicts=derive(new Map([[events[0].eventId,events[0]],[e.eventId,e]]));assert.equal(conflicts[0].status,'conflict');
  assert.deepEqual(derive(new Map([[e.eventId,e],[events[0].eventId,events[0]]])),conflicts);
  assert.throws(()=>derive(new Map([[events[0].eventId,events[0]],['FAKE-duplicate',{...events[0],eventId:randomUUID()}]])));
  report('R-conflict-derivation',{bothInitialEventsRetained:true,arrivalOrderIndependent:true,sequenceCollisionDetected:true});
  const concurrentJournal=memoryJournal(f.show,a.device.uid,a.person.uid),concurrent=deltaClient(f.show,a,concurrentJournal);
  const first=concurrent.sync(),second=concurrent.sync();assert.equal(first,second);await Promise.all([first,second]);
  assert.equal(concurrentJournal.snapshot().records.size,602);assert.equal(concurrent.stats.queries,7);
  report('R-concurrent-sync',{singleInFlightQueryChain:true});
  assert.throws(()=>deltaClient(f.show,{...a,person:actors[1].person},concurrentJournal));
  report('R-journal-scope',{differentHumanCannotReuseJournal:true});
  assert(sameEvent(events[0],structuredClone(events[0])));assert(!sameEvent(events[0],{...events[0],sequence:999}));
  const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);
  fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
  fs.writeFileSync(new URL('artifacts/receipt-summary.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes,reports,
    productionFreeTierVerified:false,normalRegistrationVerified:false,realDeviceVerified:false,timingVerified:false,tested3000:false,
    historicalReadSelectorUsed:false,historicalDirectApiSecurityVerified:false},null,2)+'\n');
}catch(error){
  fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
  fs.writeFileSync(new URL('artifacts/failed-'+Date.now()+'.json',import.meta.url),JSON.stringify({sourceHashes,reports,
    error:{name:error.name,message:String(error.message).slice(0,350)}},null,2)+'\n');throw error;
}
