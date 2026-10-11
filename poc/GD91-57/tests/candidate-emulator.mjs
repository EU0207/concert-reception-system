import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {setup,prepare,compare,result} from './comparison-support.mjs';
import {prime,initial,advance,scanSeats,body,save,get,finish,versionPath,candidatePath} from './candidate-support.mjs';
import {parts,manual,doc,seed} from './support.mjs';
import {binding,put,stage,stored,changeControl} from './global-support.mjs';
import {actor,ok,denied,request,base,data} from './transport.mjs';

const sources=['../firestore.rules','../firebase.json','candidate-emulator.mjs','candidate-support.mjs','comparison-support.mjs','global-support.mjs','support.mjs','transport.mjs','../../GD91-49/codec.mjs','../../GD91-48/comparison.mjs','../../GD91-07/planner.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
async function run(id,label,test){reports.push({id,label,status:'passed',...await test()});console.log(JSON.stringify({id,status:'passed'}));}
async function prepared(options={},change){const f=await setup(options,change);await prime(f);await prepare(f);const a=await compare(f);ok(await put(f,'comparisonResult/current',result(f,a),false));return f;}
function proposal(f){const m=f.next.model,s=m.section;return{schemaVersion:1,environmentId:f.old.environmentId,performanceId:f.show,sectionId:f.section,generation:f.next.generation,baseGeneration:f.old.generation,ready:true,seatIds:s.cells.filter(c=>c.kind==='seat').map(c=>c.seatId),entityIds:[f.section,...s.lineSettings.map(l=>l.lineId),...s.cells.map(c=>c.cellId),...m.seats.map(s=>s.seatId),f.next.generation],changedSeatIds:[],operationId:f.next.generation,proofPlan:'GD91-57',expectedVersions:f.head.expectedVersions};}

await run('C01','ordinary complete proofs issue immutable canonical candidate',async()=>{
 const f=await setup();manual(f,1);await prime(f);await prepare(f);const a=await compare(f);ok(await put(f,'comparisonResult/current',result(f,a),false));const m=await finish(f);
 assert.equal(m.seatIds.length,2);assert.equal(m.ready,true);assert.deepEqual(m.expectedVersions,f.publicationVersion.values);return{candidateOwnerInjected:false,publicationExecuted:false};
});
await run('C02','candidate cannot be asserted before proofs exist',async()=>{const f=await setup();await prime(f);denied(await save(f,proposal(f)));assert.equal((await get(f)).status,404);});
await run('C03','partial seat manifest cannot issue candidate',async()=>{const f=await prepared(),a=initial(f);ok(await put(f,'candidateSeats/current',a,false));ok(await put(f,'candidateSeats/current',advance(f,parts(f)[0],a)));denied(await save(f,proposal(f)));});
await run('C04','seat manifest cannot skip forge or invent seats',async()=>{
 const f=await prepared(),b=initial(f);ok(await put(f,'candidateSeats/current',b,false));const a=advance(f,parts(f)[0],b);
 for(const x of [{...a,cursor:2},{...a,seatIds:[]},{...a,seatIds:[randomUUID()]},{...a,lastChunk:parts(f)[1].id},{...a,extra:true}])denied(await put(f,'candidateSeats/current',x));assert.deepEqual(await stored(f,'candidateSeats/current'),b);
});
await run('C05','manifest requires completed local proof and seat source',async()=>{
 const f=await setup();await prime(f);const p=parts(f)[0],b=initial(f);await stage(f,p,3);ok(await put(f,'candidateSeats/current',b,false));denied(await put(f,'candidateSeats/current',advance(f,p,b)));
 ok(await put(f,'proofs/'+p.id,{...binding(f),chunkId:p.id,step:4}));denied(await put(f,'candidateSeats/current',advance(f,p,b)));
});
await run('C06','lower proofs cannot bypass comparison result',async()=>{
 for(const target of ['complete','seatComparison','cellComparison']){const f=await setup();await prime(f);await prepare(f,{cells:target!=='cellComparison'});if(target!=='seatComparison')await compare(f);
  // 完了結果の発行を省いた状態では、各下位証跡だけを集めても候補を作れない。
  await scanSeats(f);denied(await save(f,proposal(f)));
 }return{comparisonResultOmitted:true};
});
await run('C07','candidate seats entities and change list are exact',async()=>{
 const f=await prepared();await scanSeats(f);const m=await body(f);
 for(const change of [x=>x.seatIds=[],x=>x.seatIds.push(x.seatIds[0]),x=>x.entityIds.pop(),x=>x.entityIds.push(randomUUID()),x=>x.entityIds.push(x.entityIds[0]),x=>x.changedSeatIds=[f.oldIds[0]]]){const a=structuredClone(m);change(a);denied(await save(f,a));}
});
await run('C08','candidate target scope operation and proof plan cannot be forged',async()=>{
 const f=await prepared();await scanSeats(f);const m=await body(f);
 for(const change of [x=>x.generation=randomUUID(),x=>x.baseGeneration=randomUUID(),x=>x.sectionId=randomUUID(),x=>x.operationId=randomUUID(),x=>x.environmentId='other',x=>x.performanceId='other',x=>x.proofPlan='GD91-56',x=>x.ready=false,x=>x.extra=true]){const a=structuredClone(m);change(a);denied(await save(f,a));}
 denied(await save(f,m,false,f.manager.token,randomUUID()));
});
await run('C09','latest business version invalidates candidate preparation',async()=>{
 for(const key of ['commit','layout','source','assignment','attendee','ticket','control','reception']){const f=await prepared();await scanSeats(f);const m=await body(f),v=structuredClone(f.publicationVersion);v.values[key]++;await seed(versionPath(f),v);denied(await save(f,m));}
 return{businessVersionChanges:8,normalBusinessWritesTested:false};
});
await run('C10','candidate expected version cannot be forged',async()=>{const f=await prepared();await scanSeats(f);const m=await body(f);for(const values of [{...m.expectedVersions,assignment:2},{...m.expectedVersions,extra:1},{}])denied(await save(f,{...m,expectedVersions:values}));});
await run('C11','latest phase active generation and base stop candidate',async()=>{
 for(const change of [{phase:'stopped'},{revision:2},{activeGeneration:randomUUID()},{publishedGeneration:randomUUID()}]){const f=await prepared();await scanSeats(f);const m=await body(f);await changeControl(f,change);denied(await save(f,m));}
});
await run('C12','revoked role device and session stop creation and query',async()=>{
 for(const target of ['roles','devices','sessions']){const f=await prepared();await finish(f);const path='publicationShows/'+f.show+'/'+target+'/'+(target==='roles'?f.human:f.manager.uid),r=await request(base+'/'+path,'owner');ok(r);await seed(path,{...data(r),active:false});denied(await get(f));
  const g=await prepared();await scanSeats(g);const m=await body(g),q='publicationShows/'+g.show+'/'+target+'/'+(target==='roles'?g.human:g.manager.uid),v=await request(base+'/'+q,'owner');ok(v);await seed(q,{...data(v),active:false});denied(await save(g,m));
 }
});
await run('C13','foreign and anonymous missing credentials cannot create or query',async()=>{const f=await prepared();await scanSeats(f);const m=await body(f),other=await actor();for(const token of [null,other.token]){denied(await save(f,m,false,token));denied(await get(f,token));}});
await run('C14','foreign section and retired entity reuse rejected',async()=>{
 const f=await prepared();await scanSeats(f);const m=await body(f),extra=m.entityIds.find(id=>!f.oldEntityIds.includes(id));assert.equal(extra,f.next.generation);
 await seed(versionPath(f),{...f.publicationVersion,usedIds:f.publicationVersion.usedIds.concat([extra])});denied(await save(f,m));
 await seed(versionPath(f),{...f.publicationVersion,usedGenerations:f.publicationVersion.usedGenerations.concat([f.next.generation])});denied(await save(f,m));
 return{foreignAndRetiredIdsFixture:true};
});
await run('C15','candidate base must match published section and trusted old candidate',async()=>{
 for(const target of ['section','old']){const f=await prepared();await scanSeats(f);const m=await body(f);
  if(target==='section')await seed(versionPath(f),{...f.publicationVersion,sections:{[f.section]:randomUUID()}});else await seed(candidatePath(f,f.old.generation),{schemaVersion:1,environmentId:f.old.environmentId,performanceId:f.show,sectionId:f.section,generation:f.old.generation,ready:false,entityIds:f.oldEntityIds});denied(await save(f,m));
 }return{oldCandidateFixture:true};
});
await run('C16','concurrent candidate creation commits once and result is queried',async()=>{
 const f=await prepared();await scanSeats(f);const m=await body(f),rs=await Promise.all([save(f,m),save(f,m)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);const r=await get(f);ok(r);assert.deepEqual(data(r),m);denied(await save(f,m,true));return{transportFaultInjected:false};
});
await run('C17','manifest concurrency advances once and completion cannot reset',async()=>{
 const f=await prepared(),b=initial(f);ok(await put(f,'candidateSeats/current',b,false));const a=advance(f,parts(f)[0],b),rs=await Promise.all([put(f,'candidateSeats/current',a),put(f,'candidateSeats/current',a)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,403]);assert.deepEqual(await stored(f,'candidateSeats/current',f.manager.token),a);denied(await put(f,'candidateSeats/current',b));
});
await run('C18','candidate issuance leaves publication and business version untouched',async()=>{
 const f=await prepared();await finish(f);const r=await request(base+'/'+versionPath(f),'owner');ok(r);assert.deepEqual(data(r),f.publicationVersion);
 denied(await put(f,'publication/current',{generation:f.next.generation},false));return{candidateIssued:true,published:false,productionEligibilityVerified:false};
});

const endSourceHashes=await hashes();assert.deepEqual(sourceHashes,endSourceHashes);
await writeFile(new URL('../artifacts/candidate-summary.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),runtime:{node:process.version},hashLineEndings:'LF',sourceHashes,endSourceHashes,scope:'Ordinary complete candidate from source and comparison proofs plus exact seat/entity sets; latest business-version binding and entity reuse checks. Parent, published old raw/candidate and business versions are fixtures. Dedicated edit eligibility and atomic publication remain unconnected.',referenceUpperBounds:{candidateSeatsStart:5,candidateSeatsStep:8,candidateCreate:10,candidateRead:3},reports},null,2)+'\n');
console.log(JSON.stringify({scenarios:reports.length,passed:reports.length,publicationExecuted:false}));
