import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import * as construction from './staging.mjs';
import * as publication from './publication.mjs';
import {budgets} from './budgets.mjs';
import {bootstrap} from './bootstrap.mjs';
import {multipleCases} from './multiple.mjs';
import {replacementCases} from './replacement.mjs';

const sources=['../firestore.rules','../firebase.json','staging.mjs','publication.mjs','transport.mjs','emulator.mjs','budgets.mjs','bootstrap.mjs','multiple.mjs','replacement.mjs','../../GD91-46/firestore.rules','../../GD91-42/tests/business.mjs','../../GD91-45/firestore.rules','../../GD91-45/tests/staging.mjs','../../GD91-45/tests/emulator.mjs',
 '../../GD91-42/firestore.rules','../../GD91-42/tests/support.mjs','../../GD91-44/firestore.rules','../../GD91-44/tests/support.mjs',
 '../../GD91-44/tests/transport.mjs','../../GD91-44/tests/budgets.mjs','../../GD91-07/planner.mjs','../../GD91-16/codec.mjs','../../GD91-08/slide.mjs','../../GD91-10/projection.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
async function record(id,label,fn){if(process.env.GD91_CASE&&process.env.GD91_CASE!==id)return;const result=await fn();reports.push({id,label,status:'passed',...result});console.log(id+': CHECKED '+label);}

async function setup(options={},pub=null){
 pub??=await publication.fixture({people:options.people??2});
 const stage=await construction.fixture({chunkSize:3,numberSpan:2,publication:pub,skipSessions:true,...options});
 await bootstrap(stage);construction.resetCounts(stage);
 return{stage,pub,entry:{generation:stage.generation,model:stage.model}};
}
async function payload(f){
 const h=construction.data(await construction.get(f.stage,'head/current',f.stage.owner.token));
 const r=construction.data(await construction.get(f.stage,'idRegistry/current',f.stage.owner.token));
 return{schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.pub.show,sectionId:h.sectionId,generation:f.stage.generation,
  baseGeneration:'',ready:true,seatIds:Object.keys(r.seatIds),entityIds:Object.keys(r.usedIds),changedSeatIds:[]};
}
const candidateWrite=(f,m)=>publication.update(f.pub,'candidates/'+m.generation,m,false);
async function emit(f){const m=await payload(f);publication.ok(await publication.commit(f.pub,[candidateWrite(f,m)]));return m;}
async function noCandidate(f,m,token=f.pub.owner.token){const before=await publication.get(f.pub,'candidates/'+m.generation);publication.denied(await publication.commit(f.pub,[candidateWrite(f,m)],token));const after=await publication.get(f.pub,'candidates/'+m.generation);assert.equal(after.status,before.status);if(before.status===200)assert.deepEqual(after.body,before.body);}
async function prepared(options={}){const f=await setup(options);await construction.initialize(f.stage);return f;}
async function published(f){await emit(f);const p=await publication.proposal(f.pub,f.entry);await publication.save(f.pub,p);return p;}
let largeFixture;
async function add(pub=null,options={}){const f=await setup(options,pub);if(options.initialize!==false)await construction.initialize(f.stage);return f;}
async function getLarge(){if(!largeFixture){largeFixture=await add(null,{rows:10,columns:50,allSeats:true,people:500});await published(largeFixture);}return largeFixture;}

await record('C01','validated preparation emits a candidate then publishes atomically',async()=>{
 const f=await setup();await construction.start(f.stage);
 await noCandidate(f,await payload(f));await construction.fill(f.stage);
 await noCandidate(f,await payload(f));await construction.finish(f.stage);
 const before=structuredClone(f.pub.versions),m=await emit(f);
 assert.deepEqual(publication.data(await publication.get(f.pub,'versions/current')),before);
 const p=await publication.proposal(f.pub,f.entry),w=publication.writes(f.pub,p);
 for(let mask=1;mask<7;mask++)await publication.reject(f.pub,p,w.filter((_,i)=>mask&(1<<i)));
 await publication.save(f.pub,p);assert.equal(f.pub.versions.sections[m.sectionId],m.generation);
 return{clientCandidateWrites:1,publicationWrites:w.length,properSubsetsDenied:6,adminCandidateWrites:0};
});
await record('C02','all unset cells produce an empty seat set',async()=>{const f=await prepared({empty:true});const m=await emit(f);assert.equal(m.seatIds.length,0);await publication.save(f.pub,await publication.proposal(f.pub,f.entry));assert.deepEqual(f.pub.assignment.assignments,{});return{emptySeatSet:true};});
await record('C03','manifest claims must equal the server validated registry',async()=>{
 const f=await prepared(),m=await payload(f);let count=0;
 for(const change of [a=>a.seatIds.pop(),a=>a.seatIds.push(randomUUID()),a=>a.seatIds.push(a.seatIds[0]),a=>a.entityIds.pop(),a=>a.entityIds.push(randomUUID()),a=>a.entityIds.push(a.entityIds[0]),a=>a.changedSeatIds.push(a.seatIds[0]),a=>a.baseGeneration=randomUUID(),a=>a.ready=false,a=>a.sectionId=randomUUID(),a=>a.generation=randomUUID(),a=>a.schemaVersion=10,a=>a.performanceId='FAKE-other',a=>a.environmentId='FAKE-other',a=>a.extra=true]){
  const forged=structuredClone(m);change(forged);await noCandidate(f,forged);count++;
 }
 await published(f);return{forgeriesDenied:count};
});
await record('C04','missing chunks cannot be skipped or declared complete',async()=>{
 const f=await setup();await construction.start(f.stage);const o=construction.ingestion(f.stage);o.after.cursor=f.stage.head.rows*f.stage.head.columns;o.registry.cursor=o.after.cursor;
 await construction.reject(f.stage,construction.ingestWrites(f.stage,o));
 await construction.reject(f.stage,construction.finishWrites(f.stage,construction.completion(f.stage)));
 await noCandidate(f,await payload(f));return{incompleteDenied:3};
});
await record('C05','missing attributes cannot advance construction',async()=>{
 const f=await setup();await construction.start(f.stage);const o=construction.ingestion(f.stage);await construction.stage(f.stage,o.chunk);await construction.ensureNumbers(f.stage,o.chunk);
 await construction.reject(f.stage,construction.ingestWrites(f.stage,o));await noCandidate(f,await payload(f));return{missingAttributesDenied:true};
});
await record('C06','forged numbering cannot lead to a candidate',async()=>{
 const f=await setup();await construction.start(f.stage);const o=construction.ingestion(f.stage);await construction.stage(f.stage,o.chunk);await construction.stageAttributes(f.stage,o.chunk);
 const w=construction.numberWrites(f.stage,o.chunk);w[0].update.fields.steps.arrayValue.values[0]={integerValue:'999'};
 construction.denied(await construction.commit(f.stage,w));await construction.reject(f.stage,construction.ingestWrites(f.stage,o));await noCandidate(f,await payload(f));return{invalidNumbersDenied:true};
});
await record('C07','latest publication role and device restrictions apply to emission',async()=>{
 let count=0;for(const[target,patch]of [['roles',{active:false}],['roles',{revision:2}],['devices',{active:false}],['sessions',{active:false}]]){
  const f=await prepared(),m=await payload(f),path=target+'/'+(target==='roles'?f.pub.human.uid:f.pub.owner.uid);
  const old=publication.data(await publication.get(f.pub,path));await publication.seed(f.pub,path,{...old,...patch});await noCandidate(f,m);count++;
 }
 const f=await prepared();await noCandidate(f,await payload(f),f.pub.reader.token);return{authorizationDenied:count+1};
});
await record('C08','issued candidates cannot be rewritten or deleted',async()=>{
 const f=await prepared(),m=await emit(f),path='candidates/'+m.generation;
 publication.denied(await publication.commit(f.pub,[publication.update(f.pub,path,{...m,ready:false},true)]));
 publication.denied(await publication.commit(f.pub,[{delete:publication.update(f.pub,path,m).update.name}]));
 assert.deepEqual(publication.data(await publication.get(f.pub,path)),m);return{immutableCandidate:true};
});
await record('C09','candidate emission seals the source head against later slides',async()=>{
 const f=await prepared();await emit(f);await construction.reject(f.stage,construction.slideWrites(f.stage,construction.movement(f.stage)));
 await publication.save(f.pub,await publication.proposal(f.pub,f.entry));return{sourceMutationDenied:true};
});
await record('C10','publication still rechecks the latest role after emission',async()=>{
 const f=await prepared();await emit(f);const p=await publication.proposal(f.pub,f.entry),path='roles/'+f.pub.human.uid;
 const old=publication.data(await publication.get(f.pub,path));await publication.seed(f.pub,path,{...old,revision:2});await publication.reject(f.pub,p);return{publicationReauthorization:true};
});
await record('C11','another performance cannot use the completed source',async()=>{
 const f=await prepared(),other=await publication.fixture(),m=await payload(f);
 m.performanceId=other.show;await noCandidate({...f,pub:other},m);return{crossPerformanceDenied:true};
});
await record('C12','publication before candidate emission rejects without exposing staging',async()=>{
 const f=await prepared(),m=await payload(f),missing=await publication.get(f.pub,'candidates/'+m.generation);assert.equal(missing.status,404);
 assert.deepEqual(publication.data(await publication.get(f.pub,'versions/current')).sections,{});
 const p=await publication.proposal(f.pub,f.entry,null,false);
 await publication.reject(f.pub,p);return{stagingNotPublic:true};
});
await record('C13','five hundred validated seats are emitted and published without truncation',async()=>{
 const f=await prepared({rows:10,columns:50,allSeats:true,people:500});assert.equal(f.stage.model.seats.length,500);const m=await emit(f);
 assert.equal(m.seatIds.length,500);const p=await publication.proposal(f.pub,f.entry);await publication.save(f.pub,p);
 assert.equal(Object.keys(f.pub.assignment.assignments).length,500);assert.equal(f.pub.versions.seatIds.length,500);
 largeFixture=f;
 return{seats:500,constructionRequests:f.stage.counts.requests,constructionWrites:f.stage.counts.writes,emissionWrites:1,publicationWrites:3};
});
await record('C14','this new-section emitter cannot silently replace an existing publication',async()=>{
 const f=await prepared();await published(f);const m=await payload(f);m.generation=randomUUID();await noCandidate(f,m);return{replacementOutsideScope:true};
});
await record('C15','control revision and performance-day boundary are checked at emission',async()=>{
 let count=0;for(const patch of [{revision:2},{state:'operating'},{dayStartsAt:{$timestamp:'2000-01-01T00:00:00Z'}}]){
  const f=await prepared(),m=await payload(f),c=publication.data(await publication.get(f.pub,'control/current'));
  await publication.seed(f.pub,'control/current',{...c,...patch});await noCandidate(f,m);count++;
 }return{controlDenied:count};
});
await record('C16','source slide before emission requires a fresh verified source',async()=>{
 const f=await prepared();await construction.publishSlide(f.stage);await noCandidate(f,await payload(f));return{unsealedChangedHeadDenied:true};
});
await record('C17','emission and source mutation in the same commit are rejected together',async()=>{
 const f=await prepared(),m=await payload(f),before=construction.data(await construction.get(f.stage,'head/current'));
 const combined=[candidateWrite(f,m),...construction.slideWrites(f.stage,construction.movement(f.stage))];
 publication.denied(await publication.commit(f.pub,combined));
 assert.equal((await publication.get(f.pub,'candidates/'+m.generation)).status,404);
 assert.deepEqual(construction.data(await construction.get(f.stage,'head/current')),before);
 await published(f);return{mixedCommitDenied:true};
});
await record('C18','concurrent emission and source mutation cannot both succeed',async()=>{
 const f=await prepared(),m=await payload(f),move=construction.movement(f.stage);
 const results=await Promise.all([publication.commit(f.pub,[candidateWrite(f,m)]),construction.commit(f.stage,construction.slideWrites(f.stage,move))]);
 assert(results.every(r=>[200,403,409].includes(r.status)),JSON.stringify(results));
 let recovered=false;
 if(results.every(r=>r.status!==200)){publication.ok(await publication.commit(f.pub,[candidateWrite(f,m)]));recovered=true;}
 else assert.equal(results.filter(r=>r.status===200).length,1);
 const candidate=await publication.get(f.pub,'candidates/'+m.generation),head=construction.data(await construction.get(f.stage,'head/current'));
 if(candidate.status===200){assert.equal(head.revision,1);await construction.reject(f.stage,construction.slideWrites(f.stage,move));}
 else {assert.equal(candidate.status,404);assert.equal(head.revision,2);await noCandidate(f,m);}
 return{completeWinners:1,lockAbortRecovery:recovered,candidateWon:candidate.status===200};
});

await multipleCases(record,{add,emit,payload,candidateWrite,noCandidate,published,getLarge});
await replacementCases(record,{add,emit,payload,candidateWrite,noCandidate,published,getLarge});
const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
if(!process.env.GD91_CASE)assert.equal(reports.length,44);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),runtime:{node:process.version},selectedCase:process.env.GD91_CASE??'all',
 scope:'Same-shape replacement with a server-validated complete comparison; 28 new-section regressions and 16 replacement scenarios. New-section construction -> client candidate emission -> atomic publication, Auth and Firestore Emulator. 18 initial regression and 10 multi-section scenarios; no admin-seeded candidate. Authorization uses common performance roles/devices/sessions; registrations/control and empty public canonical state are fixtures; construction bootstrap uses ordinary requests. No changed geometry/line settings, manual numbering, live slide or full business regression, adoption, SDK, IndexedDB or actual device proof.',
 hashLineEndings:'LF',sourceHashes,endSourceHashes,budgets,reports},null,2)+'\n');
console.log(JSON.stringify({scenarios:reports.length,initialCandidateAdminSeeded:false,budgets,sourceHashes:sources.length}));
