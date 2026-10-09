import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fixture, commit, update, get, data, ok, denied, seed, start, fill, finish, completion, finishWrites, initialVersions,
  initialize, resetCounts, movement, slideWrites, publishSlide, projectView, slide, context } from './support.mjs';
import { bootstrapPlan, bootstrapWrites, bootstrap, ready, customerPlan, customerWrites, saveCustomer, acceptCustomer,
  assignment, assignmentPlan, assignmentWrites, saveAssignment, snapshot, reject, controlPlan, controlWrites, saveControl } from './business.mjs';
import { planSlide, PlanError } from '../plan.mjs';

const sources=['../firestore.rules','../firebase.json','../plan.mjs','support.mjs','business.mjs','emulator.mjs',
  '../../GD91-16/codec.mjs','../../GD91-07/planner.mjs','../../GD91-08/slide.mjs','../../GD91-10/projection.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
async function record(id,label,action){const result=await action();reports.push({id,label,status:'passed',...result});console.log(`${id}: CHECKED ${label}`);}
const subset=(w,mask)=>w.filter((_,i)=>mask&(1<<i));
const conflict=r=>assert([403,409].includes(r.status),JSON.stringify(r.body));
const head=async f=>data(await get(f,'head/current'));
async function createPeople(f,n){const people=[];for(let i=0;i<n;i++)people.push(await saveCustomer(f));return people;}
async function noDocuments(f,paths){for(const p of paths)assert.equal((await get(f,p)).status,404,p);}
async function setup(options={}){const f=await fixture(options);await bootstrap(f);resetCounts(f);return f;}
const bootstrapPaths=o=>['attendeeState/current','ticketState/current','versions/current','operations/'+o.id];

await record('B01','four-document bootstrap preserves actual control revision and rejects every partial subset',async()=>{
  const f=await fixture({controlRevision:7}),o=bootstrapPlan(f),w=bootstrapWrites(f,o);
  for(let mask=1;mask<15;mask++){denied(await commit(f,subset(w,mask)));await noDocuments(f,bootstrapPaths(o));}
  resetCounts(f);await bootstrap(f,o);assert.deepEqual([f.counts.requests,f.counts.writes],[1,4]);
  assert.deepEqual(f.sharedVersions.values,{commit:1,layout:0,source:0,assignment:0,attendee:1,ticket:1,control:7});
  await noDocuments(f,['selection/current','head/current','assignmentState/current']);
  for(const[path,expected]of [['attendeeState/current',o.people],['ticketState/current',o.ticket],['versions/current',o.versions],['operations/'+o.id,o.event]])assert.deepEqual(data(await get(f,path)),expected);
  const costs=structuredClone(f.counts);await reject(f,bootstrapWrites(f,bootstrapPlan(f)),f.owner.token,conflict);
  return{partialSubsetsDenied:14,controlRevision:7,bootstrap:costs,headAndAssignmentAbsent:true};
});

await record('B02','bootstrap fields actors and existing fragments cannot be reused',async()=>{
  const f=await fixture({controlRevision:7});const changes=[o=>o.people.eligibleAttendeeIds=[randomUUID()],o=>o.people.revision=2,
    o=>o.people.schemaVersion=2,o=>o.ticket.protectedAttendeeIds=[randomUUID()],o=>o.ticket.performanceId='FAKE-other',
    o=>o.versions.schemaVersion=2,o=>o.versions.performanceId='FAKE-other',o=>o.versions.environmentId='FAKE-other',
    o=>o.versions.values.control=1,o=>o.versions.values.commit=2,o=>o.versions.values.attendee=0,
    ...['layout','source','assignment'].map(k=>o=>o.versions.values[k]=1),o=>o.versions.sectionId=randomUUID(),o=>o.versions.generation=randomUUID(),
    o=>o.versions.values.extra=1,o=>o.versions.extra=true,o=>o.event.expectedVersions={},o=>o.event.resultVersions.control=1,
    o=>o.event.deviceUid=f.other.uid,o=>o.event.generation=randomUUID(),o=>o.event.operationId=randomUUID()];
  for(const mutate of changes){const o=bootstrapPlan(f);mutate(o);await reject(f,bootstrapWrites(f,o));await noDocuments(f,bootstrapPaths(o));}
  for(const token of [f.reader.token,f.human.token,null])await reject(f,bootstrapWrites(f,bootstrapPlan(f)),token);
  for(const paths of [['attendeeState/current'],['ticketState/current'],['attendeeState/current','ticketState/current'],['operations']]){
    const g=await fixture(),o=bootstrapPlan(g);for(const p of paths)await seed(g,p==='operations'?'operations/'+o.id:p,p==='operations'?o.event:p.startsWith('attendee')?o.people:o.ticket);
    const w=bootstrapWrites(g,o).filter(x=>!paths.some(p=>x.update.name.endsWith(p==='operations'?'operations/'+o.id:p)));
    await reject(g,w);assert.equal((await get(g,'versions/current')).status,404);
  }
  return{forgeriesDenied:changes.length,wrongActorsDenied:3,existingFragmentComparisons:4,fragmentsSeededForCorruptionOnly:true};
});

await record('B03','normal attendee writes before layout preserve the uncreated state',async()=>{
  const f=await setup(),o=customerPlan(f),w=customerWrites(f,o);
  for(let mask=1;mask<15;mask++){await reject(f,subset(w,mask));await noDocuments(f,['attendees/'+o.attendeeId,'operations/'+o.id]);}
  resetCounts(f);await saveCustomer(f,o);assert.deepEqual([f.counts.requests,f.counts.writes],[1,4]);const creation=structuredClone(f.counts);
  await saveCustomer(f,customerPlan(f,{paid:true},o.attendeeId));await saveCustomer(f,customerPlan(f,{seatDisplayName:'架空B'},o.attendeeId));
  await saveCustomer(f,customerPlan(f,{attendancePlan:'notAttending'},o.attendeeId));await saveCustomer(f,customerPlan(f,{attendancePlan:'planned'},o.attendeeId));
  assert.deepEqual([f.sharedVersions.values.layout,f.sharedVersions.values.source,f.sharedVersions.values.assignment],[0,0,0]);
  await noDocuments(f,['assignmentState/current','head/current','selection/current']);
  denied(await get(f,'versions/current',f.reader.token));denied(await get(f,'attendees/'+o.attendeeId,f.reader.token));denied(await get(f,'operations/'+o.id,f.reader.token));
  return{partialSubsetsDenied:14,creation,uncreatedStatePreserved:true,managerDataNotDistributed:true};
});

await record('B04','first publication updates existing versions and rejects every partial subset',async()=>{
  const f=await setup(),c=await saveCustomer(f);await start(f);await fill(f);const before=structuredClone(f.sharedVersions),o=completion(f),w=finishWrites(f,o);
  for(let mask=1;mask<31;mask++){await reject(f,subset(w,mask));await noDocuments(f,['operations/'+o.id,'assignmentState/current']);}
  resetCounts(f);await finish(f,o);assert.deepEqual([f.counts.requests,f.counts.writes],[1,5]);const publication=structuredClone(f.counts);
  assert.deepEqual(f.sharedVersions.values,{...before.values,commit:before.values.commit+1,layout:1,source:1,assignment:1});
  assert.deepEqual(data(await get(f,'attendees/'+c.attendeeId)),c.profile);assert.deepEqual(data(await get(f,'attendeeState/current')),f.people);
  assert.deepEqual(data(await get(f,'operations/'+o.id)),o.history);assert.equal(f.sharedVersions.values.attendee,2);
  await reject(f,bootstrapWrites(f,bootstrapPlan(f)),f.owner.token,conflict);
  return{partialSubsetsDenied:30,publication,existingAttendeeRevisionPreserved:2,initialHistoryMatches:true};
});

await record('B05','publication cannot reset business versions or forge history assignments and sources',async()=>{
  const f=await setup({controlRevision:7});await saveCustomer(f);await start(f);await fill(f);
  const changes=[o=>o.versions.values.attendee=1,o=>o.versions.values.ticket++,o=>o.versions.values.control=1,
    o=>o.versions.values.commit=1,o=>o.versions.values.layout=0,o=>o.versions.values.source=0,o=>o.versions.values.assignment=0,
    o=>o.versions.schemaVersion=2,o=>o.versions.sectionId=randomUUID(),o=>o.versions.generation=randomUUID(),o=>o.versions.values.extra=1,
    o=>o.history.expectedVersions.attendee=1,o=>o.history.resultVersions.commit++,o=>o.history.controlRevision=1,
    o=>o.history.deviceUid=f.other.uid,o=>o.history.schemaVersion=2,o=>o.history.extra=true,
    o=>o.assignment.assignments[f.model.seats[0].seatId]=f.people.eligibleAttendeeIds[0],o=>delete o.assignment.assignments[f.model.seats[0].seatId],
    o=>o.assignment.schemaVersion=2,o=>o.assignment.revision=2,o=>o.assignment.generation=randomUUID()];
  for(const mutate of changes){const o=completion(f);o.versions=initialVersions(f,o);o.assignment={schemaVersion:3,environmentId:'FAKE-environment',performanceId:f.show,generation:f.generation,revision:1,operationId:o.id,assignments:Object.fromEntries(f.model.seats.map(x=>[x.seatId,'']))};mutate(o);await reject(f,finishWrites(f,o));await noDocuments(f,['operations/'+o.id,'assignmentState/current']);}
  for(const token of [f.reader.token,f.human.token,null])await reject(f,finishWrites(f,completion(f)),token);
  const o=completion(f),extra=customerPlan(f);await reject(f,[...finishWrites(f,o),update(f,'attendees/'+extra.attendeeId,extra.profile,undefined,false)]);
  await finish(f);return{publicationForgeriesDenied:changes.length,wrongActorsDenied:3,piggybackDenied:1,latestBusinessAndControlPreserved:true};
});

await record('B06','registration during source preparation does not freeze the initial business version',async()=>{
  const f=await setup();await start(f);assert.deepEqual(data(await get(f,'versions/current')),f.sharedVersions);
  await saveCustomer(f);await fill(f);assert.deepEqual(data(await get(f,'versions/current')),f.sharedVersions);const old=completion(f),oldWrites=finishWrites(f,old);
  const c=await saveCustomer(f);await reject(f,oldWrites);await noDocuments(f,['operations/'+old.id,'assignmentState/current']);
  const latest=completion(f);await finish(f,latest);assert.equal(f.sharedVersions.values.attendee,3);assert(f.people.eligibleAttendeeIds.includes(c.attendeeId));
  return{stalePublicationDenied:true,preparationDoesNotAdvanceCommit:true,businessRevisionAtPublication:3};
});

await record('B07','unknown bootstrap and publication responses use the same operation ID and result documents',async()=>{
  const f=await fixture(),o=bootstrapPlan(f);ok(await commit(f,bootstrapWrites(f,o)));f.people=o.people;f.ticket=o.ticket;f.sharedVersions=o.versions;f.profiles=new Map();
  for(const[path,expected]of [['attendeeState/current',o.people],['ticketState/current',o.ticket],['versions/current',o.versions],['operations/'+o.id,o.event]])assert.deepEqual(data(await get(f,path)),expected);
  await reject(f,bootstrapWrites(f,o),f.owner.token,conflict);await saveCustomer(f);await start(f);await fill(f);const p=completion(f),v=initialVersions(f,p),w=finishWrites(f,p);
  ok(await commit(f,w));for(const[path,expected]of [['head/current',p.after],['selection/current',p.selection],['versions/current',v],['operations/'+p.id,p.history]])assert.deepEqual(data(await get(f,path)),expected);
  const a=await assignment(f);assert.equal(a.operationId,p.id);assert.equal(a.revision,1);assert(Object.values(a.assignments).every(x=>x===''));
  f.sharedVersions=v;f.head=p.after;f.selection=p.selection;await reject(f,w,f.owner.token,conflict);
  const bad=structuredClone(p);bad.history.resultVersions.attendee++;await reject(f,finishWrites(f,bad),f.owner.token,conflict);
  return{bootstrapDocumentsChecked:4,publicationDocumentsChecked:5,replaysAndDifferentPayloadDenied:3,sdkRecoveryNotTested:true};
});

await record('B08','layout zero is not permission to repair missing or unexpected documents',async()=>{
  const f=await setup(),o=customerPlan(f);const a={schemaVersion:3,environmentId:'FAKE-environment',performanceId:f.show,generation:f.generation,revision:1,operationId:randomUUID(),assignments:{}};
  const id=randomUUID(),v={...structuredClone(f.sharedVersions),operationId:id,values:{...f.sharedVersions.values,commit:2,assignment:1}},e={schemaVersion:3,environmentId:'FAKE-environment',performanceId:f.show,
    operationId:id,kind:'assign',deviceUid:f.owner.uid,generation:'',expectedVersions:f.sharedVersions.values,resultVersions:v.values,
    payload:{seat1:f.model.seats[0].seatId,seat2:'',before1:'',before2:'',after1:randomUUID(),after2:'',reason:''}};
  await reject(f,[update(f,'assignmentState/current',{...a,operationId:id},undefined,false),update(f,'versions/current',v,undefined,true),update(f,'operations/'+id,e,undefined,false)]);
  await reject(f,[update(f,'assignmentState/current',a,undefined,false)]);await seed(f,'assignmentState/current',a);await reject(f,customerWrites(f,o));
  const g=await ready(),before=await get(g,'assignmentState/current');
  // 管理経路での障害注入だけ。通常Rulesには削除経路を設けない。
  ok(await commit(g,[{delete:before.body.name}],'owner'));await reject(g,customerWrites(g,customerPlan(g)));
  const restore=data(before);await seed(g,'assignmentState/current',restore);
  const c=await saveCustomer(g);const change=customerPlan(g);change.versions.values.layout=0;change.versions.values.source=0;change.versions.values.assignment=0;change.versions.sectionId='';change.versions.generation='';await reject(g,customerWrites(g,change));
  await saveAssignment(g,await assignmentPlan(g,'assign',{seat1:g.model.seats[0].seatId,attendeeId:c.attendeeId}));
  return{fullSeatOperationBeforeLayoutDenied:true,unexpectedAssignmentAndMissingPublishedAssignmentDenied:true,rollBackToZeroDenied:true,corruptionInjectedOnlyInLocalEmulator:true};
});

async function race(f,operations){
  const before=await snapshot(f),results=await Promise.all(operations.map(o=>commit(f,o.writes,o.token??f.owner.token)));
  const winners=results.filter(r=>r.status===200).length;assert(winners<=1,JSON.stringify(results));results.filter(r=>r.status!==200).forEach(conflict);
  let winner=results.findIndex(r=>r.status===200),recovery=false;
  if(winners===0){const aborted=results.findIndex(r=>r.status===409&&r.body.error.status==='ABORTED');assert(aborted>=0,JSON.stringify(results));
    assert(results.every(r=>r.body.error.status==='ABORTED'||r.status===403&&r.body.error.message.includes('Service call error.')),JSON.stringify(results));
    assert.deepEqual(await snapshot(f),before);await noDocuments(f,operations.map(o=>'operations/'+o.id));
    // 結果・版を照会した後の同一IDによる明示再試行。403を無条件再送しない。
    ok(await commit(f,operations[aborted].writes,operations[aborted].token??f.owner.token));winner=aborted;recovery=true;
  }
  for(let i=0;i<operations.length;i++)assert.equal((await get(f,'operations/'+operations[i].id)).status,i===winner?200:404);
  return{winner,initialWinners:winners,lockAbortRecovery:recovery};
}

await record('B09','simultaneous bootstrap requests publish one complete common state',async()=>{
  const f=await fixture(),a=bootstrapPlan(f),b=bootstrapPlan(f);b.event.deviceUid=f.other.uid;
  const result=await race(f,[{id:a.id,writes:bootstrapWrites(f,a)},{id:b.id,writes:bootstrapWrites(f,b),token:f.other.token}]);
  const winning=result.winner===0?a:b;for(const[path,expected]of [['attendeeState/current',winning.people],['ticketState/current',winning.ticket],['versions/current',winning.versions]])assert.deepEqual(data(await get(f,path)),expected);
  return{...result,completeWinnerOnly:true};
});

await record('B10','first publication competes with registration and control without partial results',async()=>{
  let initialWinnerPairs=0,lockAbortRecoveries=0;
  for(let i=0;i<12;i++){const f=await setup();await saveCustomer(f);await start(f);await fill(f);const publication=completion(f),v=initialVersions(f,publication);
    const isControl=i%2===1,other=isControl?await controlPlan(f):customerPlan(f),w=isControl?controlWrites(f,other):customerWrites(f,other);
    const result=await race(f,[{id:publication.id,writes:finishWrites(f,publication)},{id:other.id,writes:w}]);initialWinnerPairs+=result.initialWinners;lockAbortRecoveries+=Number(result.lockAbortRecovery);
    const after=data(await get(f,'versions/current'));assert.equal(after.values.commit,f.sharedVersions.values.commit+1);
    if(result.winner===0){assert.deepEqual(after,v);assert.equal((await get(f,'assignmentState/current')).status,200);if(!isControl)assert.equal((await get(f,'attendees/'+other.attendeeId)).status,404);}
    else{assert.deepEqual(after,other.versions);assert.equal((await head(f)).status,'building');await noDocuments(f,['assignmentState/current']);}
  }
  return{competingPairs:12,initialWinnerPairs,lockAbortRecoveries,finalWinnersPerPair:1,controlFenceOnly:true};
});

await record('B11','minimal control revision updates bind to common versions and fence stale preparation',async()=>{
  const f=await setup({controlRevision:7});const c=await controlPlan(f),w=controlWrites(f,c);
  for(let mask=1;mask<7;mask++)await reject(f,subset(w,mask));resetCounts(f);await saveControl(f,c);assert.deepEqual([f.counts.requests,f.counts.writes],[1,3]);
  const controlCosts=structuredClone(f.counts);assert.equal(f.sharedVersions.values.control,8);assert.equal(data(await get(f,'control/current')).firstReceptionStartedAt,null);
  await saveCustomer(f);f.head.controlRevision=8;await start(f);await fill(f);const old=completion(f);await saveControl(f);await reject(f,finishWrites(f,old));
  return{partialSubsetsDenied:6,controlCosts,stalePreparationFenced:true,actualReceptionStartStopNotImplemented:true};
});

async function largeSequence(order){
  const f=await fixture({large:true}),o=bootstrapPlan(f);resetCounts(f);await bootstrap(f,o);const bootstrapCosts=structuredClone(f.counts);
  let registration,sourceCreation,publication;const register=async()=>{resetCounts(f);await createPeople(f,500);registration=structuredClone(f.counts);};
  const build=async()=>{resetCounts(f);await start(f);await fill(f);sourceCreation=structuredClone(f.counts);resetCounts(f);await finish(f);publication=structuredClone(f.counts);};
  if(order==='namesFirst'){await register();await build();}else{await build();await register();}
  const beforePeople=data(await get(f,'attendeeState/current')),profiles=[...f.profiles.values()];
  resetCounts(f);const mapping=Object.fromEntries(profiles.map((p,i)=>[f.model.seats[i].seatId,p.attendeeId]));await saveAssignment(f,await assignmentPlan(f,'bulkAssign',{mapping}));const bulkAssignment=structuredClone(f.counts);
  const before=await assignment(f);await saveAssignment(f,await assignmentPlan(f,'move',{seat1:f.model.seats[0].seatId,seat2:f.model.seats[500].seatId}));
  await saveAssignment(f,await assignmentPlan(f,'swap',{seat1:f.model.seats[1].seatId,seat2:f.model.seats[500].seatId}));const assigned=await assignment(f);
  resetCounts(f);await checkPlan(f);await publishSlide(f);const slideCosts=structuredClone(f.counts);assert.deepEqual(await assignment(f),assigned);
  assert.deepEqual(data(await get(f,'attendeeState/current')),beforePeople);for(const p of profiles)assert.deepEqual(data(await get(f,'attendees/'+p.attendeeId)),p);
  assert.equal(Object.values(before.assignments).filter(Boolean).length,500);assert.equal(Object.values(assigned.assignments).filter(Boolean).length,500);
  assert.deepEqual(f.sharedVersions.values,{commit:506,layout:2,source:1,assignment:4,attendee:501,ticket:1,control:1});
  assert.deepEqual([bootstrapCosts.requests,bootstrapCosts.writes,registration.requests,registration.writes,publication.requests,publication.writes,bulkAssignment.requests,bulkAssignment.writes],[1,4,500,2000,1,5,1,3]);
  return{order,cells:f.model.section.cells.length,seats:f.model.seats.length,normallyRegisteredPeople:500,assignedPeople:500,bootstrap:bootstrapCosts,sourceCreation,publication,registration,bulkAssignment,slide:slideCosts,
    finalVersions:f.sharedVersions.values,sourceBusinessSnapshotsSeeded:false,profilesAfterSlideChecked:500,normalTicketIssuanceNotTested:true};
}
await record('B12','500 people can be registered before the initial seat map',()=>largeSequence('namesFirst'));
await record('B13','500 people can be registered after the initial seat map',()=>largeSequence('layoutFirst'));

// 新形式で業務の偽装・認可と既存の席操作も回帰確認する。

async function checkPlan(f) {
  const state=await assignment(f),source=structuredClone(f.model);source.assignments=Object.entries(state.assignments).filter(([,id])=>id).map(([seatId,attendeeId])=>({seatId,attendeeId}));
  const snap={schemaVersion:3,environmentId:'FAKE-environment',performanceId:f.show,generation:f.generation,versions:structuredClone(f.sharedVersions.values),head:structuredClone(f.head),source};
  const command={operationId:randomUUID(),kind:'slide',environmentId:snap.environmentId,performanceId:f.show,expectedGeneration:f.generation,expectedVersions:structuredClone(snap.versions),direction:f.direction,amount:1};
  const proposed=slide(projectView(source,f.head,context),{direction:f.direction,amount:1},context).after,original=structuredClone({snap,command,proposed});
  assert.equal(planSlide(snap,command,proposed,context).route,'offsetUpdate');assert.deepEqual({snap,command,proposed},original);
  for(const schemaVersion of [1,2])assert.throws(()=>planSlide({...snap,schemaVersion},command,proposed,context),e=>e instanceof PlanError&&e.code==='UNSUPPORTED_SNAPSHOT');
  return{source,proposed};
}

await record('B14', 'customer indexes cannot be forged independently of their business records', async () => {
  const f = await setup(); const valid = await saveCustomer(f);
  const changes = [o => o.people.eligibleAttendeeIds.push(randomUUID()), o => o.people.eligibleAttendeeIds = [],
    o => o.people.eligibleAttendeeIds.push(o.attendeeId), o => o.people.eligibleAttendeeIds = [o.attendeeId],
    o => o.people.attendeeId = valid.attendeeId, o => o.people.revision++, o => o.people.schemaVersion = 1,
    o => o.profile.attendeeId = randomUUID(), o => o.profile.buyerId = '', o => o.profile.schemaVersion = 1,
    o => o.profile.performanceId = 'FAKE-other', o => o.profile.environmentId = 'FAKE-other', o => o.profile.paid = 'yes',
    o => o.profile.attendancePlan = 'unknown', o => o.profile.seatDisplayName = '1234567', o => o.profile.extra = true,
    o => o.profile.revision++, o => o.profile.operationId = randomUUID(), o => o.event.payload.before = valid.profile,
    o => o.event.payload.after.seatDisplayName = '異なる', o => o.event.deviceUid = '', o => o.event.payload.extra = true,
    o => o.versions.schemaVersion = 1, o => o.versions.values.commit++, o => o.versions.values.assignment++,
    o => delete o.versions.values.control, o => o.versions.performanceId = 'FAKE-other', o => o.versions.values.attendee = 9007199254740992];
  for (const mutate of changes) {
    const o = customerPlan(f); mutate(o); await reject(f, customerWrites(f, o));
    assert.equal((await get(f, 'attendees/' + o.attendeeId)).status, 404);
  }
  await saveCustomer(f); return { customerForgeriesDenied: changes.length, unrelatedExistingPersonPreserved: true };
});


await record('B15', 'normal profile changes maintain eligibility and fixed-check audit exceptions', async () => {
  const f = await ready(), c = await saveCustomer(f);
  const beforeHead = await head(f), beforeTicket = data(await get(f, 'ticketState/current'));
  await reject(f, customerWrites(f, customerPlan(f, { paid: false }, c.attendeeId)));
  for (const paid of [true, false]) {
    const o = customerPlan(f, { paid }, c.attendeeId); await saveCustomer(f, o);
    assert.equal(data(await get(f, 'operations/' + o.id)).deviceUid, '');
  }
  await saveCustomer(f, customerPlan(f, { seatDisplayName: '架空B' }, c.attendeeId));
  const nonattending = customerPlan(f, { attendancePlan: 'notAttending' }, c.attendeeId); await saveCustomer(f, nonattending);
  assert.equal(f.people.eligibleAttendeeIds.length, 0);
  await saveCustomer(f, customerPlan(f, { attendancePlan: 'planned' }, c.attendeeId));
  assert(f.people.eligibleAttendeeIds.includes(c.attendeeId));
  assert.deepEqual(await head(f), beforeHead); assert.deepEqual(data(await get(f, 'ticketState/current')), beforeTicket);
  const o = customerPlan(f, { paid: true }, c.attendeeId); o.event.deviceUid = f.owner.uid; await reject(f, customerWrites(f, o));
  return { headUnchanged: true, ticketUnchanged: true, fixedCheckOperatorOmitted: true, unassignedUnissuedReturnOnly: true };
});


await record('B16', 'normal assign move swap and unissued release preserve unchanged domains', async () => {
  const f = await ready(), [a, b] = await createPeople(f, 2), seats = f.model.seats.map(s => s.seatId);
  const first = await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId }), w = assignmentWrites(f, first);
  for (let mask = 1; mask < 7; mask++) await reject(f, subset(w, mask));
  const beforeHead = await head(f), beforePeople = data(await get(f, 'attendeeState/current')), beforeTicket = data(await get(f, 'ticketState/current'));
  resetCounts(f); await saveAssignment(f, first);
  assert.deepEqual([f.counts.requests, f.counts.writes], [1, 3]);
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: seats[1], attendeeId: b.attendeeId }));
  await saveAssignment(f, await assignmentPlan(f, 'move', { seat1: seats[0], seat2: seats[2] }));
  await saveAssignment(f, await assignmentPlan(f, 'swap', { seat1: seats[1], seat2: seats[2] }));
  assert.equal((await assignment(f)).assignments[seats[1]], a.attendeeId);
  await saveAssignment(f, await assignmentPlan(f, 'unassign', { seat1: seats[1] }));
  assert.equal((await assignment(f)).assignments[seats[1]], '');
  assert.deepEqual(await head(f), beforeHead); assert.deepEqual(data(await get(f, 'attendeeState/current')), beforePeople);
  assert.deepEqual(data(await get(f, 'ticketState/current')), beforeTicket);
  return { partialSubsetsDenied: 6, operations: 5, writesPerOperation: 3, layoutAndBusinessUnchanged: true };
});


await record('B17', 'assignment forgeries and unrelated piggyback changes are rejected', async () => {
  const f = await ready(), [a, b] = await createPeople(f, 2), absent = await saveCustomer(f, customerPlan(f, { attendancePlan: 'notAttending' }));
  const seats = f.model.seats.map(s => s.seatId);
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId }));
  const changes = [o => o.after.assignments[seats[1]] = a.attendeeId, o => o.after.assignments[seats[1]] = randomUUID(),
    o => o.after.assignments[seats[1]] = absent.attendeeId, o => delete o.after.assignments[seats[0]],
    o => o.after.assignments[f.model.section.cells[0].cellId] = b.attendeeId, o => o.after.assignments[randomUUID()] = '',
    o => o.after.assignments[seats[0]] = '', o => o.after.schemaVersion = 1, o => o.after.generation = randomUUID(),
    o => o.after.revision++, o => o.after.extra = true, o => o.after.operationId = randomUUID(),
    o => o.event.payload.after1 = a.attendeeId, o => o.event.payload.before1 = a.attendeeId,
    o => o.event.payload.seat1 = seats[2], o => o.event.deviceUid = f.other.uid, o => o.event.expectedVersions.attendee++,
    o => o.event.resultVersions.layout++, o => o.event.payload.extra = true,
    o => o.versions.values.assignment++, o => o.versions.values.commit = 9007199254740992,
    ...['layout', 'source', 'attendee', 'ticket', 'control'].map(k => o => o.versions.values[k]++), o => o.versions.values.extra = 1];
  for (const mutate of changes) {
    const o = await assignmentPlan(f, 'assign', { seat1: seats[1], attendeeId: b.attendeeId }); mutate(o); await reject(f, assignmentWrites(f, o));
  }
  const o = await assignmentPlan(f, 'assign', { seat1: seats[1], attendeeId: b.attendeeId });
  for (const extra of [update(f, 'attendeeState/current', { revision: f.people.revision + 1 }, ['revision'], true),
    update(f, 'ticketState/current', { revision: 2 }, ['revision'], true), update(f, 'head/current', { revision: 2 }, ['revision'], true)]) {
    await reject(f, [...assignmentWrites(f, o), extra]);
  }
  await saveAssignment(f, o);
  const blocked = customerPlan(f, { attendancePlan: 'notAttending' }, a.attendeeId); await reject(f, customerWrites(f, blocked));
  assert.equal(data(await get(f, 'attendees/' + a.attendeeId)).attendancePlan, 'planned');
  return { assignmentForgeriesDenied: changes.length, piggybackVariantsDenied: 3, assignedPersonCannotUseUnissuedOnlyCancellation: true };
});


await record('B18', 'stale confirmations refuse customer and assignment overwrites', async () => {
  const f = await ready(), [a, b] = await createPeople(f, 2), seats = f.model.seats.map(s => s.seatId);
  const oldAssignment = await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId });
  const oldCustomer = customerPlan(f, { paid: true }, a.attendeeId);
  await saveCustomer(f, customerPlan(f, { seatDisplayName: '架空C' }, b.attendeeId));
  await reject(f, assignmentWrites(f, oldAssignment)); await reject(f, customerWrites(f, oldCustomer));
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId }));
  await saveCustomer(f, customerPlan(f, { paid: true }, a.attendeeId));
  const oldSlide = movement(f); await saveCustomer(f, customerPlan(f, { paid: true }, b.attendeeId)); await reject(f, slideWrites(f, oldSlide));
  return { staleOperationsDenied: 3, currentReconfirmationAccepted: true };
});


await record('B19', 'latest device session and role authorization fences all normal writes', async () => {
  const f = await ready(), c = await saveCustomer(f);
  const original = Object.fromEntries(await Promise.all(['devices/' + f.owner.uid, 'sessions/' + f.owner.uid, 'roles/FAKE-manager'].map(async p => [p, data(await get(f, p))])));
  const variants = [['devices/' + f.owner.uid, { active: false }], ['devices/' + f.owner.uid, { preparedRoleRevision: 2 }],
    ['devices/' + f.owner.uid, { humanUid: f.readerHuman.uid }], ['devices/' + f.owner.uid, { performanceId: 'FAKE-other' }],
    ['sessions/' + f.owner.uid, { active: false }], ['sessions/' + f.owner.uid, { roleRevision: 2 }],
    ['sessions/' + f.owner.uid, { expiresAt: { $timestamp: '2000-01-01T00:00:00Z' } }], ['sessions/' + f.owner.uid, { authProvider: 'password' }],
    ['roles/FAKE-manager', { active: false }], ['roles/FAKE-manager', { revision: 2 }], ['roles/FAKE-manager', { role: 'temporary' }],
    ['roles/FAKE-manager', { endsAt: { $timestamp: '2000-01-01T00:00:00Z' } }]];
  let deniedRequests = 0;
  for (const [p, changed] of variants) {
    await seed(f, p, { ...original[p], ...changed });
    const o = customerPlan(f), a = await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId });
    for (const w of [customerWrites(f, o), assignmentWrites(f, a), slideWrites(f, movement(f))]) { await reject(f, w); deniedRequests++; }
    await seed(f, p, original[p]);
  }
  for (const token of [f.reader.token, f.human.token, null]) {
    await reject(f, customerWrites(f, customerPlan(f)), token); deniedRequests++;
  }
  return { authorityVariants: variants.length, deniedRequests, sessionsIssuedNormally: true, registrationAndRoleGrantsSeeded: true };
});


await record('B20', 'axis order and all slide directions retain normal assignments', async () => {
  let profiles = 0;
  for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) for (const direction of ['up', 'down', 'left', 'right']) {
    const f = await ready({ axis, order, direction }), c = await saveCustomer(f);
    await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId }));
    const before = await assignment(f), sourceBefore = structuredClone(f.model); await checkPlan(f); await publishSlide(f);
    assert.deepEqual(await assignment(f), before); assert.deepEqual(f.model, sourceBefore); profiles++;
  }
  return { axisOrderDirectionProfiles: profiles, identitiesNumbersAndAssignmentsPreserved: true };
});


await record('B21', 'legacy version format and foreign business sources cannot be used', async () => {
  const f = await ready(), c = await saveCustomer(f), before = structuredClone(f.sharedVersions);
  await seed(f, 'versions/current', { ...before, schemaVersion: 1 });
  await reject(f, customerWrites(f, customerPlan(f))); await reject(f, slideWrites(f, movement(f)));
  await seed(f, 'versions/current', before);
  for (const [path, value] of [['attendeeState/current', { ...f.people, performanceId: 'FAKE-other' }],
    ['ticketState/current', { ...f.ticket, environmentId: 'FAKE-other' }]]) {
    await seed(f, path, value);
    await reject(f, assignmentWrites(f, await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId })));
    await seed(f, path, path.startsWith('attendee') ? f.people : f.ticket);
  }
  return { legacyFormatRequestsDenied: 2, foreignBusinessSourcesDenied: 2 };
});

await record('B22','latest role session and device checks apply before layout and at first publication',async()=>{
  const fixtures=[await fixture(),await setup(),await setup()];await start(fixtures[2]);await fill(fixtures[2]);let deniedRequests=0;
  for(let phase=0;phase<3;phase++){
    const f=fixtures[phase],paths=['devices/'+f.owner.uid,'sessions/'+f.owner.uid,'roles/FAKE-manager'];
    const original=Object.fromEntries(await Promise.all(paths.map(async p=>[p,data(await get(f,p))])));
    const variants=[[paths[0],{active:false}],[paths[0],{preparedRoleRevision:2}],[paths[1],{active:false}],
      [paths[2],{active:false}],[paths[2],{revision:2}],[paths[2],{role:'temporary'}]];
    const writes=()=>phase===0?bootstrapWrites(f,bootstrapPlan(f)):phase===1?customerWrites(f,customerPlan(f)):finishWrites(f,completion(f));
    for(const[p,change]of variants){await seed(f,p,{...original[p],...change});await reject(f,writes());deniedRequests++;await seed(f,p,original[p]);}
    for(const token of [f.reader.token,f.human.token,null]){await reject(f,writes(),token);deniedRequests++;}
  }
  return{phases:3,authorityVariantsPerPhase:6,deniedRequests,sessionsIssuedNormally:true,registrationAndRoleGrantsSeeded:true};
});

const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({project:'demo-concert-seat-gd91-28',runtime:process.version,executedAt:new Date().toISOString(),hashLineEndings:'LF',sourceHashes,endSourceHashes,
  scope:'Format-three bootstrap and first-publication integration in both preparation orders with 500 normally registered people each. Normal Auth sessions; device registration roles and initial control are seeded. controlFence changes only revision, not actual performance creation or reception start/stop. No ticket/QR writer, nonattendance joint operation, complete auth lifecycle, buyer entities/import, multiple sections/all edits/cleanup or SDK/IndexedDB/UI/device tests.',reports},null,2)+'\n');
console.log(`${reports.length} scenarios executed`);
