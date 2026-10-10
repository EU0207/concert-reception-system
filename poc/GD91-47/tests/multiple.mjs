import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import * as construction from './staging.mjs';
import * as publication from './publication.mjs';

export async function multipleCases(record,{add,emit,payload,candidateWrite,noCandidate,published,getLarge}){
 await record('M01','another prepared section preserves the published section and assignments',async()=>{
  const a=await add(),b=await add(a.pub);await published(a);
  const mapping=structuredClone(a.pub.assignment.assignments),seat=a.pub.versions.seatIds[0];mapping[seat]=a.pub.people[0];
  await publication.save(a.pub,publication.probe(a.pub,mapping));
  await publication.seed(a.pub,'ticketProtection/current',{schemaVersion:1,environmentId:'FAKE-environment',performanceId:a.pub.show,revision:1,seatIds:[seat]});
  const before=structuredClone(a.pub.versions),old=structuredClone(a.pub.assignment);
  const m=await emit(b),p=await publication.proposal(a.pub,b.entry);await publication.save(a.pub,p);
  for(const[id,g]of Object.entries(before.sections))assert.equal(a.pub.versions.sections[id],g);
  for(const[id,value]of Object.entries(old.assignments))assert.equal(a.pub.assignment.assignments[id],value);
  assert.equal(Object.keys(a.pub.versions.sections).length,2);assert.equal(a.pub.versions.sections[m.sectionId],m.generation);
  assert.equal(a.pub.assignment.revision,old.revision+1);return{sections:2,assignedAndProtectedSeatPreserved:true};
 });
 await record('M02','concurrent section additions reject the stale plan and can be replanned',async()=>{
  const a=await add();await published(a);const b=await add(a.pub),c=await add(a.pub);await emit(b);await emit(c);
  const plans=await Promise.all([b,c].map(f=>publication.proposal(a.pub,f.entry)));
  const results=await Promise.all(plans.map(p=>publication.commit(a.pub,publication.writes(a.pub,p))));
  assert(results.every(r=>[200,403,409].includes(r.status)),JSON.stringify(results));let recovered=false;
  if(results.every(r=>r.status!==200)){publication.ok(await publication.commit(a.pub,publication.writes(a.pub,plans[0])));recovered=true;}
  else assert.equal(results.filter(r=>r.status===200).length,1);
  const state=publication.data(await publication.get(a.pub,'versions/current')),winner=plans.find(p=>p.id===state.operationId),loser=plans.find(p=>p.id!==state.operationId);
  assert(winner&&loser);assert.equal((await publication.get(a.pub,'operations/'+loser.id)).status,404);
  await publication.accept(a.pub,winner);await publication.reject(a.pub,loser);
  const retry=await publication.proposal(a.pub,loser.entry);await publication.save(a.pub,retry);
  assert.equal(Object.keys(a.pub.versions.sections).length,3);return{completeWinners:1,replannedSections:3,lockAbortRecovery:recovered};
 });
 await record('M03','source head must match its section namespace even with valid authorization',async()=>{
  const f=await add(null,{initialize:false}),wrong={...f.stage,namespace:randomUUID()};
  await construction.seed(wrong,'control/current',construction.data(await construction.get(f.stage,'control/current')));
  construction.denied(await construction.commit(wrong,construction.startWrites(wrong)));
  assert.equal((await construction.get(wrong,'head/current')).status,404);
  await construction.initialize(f.stage);await published(f);return{authorizedNamespaceMismatchDenied:true};
 });
 await record('M04','candidate cannot attach one generation to another section',async()=>{
  const a=await add(),b=await add(a.pub),m=await payload(a);m.sectionId=b.stage.head.sectionId;
  await noCandidate(a,m);assert.equal((await publication.get(a.pub,'candidates/'+a.entry.generation)).status,404);
  await published(a);await published(b);return{crossSectionCandidateDenied:true};
 });
 await record('M05','publication rejects foreign cell identity despite local construction validity',async()=>{
  const a=await add();await published(a);const b=await add(a.pub,{initialize:false});
  b.stage.model.section.cells[0].cellId=a.stage.model.section.cells[0].cellId;
  b.stage.chunks=construction.pack(b.stage.model,b.stage.head.chunkSize,construction.context);
  await construction.initialize(b.stage);await emit(b);
  await publication.reject(a.pub,await publication.proposal(a.pub,b.entry));
  assert.equal(Object.keys(a.pub.versions.sections).length,1);return{foreignIdentityPublicationDenied:true};
 });
 await record('M06','an empty section retains all five hundred assignments and their revision',async()=>{
  const a=await getLarge();assert(a);assert.equal(a.pub.people.length,500);
  const mapping=Object.fromEntries(a.pub.versions.seatIds.map((id,i)=>[id,a.pub.people[i]]));
  await publication.save(a.pub,publication.probe(a.pub,mapping));const old=structuredClone(a.pub.assignment);
  const b=await add(a.pub,{empty:true});await published(b);
  assert.deepEqual(a.pub.assignment.assignments,old.assignments);assert.equal(a.pub.assignment.revision,old.revision);
  assert.equal(a.pub.assignment.operationId,old.operationId);assert.notEqual(a.pub.assignment.publicationOperationId,old.publicationOperationId);
  return{people:500,assignmentValuesAndRevisionUnchanged:true,publicationWrites:3};
 });
 await record('M07','adding seats retains all five hundred occupied seats and prior sections',async()=>{
  const a=await getLarge();
  if(!Object.values(a.pub.assignment.assignments).filter(Boolean).length)await publication.save(a.pub,publication.probe(a.pub,Object.fromEntries(a.pub.versions.seatIds.map((id,i)=>[id,a.pub.people[i]]))));
  const old=structuredClone(a.pub.assignment),before=structuredClone(a.pub.versions);
  const b=await add(a.pub,{rows:1,columns:2,allSeats:true});await published(b);
  for(const[id,value]of Object.entries(old.assignments))assert.equal(a.pub.assignment.assignments[id],value);
  for(const[id,g]of Object.entries(before.sections))assert.equal(a.pub.versions.sections[id],g);
  assert.equal(Object.values(a.pub.assignment.assignments).filter(Boolean).length,500);
  assert.equal(Object.keys(a.pub.assignment.assignments).length,502);
  return{people:500,seats:502,otherSectionsPreserved:true};
 });
 await record('M08','sealing one section does not freeze another preparation',async()=>{
  const a=await add(),b=await add(a.pub);await emit(a);
  await construction.reject(a.stage,construction.slideWrites(a.stage,construction.movement(a.stage)));
  await construction.publishSlide(b.stage);assert.equal(construction.data(await construction.get(a.stage,'head/current')).revision,1);
  assert.equal(construction.data(await construction.get(b.stage,'head/current')).revision,2);
  await noCandidate(b,await payload(b));await publication.save(a.pub,await publication.proposal(a.pub,a.entry));
  return{sourceSealLimitedToSection:true};
 });
 await record('M09','a common role revision change stops preparation in every section',async()=>{
  const a=await add(null,{initialize:false}),b=await add(a.pub,{initialize:false});
  await construction.start(a.stage);await construction.start(b.stage);
  const path='roles/'+a.pub.human.uid,role=publication.data(await publication.get(a.pub,path));
  await publication.seed(a.pub,path,{...role,revision:role.revision+1});
  for(const f of [a,b]){
   const chunk=f.stage.chunks[0];construction.denied(await construction.commit(f.stage,construction.stageWrites(f.stage,chunk)));
   assert.equal(construction.data(await construction.get(f.stage,'head/current')).cursor,0);
  }
  assert.deepEqual(publication.data(await publication.get(a.pub,'versions/current')).sections,{});
  return{revokedSections:2,preparationStopped:true};
 });
 await record('M10','section preparations do not create duplicate authorization records',async()=>{
  const a=await add(),b=await add(a.pub);
  for(const f of [a,b])for(const path of ['roles/'+f.pub.human.uid,'devices/'+f.pub.owner.uid,'sessions/'+f.pub.owner.uid]){
   const r=await construction.request(construction.base+'/preparedSeatShows/'+f.pub.show+'/sections/'+f.stage.head.sectionId+'/'+path,'owner');assert.equal(r.status,404);
  }
  await published(a);await published(b);return{duplicateAuthorizationDocuments:0};
 });
}
