import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {budgets} from './budgets.mjs';
import {publicationCases} from './publication.mjs';
import {recoveryCases} from './recovery.mjs';
import {project,base,request,fixture,anonymous,write,commit,get,list,seed,data,ok,denied,conflict,statePlan,probe,projection} from './support.mjs';
const sources=['../firestore.rules','../firebase.json','support.mjs','budgets.mjs','emulator.mjs','recovery.mjs','publication.mjs','../../GD91-38/firestore.rules','../../GD91-36/firestore.rules','../../GD91-37/firestore.rules'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
async function record(id,label,run){if(process.env.GD91_CASE&&process.env.GD91_CASE!==id)return;const result=await run();reports.push({id,label,status:'passed',...result});console.log(`${id}: CHECKED ${label}`);}
async function unchanged(f,plan,writes=plan.writes,token=f.device.token,check=denied){const before=await Promise.all(['control/current','publicStatus/current','performanceEvents/'+plan.id].map(p=>get(f,p,'owner')));check(await commit(f,writes,token));assert.deepEqual(await Promise.all(['control/current','publicStatus/current','performanceEvents/'+plan.id].map(p=>get(f,p,'owner'))),before);}
const managers=new Set(['owner','deputy']);
await record('B01','four roles use separate single-read and list scopes',async()=>{
 let reads=0;for(const role of ['owner','deputy','temporary','receptionist']){const f=await fixture(role,'operating');
  for(const[c,id,allowed]of [['receptionViews','FAKE-seat',true],['dayViews','FAKE-day',role!=='receptionist'],['managementHistory','FAKE-history',managers.has(role)],['sharedDrafts','FAKE-draft',managers.has(role)],['arbitraryFields','FAKE-field',false],['roles',f.human.uid,managers.has(role)],['devices',f.device.uid,managers.has(role)]]){
   (allowed?ok:denied)(await get(f,c+'/'+id));(allowed?ok:denied)(await list(f,c));reads+=2;
  }
  assert.deepEqual(data(await get(f,'receptionViews/FAKE-seat')),f.seat);assert.equal(Object.keys(f.seat).length,6);
  ok(await get(f,'selfRoles/'+f.human.uid));denied(await list(f,'selfRoles'));ok(await get(f,'deviceStatus/'+f.device.uid));denied(await list(f,'deviceStatus'));
 }
 return{matrixRequests:reads,roles:4,getAndListTested:true,arbitraryFieldsAllDenied:true};
});
await record('B02','query bounds, cross-performance and collection-group reads are denied',async()=>{
 const f=await fixture('receptionist','operating'),other=await fixture('owner','operating'),stranger=await anonymous();
 for(const limit of [null,101])denied(await list(f,'receptionViews',f.device.token,limit));ok(await list(f,'receptionViews',f.device.token,1));
 for(const token of [other.device.token,stranger.token,f.human.token,null]){denied(await get(f,'receptionViews/FAKE-seat',token));denied(await list(f,'receptionViews',token));}
 denied(await get(other,'selfRoles/'+other.human.uid,f.device.token));denied(await get(f,'selfRoles/'+other.human.uid));denied(await get(f,'deviceStatus/'+stranger.uid));
 denied(await request(`${base}:runQuery`,f.device.token,'POST',{structuredQuery:{from:[{collectionId:'receptionViews',allDescendants:true}],limit:100}}));
 return{unboundedAndOversizedDenied:2,crossPerformanceIdentityRequests:8,collectionGroupDenied:true};
});
await record('B03','read and operation policy distinguish all four performance states',async()=>{
 let checks=0;for(const role of ['owner','deputy','temporary','receptionist'])for(const state of ['preparing','operating','ended','closed']){
  const f=await fixture(role,state),m=managers.has(role);
  (state!=='closed'||m?ok:denied)(await get(f,'receptionViews/FAKE-seat'));
  (state!=='closed'||m?ok:denied)(await list(f,'receptionViews'));
  (m||role==='temporary'&&['operating','ended'].includes(state)?ok:denied)(await get(f,'dayViews/FAKE-day'));
  (state==='operating'?ok:denied)(await probe(f,'reception'));
  (state==='operating'&&role!=='receptionist'?ok:denied)(await probe(f,'temporary'));
  (m&&['ended','closed'].includes(state)?ok:denied)(await probe(f,'postCorrection'));
  checks+=6;
 }
 return{roleStateCombinations:16,policyChecks:checks,businessWritesTested:false,closingTransitionTested:false};
});
await record('B04','start, stop and end are atomic and retain first reception start',async()=>{
 const f=await fixture(),p=await statePlan(f,'operating');
 for(let mask=1;mask<7;mask++)await unchanged(f,p,p.writes.filter((_,i)=>mask&(1<<i)));
 ok(await commit(f,p.writes));const started=data(await get(f,'control/current')),stamp=started.firstReceptionStartedAt;
 assert(stamp.$timestamp);assert.deepEqual(data(await get(f,'publicStatus/current')),projection(started));
 assert.equal(data(await get(f,'performanceEvents/'+p.id)).humanUid,f.human.uid);
 assert.equal(data(await get(f,'performanceEvents/'+p.id)).deviceUid,f.device.uid);
 await unchanged(f,p,p.writes,f.device.token,conflict);
 for(const state of ['preparing','operating','ended']){const next=await statePlan(f,state);ok(await commit(f,next.writes));assert.deepEqual(data(await get(f,'control/current')).firstReceptionStartedAt,stamp);}
 await unchanged(f,await statePlan(f,'operating'));await unchanged(f,await statePlan(f,'closed'));
 return{partialSubsetsDenied:6,stateCommits:4,writesPerCommit:3,firstStartPreserved:true,replayDenied:true,unsupportedTransitionsDenied:2};
});
await record('B05','only managers change state, and stale or forged proposals do not write',async()=>{
 for(const role of ['temporary','receptionist']){const f=await fixture(role);await unchanged(f,await statePlan(f,'operating'));}
 const deputy=await fixture('deputy');ok(await commit(deputy,(await statePlan(deputy,'operating')).writes));
 const f=await fixture(),p=await statePlan(f,'operating');
 for(const [index,key,value]of [[2,'humanUid','FAKE-other'],[2,'deviceUid','FAKE-other'],[2,'confirmed',false],[0,'revision',99],[0,'dataRevision',2],[1,'dataRevision',2]]){
  const w=structuredClone(p.writes);w[index].update.fields[key]=typeof value==='number'?{integerValue:String(value)}:typeof value==='boolean'?{booleanValue:value}:{stringValue:value};await unchanged(f,p,w);
 }
 const a=await statePlan(f,'operating'),b=await statePlan(f,'operating');const r=await Promise.all([commit(f,a.writes),commit(f,b.writes)]);assert.equal(r.filter(x=>x.status===200).length,1);conflict(r.find(x=>x.status!==200));
 const events=await list(f,'performanceEvents','owner');ok(events);assert.equal(events.body.filter(x=>x.document).length,1);assert.equal(data(await get(f,'control/current')).revision,2);
 return{staffTransitionsDenied:2,forgedProposalsDenied:6,concurrentWinners:1,auditCount:1,deputyStartAllowed:true};
});
await record('B06','re-authentication is required for end and post-correction, not normal start or reception',async()=>{
 const f=await fixture();const original=data(await get(f,'sessions/'+f.device.uid,'owner'));
 await seed(f,'sessions/'+f.device.uid,{...original,humanAuthTime:{$timestamp:new Date(Date.now()-20*60000).toISOString()}});
 ok(await commit(f,(await statePlan(f,'operating')).writes));ok(await probe(f,'reception'));await unchanged(f,await statePlan(f,'ended'));
 await seed(f,'control/current',{...data(await get(f,'control/current','owner')),state:'ended'});denied(await probe(f,'postCorrection'));
 await seed(f,'sessions/'+f.device.uid,original);ok(await probe(f,'postCorrection'));denied(await probe(f,'postCorrection',{reason:''}));
 return{expiredHumanEndAndCorrectionDenied:2,ordinaryStartAndReceptionAllowed:true,missingCorrectionReasonDenied:true,oldAuthTimeSeeded:true};
});
await record('B07','latest authority revocation blocks normal get, list and writes, but own stop status remains readable',async()=>{
 const f=await fixture('owner','operating');let deniedCount=0;
 for(const[path,changes]of [['devices/'+f.device.uid,{active:false}],['sessions/'+f.device.uid,{active:false}],['sessions/'+f.device.uid,{expiresAt:{$timestamp:'2000-01-01T00:00:00Z'}}],['roles/'+f.human.uid,{active:false}],['roles/'+f.human.uid,{endsAt:{$timestamp:'2000-01-01T00:00:00Z'}}],['roles/'+f.human.uid,{revision:2}],['devices/'+f.device.uid,{humanUid:'FAKE-other'}]]){
  const before=data(await get(f,path,'owner'));await seed(f,path,{...before,...changes});denied(await get(f,'receptionViews/FAKE-seat'));denied(await list(f,'receptionViews'));denied(await get(f,'managementHistory/FAKE-history'));denied(await probe(f,'reception'));ok(await get(f,'deviceStatus/'+f.device.uid));await seed(f,path,before);deniedCount+=4;
 }
 return{normalRequestsDenied:deniedCount,ownMinimalStatusReadable:true,quarantineSubmissionTested:false};
});
await record('B08','stale data and control versions block policy writes without blocking a fresh download',async()=>{
 const f=await fixture('receptionist','operating');denied(await probe(f,'reception',{controlRevision:0}));denied(await probe(f,'reception',{dataRevision:0}));
 await seed(f,'control/current',{...f.control,dataRevision:2});await seed(f,'publicStatus/current',projection({...f.control,dataRevision:2}));
 denied(await probe(f,'reception'));ok(await get(f,'publicStatus/current'));ok(await get(f,'receptionViews/FAKE-seat'));ok(await list(f,'receptionViews'));
 const d=data(await get(f,'devices/'+f.device.uid,'owner'));await seed(f,'devices/'+f.device.uid,{...d,preparedDataRevision:2});ok(await probe(f,'reception'));
 denied(await commit(f,[write(f,'devices/'+f.device.uid,{...d,preparedDataRevision:99},true)]));
 return{staleVersionRequestsDenied:3,downloadNotDeadlocked:true,preparationReceiptRootSeeded:true,indexedDBCompletenessTested:false};
});
await record('B09','standalone public publication is denied for all roles',async()=>{
 for(const role of ['owner','deputy','temporary','receptionist']){const f=await fixture(role,'operating');
  denied(await commit(f,[write(f,'receptionViews/FAKE-seat',{...f.seat,seatDisplayName:'架空変更'},true)]));
  denied(await commit(f,[write(f,'receptionViews/FAKE-new',{...f.seat,seatId:'FAKE-new'},false)]));
 }
 return{revisedFromGD9138:true,standaloneWritesDenied:8,sourceProjectionConsistencyTested:true};
});
await recoveryCases(record);
await publicationCases(record);
const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({project,executedAt:new Date().toISOString(),runtime:{node:process.version},selectedCase:process.env.GD91_CASE??'all',hashLineEndings:'LF',sourceHashes,endSourceHashes,budgets,testLevel:'Auth and Firestore Emulator integration via REST, plus static budget assertions; not production application unit tests.',scope:'Stage B partial: five-document seat display-name source/projection/day-event/data-version publication; source is a minimal isolated fact, not GD91-36 business schema 8. Own temporary day-event get/list. Normal requests build publication proposals; setup and inspection root-seeded. Old B09 revised to deny standalone publication; B01-08 and C01-09 unchanged. Manifest issuance and physical preparation unconnected. No full business regression, SDK, IndexedDB, real queue, deletion or real-provider tests.',reports},null,2)+'\n');
console.log(`${reports.length} scenarios executed`);
