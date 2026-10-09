import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture,commit,update,get,data,ok,denied,createConflict,seed,start,startOnly,stage,stageWrites,stageAttributes,ensureNumbers,ingestion,ingestWrites,consume,ingest,fill,finish,completion,initialAssignment,initialVersions,finishWrites,initialize,movement,slideWrites,publishSlide,reject,assertCounts,resetCounts,context,projectView,slide,issue,sessionWrite,lineOperation,lineWrites} from './support.mjs';

const sources=['../firestore.rules','../firebase.json','emulator.mjs','support.mjs','../../GD91-16/codec.mjs','../../GD91-07/planner.mjs','../../GD91-08/slide.mjs','../../GD91-10/projection.mjs'];
const hash=async p=>createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex');
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,await hash(p)])));
const sourceHashes=await hashes(),reports=[];
async function record(id,label,action){const result=await action();reports.push({id,label,status:'passed',...result});console.log(`${id}: CHECKED ${label}`);}
const ready=async options=>{const f=await fixture(options);await start(f);await fill(f);return f;};
const assignment=async f=>data(await get(f,'assignmentState/current'));
function abortWrites(f){const id=randomUUID();return [update(f,'head/current',{status:'aborted',revision:1,operationId:id},['status','revision','operationId'],true),update(f,'events/'+id,{kind:'abortInitial',deviceUid:f.owner.uid,initializationId:f.generation,controlRevision:1},undefined,false),update(f,'selection/current',{...f.selection,revision:f.selection.revision+1,activeGeneration:'',operationId:id},undefined,true)];}

await record('C01','human-issued session connects real seat IDs to an empty assignment table',async()=>{
 const f=await ready(),o=completion(f);assert.equal((await get(f,'assignmentState/current')).status,404);resetCounts(f);await finish(f,o);assert.equal(f.counts.requests,1);assert.equal(f.counts.writes,5);
 const a=await assignment(f);assert.deepEqual(a,initialAssignment(f,o));assert.deepEqual(Object.keys(a.assignments).sort(),f.model.seats.map(x=>x.seatId).sort());assert.deepEqual(data(await get(f,'idRegistry/current')).seatIds,Object.fromEntries(f.model.seats.map(x=>[x.seatId,true])));assert.deepEqual(data(await get(f,'versions/current')),initialVersions(f,o));await assertCounts(f);
 return {publication:f.counts,seats:f.model.seats.length,assignmentNotSeeded:true,indexNotSeeded:true,sessionsNotSeeded:true};
});
await record('C02','all thirty proper subsets of the five-document publication are rejected',async()=>{
 const f=await ready(),o=completion(f),w=finishWrites(f,o);assert.equal(w.length,5);
 for(let mask=1;mask<31;mask++){await reject(f,w.filter((_,i)=>mask&(1<<i)));assert.equal((await get(f,'events/'+o.id)).status,404);assert.equal((await get(f,'assignmentState/current')).status,404);}
 await finish(f,o);return {partialSubsetsDenied:30};
});
await record('C03','shared version forgeries do not detach business versions from their source',async()=>{
 const f=await ready();let count=0;for(const mutate of [v=>v.schemaVersion=2,v=>v.environmentId='FAKE-other',v=>v.performanceId='FAKE-other',v=>v.sectionId=randomUUID(),v=>v.generation=randomUUID(),v=>v.operationId=randomUUID(),v=>v.extra=true,v=>v.values.extra=1,v=>delete v.values.ticket,...['commit','layout','source','assignment','attendee','ticket','control'].map(k=>v=>v.values[k]++),v=>v.values.assignment=0,v=>v.values.ticket='9']){const o=completion(f);o.versions=initialVersions(f,o);mutate(o.versions);await reject(f,finishWrites(f,o));count++;}await finish(f);return {versionForgeriesDenied:count};
});
await record('C04','initial assignments reject non-seat IDs omitted seats and nonempty values',async()=>{
 const f=await ready(),seat=f.model.seats[0].seatId,cell=f.model.section.cells[0].cellId,line=f.model.section.lineSettings[0].lineId;
 const changes=[a=>delete a.assignments[seat],...[cell,line,f.head.sectionId,randomUUID()].map(id=>a=>a.assignments[id]=''),a=>a.assignments[seat]='FAKE-person-0',a=>a.assignments[seat]=null,a=>a.assignments[seat]=true,a=>a.schemaVersion=2,a=>a.performanceId='FAKE-other',a=>a.environmentId='FAKE-other',a=>a.generation=randomUUID(),a=>a.operationId=randomUUID(),a=>a.revision=2,a=>a.extra=true,a=>delete a.assignments,a=>a.assignments=[]];
 for(const mutate of changes){const o=completion(f);o.assignment=initialAssignment(f,o);mutate(o.assignment);await reject(f,finishWrites(f,o));}await finish(f);return {assignmentForgeriesDenied:changes.length};
});
await record('C05','seat index deltas are tied to checked source fragments and retain prior seats',async()=>{
 const f=await fixture({columns:11});await start(f);await ingest(f);const c=f.chunks[1];await stage(f,c);await stageAttributes(f,c);await ensureNumbers(f,c);const old=Object.keys(f.registry.seatIds)[0],fresh=c.value.cells.find(x=>x.kind==='seat').seatId;
 const changes=[x=>delete x.registry.seatIds[fresh],x=>x.registry.seatIds[c.value.cells[0].cellId]=true,x=>x.registry.seatIds[f.head.sectionId]=true,x=>x.registry.seatIds[f.model.section.lineSettings[0].lineId]=true,x=>x.registry.seatIds[randomUUID()]=true,x=>x.registry.seatIds[fresh]=false,x=>delete x.registry.seatIds[old],x=>x.registry.seatIds[old]=false];
 for(const mutate of changes){const o=ingestion(f,c);mutate(o);await reject(f,ingestWrites(f,o));}await consume(f,ingestion(f,c));await fill(f);await finish(f);return {indexDeltaForgeriesDenied:changes.length};
});
await record('C06','line creation cannot predeclare seat IDs',async()=>{
 const f=await fixture();await startOnly(f);let o=lineOperation(f);o.registry.seatIds[randomUUID()]=true;await reject(f,lineWrites(f,o));o=lineOperation(f);ok(await commit(f,lineWrites(f,o)));f.catalog=o.catalog;f.registry=o.registry;
 const next=lineOperation(f);next.registry.seatIds[randomUUID()]=true;await reject(f,lineWrites(f,next));await fill(f);await finish(f);return {firstAndLaterLineIndexForgeriesDenied:2};
});
await record('C07','an all-unset layout publishes an empty assignment map without creating seats',async()=>{
 const f=await ready({empty:true});await finish(f);assert.deepEqual((await assignment(f)).assignments,{});assert.deepEqual(f.registry.seatIds,{});await reject(f,slideWrites(f,movement(f)));return {zeroSeatAssignmentValid:true,emptySlideDenied:true};
});
await record('C08','unfinished fragment ingestion cannot issue an assignment or a public version',async()=>{
 const f=await fixture();await start(f);await ingest(f);const o=completion(f);await reject(f,finishWrites(f,o));await fill(f);await finish(f);return {incompleteSourceDenied:true};
});
await record('C09','publication reads current attendee and ticket revisions instead of an independent version stub',async()=>{
 let count=0;for(const domain of ['attendee','ticket']){const f=await ready(),before=data(await get(f,domain+'State/current')),o=completion(f);await seed(f,domain+'State/current',{...before,revision:before.revision+1});await reject(f,finishWrites(f,o));f.businessRevisions[domain]++;await finish(f,o);assert.equal(data(await get(f,'versions/current')).values[domain],before.revision+1);count++;}return {currentBusinessHeadsChecked:count,independentReferenceVersionNotSeeded:true};
});
await record('C10','invalid business head scopes revisions and existing issued-seat references block first publication',async()=>{
 const f=await ready();let count=0;for(const domain of ['attendee','ticket']){const suffix=domain+'State/current',before=data(await get(f,suffix));for(const mutate of [x=>x.schemaVersion=2,x=>x.environmentId='FAKE-other',x=>x.performanceId='FAKE-other',x=>x.revision=0,x=>x.revision=-1,x=>x.revision='1',x=>delete x.revision]){const bad=structuredClone(before);mutate(bad);await seed(f,suffix,bad);await reject(f,finishWrites(f,completion(f)));await seed(f,suffix,before);count++;}}
 const before=data(await get(f,'ticketState/current'));await seed(f,'ticketState/current',{...before,issuedSeatIds:[f.model.seats[0].seatId]});await reject(f,finishWrites(f,completion(f)));await seed(f,'ticketState/current',before);await finish(f);return {invalidBusinessHeadsDenied:count,issuedSeatReferenceDenied:true};
});
await record('C11','ordinary clients cannot rewrite business prerequisites alone or alongside publication',async()=>{
 const f=await ready();for(const domain of ['attendee','ticket']){const suffix=domain+'State/current',b=data(await get(f,suffix)),w=update(f,suffix,{...b,revision:b.revision+1},undefined,true);await reject(f,[w]);await reject(f,[...finishWrites(f,completion(f)),w]);assert.deepEqual(data(await get(f,suffix)),b);}await finish(f);return {businessPiggybackVariantsDenied:4};
});
await record('C12','latest authority changes reject both publication and slide without changing the assignment',async()=>{
 const f=await ready();const mutations=[['roles/'+f.human.uid,'active',false],['roles/'+f.human.uid,'role','receptionist'],['roles/'+f.human.uid,'revision',2],['roles/'+f.human.uid,'endsAt',{$timestamp:'2000-01-01T00:00:00Z'}],['devices/'+f.owner.uid,'active',false],['devices/'+f.owner.uid,'preparedRoleRevision',2],['sessions/'+f.owner.uid,'active',false],['sessions/'+f.owner.uid,'humanUid',f.readerHuman.uid],['sessions/'+f.owner.uid,'environmentId','FAKE-other'],['sessions/'+f.owner.uid,'expiresAt',{$timestamp:'2000-01-01T00:00:00Z'}]];let count=0;
 for(const phase of ['initial','slide']){if(phase==='slide')await finish(f);for(const[suffix,key,value]of mutations){const b=data(await get(f,suffix));await seed(f,suffix,{...b,[key]:value});await reject(f,phase==='initial'?finishWrites(f,completion(f)):slideWrites(f,movement(f)));await seed(f,suffix,b);count++;}}await publishSlide(f);return {authorityVariantsDenied:count};
});
await record('C13','device-only publication rejects human anonymous outsiders and receptionist credentials',async()=>{
 const f=await ready();for(const token of [f.human.token,f.reader.token,null])await reject(f,finishWrites(f,completion(f)),token);await finish(f);return {wrongPrincipalsDenied:3};
});
await record('C14','unknown response is resolved from five persisted documents and cannot be reapplied',async()=>{
 const f=await ready(),o=completion(f),w=finishWrites(f,o);ok(await commit(f,w));assert.deepEqual(await assignment(f),initialAssignment(f,o));assert.deepEqual(data(await get(f,'versions/current')),initialVersions(f,o));assert.equal(data(await get(f,'head/current')).operationId,o.id);assert.deepEqual(data(await get(f,'events/'+o.id)),o.history);assert.equal(data(await get(f,'selection/current')).operationId,o.id);await reject(f,w,f.owner.token,createConflict);return {persistedResultDocuments:5,reapplicationDenied:true};
});
await record('C15','competing first publications produce one coherent assignment and one event',async()=>{
 const f=await ready(),a=completion(f),b=completion(f);b.history.deviceUid=f.other.uid;const rs=await Promise.all([commit(f,finishWrites(f,a)),commit(f,finishWrites(f,b),f.other.token)]);assert.equal(rs.filter(x=>x.status===200).length,1);createConflict(rs.find(x=>x.status!==200));const winner=rs[0].status===200?a:b,loser=winner===a?b:a;assert.equal((await assignment(f)).operationId,winner.id);assert.equal(data(await get(f,'versions/current')).operationId,winner.id);assert.equal((await get(f,'events/'+loser.id)).status,404);return {winners:1,noOrphanEvent:true};
});
await record('C16','publication racing with abort leaves all five documents or none of the published documents',async()=>{
 const f=await ready(),o=completion(f),rs=await Promise.all([commit(f,finishWrites(f,o)),commit(f,abortWrites(f))]);assert.equal(rs.filter(x=>x.status===200).length,1);createConflict(rs.find(x=>x.status!==200));const h=data(await get(f,'head/current')),a=await get(f,'assignmentState/current'),v=await get(f,'versions/current');if(h.status==='countReady'){ok(a);ok(v);assert.equal(data(a).operationId,o.id);}else{assert.equal(h.status,'aborted');assert.equal(a.status,404);assert.equal(v.status,404);}return {oneWinner:true,assignmentExistsExactlyWhenPublished:true};
});
await record('C17','an existing assignment cannot be replaced with an empty first-publication table',async()=>{
 const f=await ready(),o=completion(f),a=initialAssignment(f,o);a.assignments[f.model.seats[0].seatId]='FAKE-person-0';a.revision=4;await seed(f,'assignmentState/current',a);await reject(f,finishWrites(f,o),f.owner.token,createConflict);assert.deepEqual(await assignment(f),a);return {existingOccupiedAssignmentPreserved:true};
});
await record('C18','late publication and index ingestion are rejected after abort',async()=>{
 const f=await ready(),o=completion(f);ok(await commit(f,abortWrites(f)));await reject(f,finishWrites(f,o));const index=structuredClone(f.registry);index.seatIds[randomUUID()]=true;await reject(f,[update(f,'idRegistry/current',index,undefined,true)]);return {latePublicationAndIndexDenied:true};
});
await record('C19','another performance cannot borrow a device session for first publication',async()=>{
 const a=await fixture(),b=await ready();await reject(b,finishWrites(b,completion(b)),a.owner.token);await finish(b);return {crossPerformanceDenied:true};
});
await record('C20','both axes numbering orders and four slide directions retain the initial empty assignment and seat index',async()=>{
 let variants=0;for(const axis of ['horizontal','vertical'])for(const order of ['forward','reverse'])for(const direction of ['up','down','left','right']){const f=await ready({axis,order,direction});await finish(f);const a=await assignment(f),ids=data(await get(f,'idRegistry/current')),v=data(await get(f,'versions/current'));resetCounts(f);await publishSlide(f);assert.equal(f.counts.writes,3);assert.deepEqual(await assignment(f),a);assert.deepEqual(data(await get(f,'idRegistry/current')),ids);const after=data(await get(f,'versions/current'));for(const domain of ['assignment','attendee','ticket','source','control'])assert.equal(after.values[domain],v.values[domain]);await assertCounts(f);assert.deepEqual(projectView(f.model,f.head,context),slide(f.model,{direction,amount:1},context).after);variants++;}return {axisOrderDirectionProfiles:variants,slideWrites:3};
});
await record('C21','930 cells and 900 seats publish a complete empty assignment against a 500-person prerequisite',async()=>{
 const f=await fixture({large:true});await start(f);await fill(f);const before=structuredClone(f.counts),o=completion(f);await finish(f,o);const initialization=structuredClone(f.counts),publication={requests:initialization.requests-before.requests,writes:initialization.writes-before.writes};assert.equal(publication.requests,1);assert.equal(publication.writes,5);const a=await assignment(f);assert.equal(Object.keys(a.assignments).length,900);assert(Object.values(a.assignments).every(x=>x===''));assert.equal(data(await get(f,'attendeeState/current')).eligibleAttendeeIds.length,500);await assertCounts(f);resetCounts(f);await publishSlide(f);assert.equal(f.counts.writes,3);assert.deepEqual(await assignment(f),a);return {cells:930,seats:900,eligiblePrerequisitePeople:500,assignedPeople:0,initialization,publication,slide:f.counts,indexJsonBytes:Buffer.byteLength(JSON.stringify(f.registry)),assignmentJsonBytes:Buffer.byteLength(JSON.stringify(a)),prerequisiteAndVerificationIOExcluded:true};
});
await record('C22','deputy can publish but unverified human cannot issue a manager session',async()=>{
 const f=await ready({role:'deputy'});await finish(f);const u=await fixture({skipSessions:true,humanVerified:false});denied(await commit(u,[sessionWrite(u)],u.human.token));return {deputyAllowed:true,unverifiedIssuerDenied:true};
});
await record('C23','slide cannot rewrite assignment source or emergency seat reasons',async()=>{
 const f=await ready();await finish(f);let count=0;for(const suffix of ['assignmentState/current','idRegistry/current','chunks/0-0','attributes/0-0']){const b=data(await get(f,suffix));await reject(f,[...slideWrites(f,movement(f)),update(f,suffix,{...b,extra:true},undefined,true)]);assert.deepEqual(data(await get(f,suffix)),b);count++;}await publishSlide(f);await assertCounts(f);return {unrelatedWritesDenied:count,existingEmergencyReasonPreserved:true};
});
await record('C24','four-seat layout fragment remains an expression-budget rejection comparison',async()=>{
 const f=await fixture({columns:11,chunkSize:4,rich:true});await start(f);const r=await commit(f,stageWrites(f,f.chunks[0]));denied(r);assert.match(r.body.error.message,/maximum of 1000 expressions/);assert.equal((await get(f,'chunks/0-0')).status,404);return {httpStatus:r.status,expressionLimit:true,productLimitUnchanged:true};
});

await record('C25','duplicate seat identities inside one fragment and across fragments cannot enter the index',async()=>{
 for(const across of [false,true]){const f=await fixture({columns:11});await start(f);if(across)await ingest(f);const c=structuredClone(f.chunks[across?1:0]);c.value.cells[across?0:1].seatId=f.chunks[0].value.cells[0].seatId;await stage(f,c);await stageAttributes(f,c);await ensureNumbers(f,c);await reject(f,ingestWrites(f,ingestion(f,c)));assert.equal((await get(f,'assignmentState/current')).status,404);assert.equal((await get(f,'versions/current')).status,404);}return {withinAndAcrossFragmentDuplicatesDenied:2};
});

const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({project:'demo-concert-seat-gd91-24',runtime:process.version,executedAt:new Date().toISOString(),hashLineEndings:'LF',sourceHashes,endSourceHashes,scope:'Seat-only ID index and first five-document publication of an empty canonical assignment. Attendee/ticket business snapshots and device/role grants are trusted seeded prerequisites; sessions are issued through normal human Auth. No actual 500-person assignment, full business writers/QR validity, replacement/multiple sections/cleanup, complete auth lifecycle, SDK/IndexedDB or device tests.',reports},null,2)+'\n');
console.log(`${reports.length} scenarios executed`);
