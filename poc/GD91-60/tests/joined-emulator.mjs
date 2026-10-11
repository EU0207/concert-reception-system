import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {ready,primeBusiness,proposal,writes,save,accept,reject,path,stored} from './publication-support.mjs';
import {setup,prepare,compare,result} from './comparison-support.mjs';
import {prime,scanSeats,body,save as saveCandidate,get as getCandidate} from './candidate-support.mjs';
import {seed,doc,write} from './support.mjs';
import {put} from './global-support.mjs';
import {commit as canonicalCommit,ok,denied,data,request,base} from './transport.mjs';
import {fixture as accessFixture,statePlan,commit as accessCommit,get as accessGet,data as accessData} from './access-support.mjs';

const reports=[];
async function run(id,label,test){reports.push({id,label,status:'passed',...await test()});console.log(JSON.stringify({id,status:'passed'}));}
const access=f=>({show:f.show,device:f.manager,human:f.person});
await run('J01','normal human session issues and publishes the complete V1 candidate',async()=>{
 const f=await ready({add:true}),s=await stored(f,'sessions/'+f.manager.uid,'owner'),p=proposal(f);
 assert.equal(s.humanUid,f.person.uid);assert(s.issuedAt.$timestamp);assert(s.humanAuthTime.$timestamp);
 assert.equal(s.authProvider,'google.com');ok(await save(f,p));await accept(f,p);
 denied(await request(base+'/'+path(f,'versions/current'),f.person.token));
 return{normalHumanSession:true,normalStructureAndCandidateIssued:true,normalPublication:true,rootSeededPrerequisites:['initial roles and registered device','old layout and business baseline','construction head and control']};
});
await run('J02','normal reception start invalidates an already issued candidate without partial publication',async()=>{
 const f=await ready({add:true}),p=proposal(f),start=await statePlan(access(f),'operating');ok(await accessCommit(access(f),start.writes));
 await reject(f,p);const v=await stored(f,'versions/current');assert.equal(v.values.control,2);assert.equal(v.values.reception,f.publicationVersion.values.reception+1);
 const stop=await statePlan(access(f),'preparing');ok(await accessCommit(access(f),stop.writes));await reject(f,p);
 assert((await stored(f,'control/current','owner')).firstReceptionStartedAt.$timestamp);
 return{oldCandidateRejectedAfterStart:true,oldCandidateRejectedAfterStop:true,firstStartPreserved:true};
});
await run('J03','state transition after proof scanning prevents final candidate issuance',async()=>{
 const f=await setup();await prime(f);await primeBusiness(f);await prepare(f);const a=await compare(f);ok(await put(f,'comparisonResult/current',result(f,a),false));await scanSeats(f);const m=await body(f);
 ok(await accessCommit(access(f),(await statePlan(access(f),'operating')).writes));denied(await saveCandidate(f,m));assert.equal((await getCandidate(f)).status,404);
 return{ordinaryCandidateFinalizationDenied:true,noCandidateCreated:true};
});
await run('J04','concurrent publication and start apply at most one; transient dual rejection preserves data for explicit retry',async()=>{
 const races=[];
 for(let attempt=0;attempt<10;attempt++){
 const f=await ready({add:true}),p=proposal(f),start=await statePlan(access(f),'operating');
 const before=await Promise.all(['versions/current','assignmentState/current','control/current','publicStatus/current'].map(p=>stored(f,p,'owner')));
 const responses=await Promise.all([save(f,p),accessCommit(access(f),start.writes)]);
 const initialSuccesses=responses.filter(r=>r.status===200).length;assert(initialSuccesses<=1,JSON.stringify(responses));
 let explicitRetry=false;
 if(initialSuccesses===0){
  assert(responses.some(r=>r.status===409&&r.body.error.status==='ABORTED'&&r.body.error.message.includes('Transaction lock timeout')),JSON.stringify(responses));
  assert(responses.every(r=>r.status===409&&r.body.error.status==='ABORTED'||r.status===403&&r.body.error.message.includes('Service call error')),JSON.stringify(responses));
  assert.deepEqual(await Promise.all(['versions/current','assignmentState/current','control/current','publicStatus/current'].map(p=>stored(f,p,'owner'))),before);
  assert.equal((await request(base+'/'+path(f,'operations/'+p.id),f.manager.token)).status,404);
  assert.equal((await accessGet(access(f),'performanceEvents/'+start.id)).status,404);
  const index=attempt%2,original=responses[index];responses[index]=index===0?await save(f,p):await accessCommit(access(f),start.writes);ok(responses[index]);explicitRetry=true;
  races.push({initialStatuses:responses.map((r,i)=>i===index?original.status:r.status),initialSuccesses,explicitRetry:true,retriedSameOperationId:index===0?p.id:start.id});
 }else races.push({initialStatuses:responses.map(r=>r.status),initialSuccesses,explicitRetry:false});
 assert.equal(responses.filter(r=>r.status===200).length,1);
 assert([403,409].includes(responses.find(r=>r.status!==200).status));
 const v=await stored(f,'versions/current'),c=await stored(f,'control/current','owner');
 if(responses[0].status===200){await accept(f,p);assert.equal(c.state,'preparing');assert.equal((await accessGet(access(f),'performanceEvents/'+start.id,'owner')).status,404);}
 else {assert.equal(c.state,'operating');assert.equal(v.values.control,2);assert.equal((await request(base+'/'+path(f,'operations/'+p.id),'owner')).status,404);assert.deepEqual(await stored(f,'assignmentState/current'),f.assignment);}
 races.at(-1).winner=responses[0].status===200?'publication':'start';
 const losing=responses[0].status===200?await accessCommit(access(f),start.writes):await save(f,p);assert([403,409].includes(losing.status));
 }
 return{races:10,results:races,maximumInitialSuccesses:1,finalSuccessesPerRace:1,automaticRetryImplemented:false,sharedControlLayoutAndReceptionVersion:true,noPartialLoserState:true};
});
await run('J05','the exact V1 handoff retains all 500 IDs assignments and immutable candidate under normal identity',async()=>{
 const h=JSON.parse(await readFile(new URL('../../GD91-58/artifacts/business-handoff.json',import.meta.url),'utf8'));
 const f=await accessFixture('owner','preparing',{showId:h.candidate.performanceId});
 for(const [p,v] of [['candidates/'+h.candidate.generation,h.candidate],['versions/current',h.publishedVersion],['assignmentState/current',h.assignment]])await seed('publicationShows/'+f.show+'/'+p,v);
 const get=p=>request(base+'/publicationShows/'+f.show+'/'+p,f.device.token);
 assert.deepEqual(data(await get('candidates/'+h.candidate.generation)),h.candidate);assert.deepEqual(data(await get('versions/current')),h.publishedVersion);assert.deepEqual(data(await get('assignmentState/current')),h.assignment);
 assert.equal(h.candidate.seatIds.length,500);assert(h.candidate.seatIds.every(id=>h.assignment.assignments[id]));
 denied(await canonicalCommit(f,[write('publicationShows/'+f.show+'/candidates/'+h.candidate.generation,{...h.candidate,ready:false},true)],f.device.token));
 return{exactHandoffImported:true,seatCount:500,allAssignmentsPreserved:true,candidateReissuedInThisCase:false,businessSavesNotYetConnected:true};
});
await run('J06','live role device and session revocation denies all three construction authorization paths',async()=>{
 const f=await ready();let count=0;
 for(const [p,patch] of [['roles/'+f.person.uid,{active:false}],['devices/'+f.manager.uid,{active:false}],['sessions/'+f.manager.uid,{active:false}],['roles/'+f.person.uid,{revision:2}]]){
  const old=await stored(f,p,'owner');await seed(path(f,p),{...old,...patch});
  denied(await getCandidate(f));denied(await request(base+'/'+doc(f,'seatComparison/current'),f.manager.token));denied(await request(base+'/'+path(f,'versions/current'),f.manager.token));count+=3;
  await seed(path(f,p),old);
 }
 return{constructionCandidateAndPublicationDenials:count,normalIdentityShared:true};
});
await run('J07','no proper subset of the four transition writes changes control or common version',async()=>{
 const f=await ready(),a=access(f),p=await statePlan(a,'operating'),paths=['control/current','publicStatus/current','versions/current','performanceEvents/'+p.id];
 const snapshot=()=>Promise.all(paths.map(p=>accessGet(a,p,'owner'))),before=await snapshot();
 for(let mask=1;mask<15;mask++){denied(await accessCommit(a,p.writes.filter((_,i)=>mask&(1<<i))));assert.deepEqual(await snapshot(),before);}
 ok(await accessCommit(a,p.writes));assert.equal(accessData(await accessGet(a,'control/current','owner')).revision,2);
 return{properSubsetsDenied:14,normalTransitionWrites:4};
});
await writeFile(new URL('../artifacts/joined-summary.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),scope:'V1 construction plus A/B formal identity, state version coupling and exact imported 500-seat handoff. Business routes C not executed; no SDK, IndexedDB or real-device claim.',reports},null,2)+'\n');
