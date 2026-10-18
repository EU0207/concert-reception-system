import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {buildRules} from './generate.mjs';
import {project,base,auth,users,meter,body,stamp,request,write,commit,get,ok,denied,seed,actor,documentBytes} from './client.mjs';
assert.equal(process.env.GCLOUD_PROJECT,project);assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8382');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9492');
const root=new URL('./',import.meta.url),entries=['local.mjs','client.mjs','generate.mjs','run-local.mjs','business.rules','firebase.json','../GD91-136/firestore.rules'];
const hashes=sourceHashes(root,entries),rulesHash=createHash('sha256').update(buildRules()).digest('hex'),reports=[],sizes=[];
let failure,cleanup={},phase='setup';
function report(people,id,details={}){reports.push({people,id,...details});console.log(JSON.stringify({people,case:id,passed:true}));}
async function read(p,token){return body(ok(await get(p,token)).body);}
function setEvent(p,id,event){return write(p+'/operations/'+id,event,'at');}
function copy(value){return structuredClone(value);}
try{
 for(const count of [600,1000]){
  phase=count+'/fixture';const show=randomUUID(),p='centerShows/'+show,h=await actor(true),a=await actor(),b=await actor(),unprepared=await actor();
  const role={active:true,role:'owner',revision:1,startsAt:stamp(Date.now()-60000),endsAt:stamp(Date.now()+3600000)};
  await seed(p+'/roles/'+h.uid,role);
  for(const d of [a,b]){
   await seed('centerDevices/'+d.uid,{deviceUid:d.uid,humanUid:h.uid,active:true,revision:1,preparedRoleRevision:1});
   const s={performanceId:show,deviceUid:d.uid,humanUid:h.uid,active:true,roleRevision:1,authProvider:'google.com',emailVerified:true,expiresAt:stamp(Date.now()+1800000),humanAuthTime:stamp(JSON.parse(Buffer.from(h.token.split('.')[1],'base64url')).auth_time*1000)};
   ok(await commit(h.token,[write(p+'/sessions/'+d.uid,s,'issuedAt')]));
  }
  const seats=Array.from({length:4097},()=>randomUUID()),ids=Array.from({length:count},()=>randomUUID()),sectionIds=Array.from({length:16},()=>randomUUID()),oldGeneration=randomUUID();
  const people=ids.map((id,i)=>({personId:id,name:'架空購入者'+String(i).padStart(4,'0'),seatId:seats[i],ticketId:randomUUID(),credentialId:randomBytes(16).toString('base64url'),revision:1,lastOp:'',performanceId:show}));
  let head={performanceId:show,phase:'stopped',firstStartedAt:1,revision:1,operationId:randomUUID(),geometryRevision:1,generation:oldGeneration,cellCount:4032,
   sections:Object.fromEntries(sectionIds.map(id=>[id,oldGeneration])),seatIds:seats.slice(0,4032),assignments:Object.fromEntries(seats.slice(0,4032).map((s,i)=>[s,i<count?ids[i]:'']))};
  await seed(p+'/head/current',head);
  for(let offset=0;offset<count;offset+=200)ok(await commit('owner',people.slice(offset,offset+200).map(x=>write(p+'/people/'+x.personId,x))));
  assert.equal((await read(p+'/head/current',a.token)).seatIds.length,4032);
  report(count,'F01-preconditions',{registeredPeople:count,sections:16,oldCells:4032,normalHumanSessionIssuance:true,peopleHeadAndGeometryProofOwnerPreconditions:true});
  const exchangePlan=(before=head,reason='架空の依頼による交換')=>{
   const id=randomUUID(),next={...copy(before),revision:before.revision+1,operationId:id};next.assignments[people[0].seatId]=people[1].personId;next.assignments[people[1].seatId]=people[0].personId;
   const x={...people[0],seatId:people[1].seatId,revision:people[0].revision+1,lastOp:id},y={...people[1],seatId:people[0].seatId,revision:people[1].revision+1,lastOp:id};
   const e={kind:'exchange',expectedRevision:before.revision,seatA:people[0].seatId,seatB:people[1].seatId,personA:people[0].personId,personB:people[1].personId,reason,actor:a.uid};
   return{id,next,x,y,e,writes:[write(p+'/head/current',next),write(p+'/people/'+x.personId,x),write(p+'/people/'+y.personId,y),setEvent(p,id,e)]};
  };
  phase=count+'/partial-exchange';let plan=exchangePlan();
  for(let mask=1;mask<15;mask++)denied(await commit(a.token,plan.writes.filter((_,i)=>(mask&(1<<i))!==0)));
  assert.deepEqual(await read(p+'/head/current',a.token),head);assert.deepEqual(await read(p+'/people/'+ids[0],a.token),people[0]);
  report(count,'E01-all-partial-exchanges-rejected',{partialCombinations:14,headAndPeopleUnchanged:true});
  phase=count+'/forged-exchange';
  for(const mutate of [q=>q.x.credentialId='forged',q=>q.x.ticketId=randomUUID(),q=>q.next.assignments[seats[2]]='',q=>q.e.expectedRevision--,q=>q.e.reason='',q=>q.e.actor=b.uid]){
   const q=exchangePlan();mutate(q);denied(await commit(a.token,[write(p+'/head/current',q.next),write(p+'/people/'+q.x.personId,q.x),write(p+'/people/'+q.y.personId,q.y),setEvent(p,q.id,q.e)]));
  }
  denied(await commit(unprepared.token,plan.writes));denied(await commit(h.token,plan.writes));
  report(count,'E02-forged-qr-partial-mapping-and-stale-rejected',{tamperedCases:8,qrAndTicketUnchanged:true,reasonRequiredAfterFirstStart:true});
  phase=count+'/exchange';plan=exchangePlan();ok(await commit(a.token,plan.writes));head=plan.next;
  people[0]=plan.x;people[1]=plan.y;assert.deepEqual(await read(p+'/head/current',a.token),head);
  for(const person of people.slice(0,2))assert.deepEqual(await read(p+'/people/'+person.personId,a.token),person);
  const stored=await read(p+'/operations/'+plan.id,a.token);for(const [k,v]of Object.entries(plan.e))assert.deepEqual(stored[k],v);
  report(count,'E03-protected-exchange',{normalWrites:4,resultIdMatched:true,qrAndTicketPreserved:true,expectedRevision:plan.e.expectedRevision,resultRevision:head.revision});
  denied(await commit(a.token,plan.writes));
  const reused={...copy(head),revision:head.revision+1};denied(await commit(a.token,[write(p+'/head/current',reused)]));
  report(count,'E04-old-operation-replay-rejected',{writeResendAttemptRejected:true,resultLookupIsNotTransportCutTest:true});
  phase=count+'/concurrent-exchange';
  const concurrentA=exchangePlan(head,'架空の交換A'),concurrentB=exchangePlan(head,'架空の交換B');concurrentB.e.actor=b.uid;
  concurrentB.writes=[write(p+'/head/current',concurrentB.next),write(p+'/people/'+concurrentB.x.personId,concurrentB.x),write(p+'/people/'+concurrentB.y.personId,concurrentB.y),setEvent(p,concurrentB.id,concurrentB.e)];
  const race=await Promise.all([commit(a.token,concurrentA.writes),commit(b.token,concurrentB.writes)]);
  assert.equal(race.filter(x=>x.status===200).length,1);denied(race.find(x=>x.status!==200));
  const winner=race[0].status===200?concurrentA:concurrentB;head=winner.next;people[0]=winner.x;people[1]=winner.y;
  assert.deepEqual(await read(p+'/head/current',a.token),head);
  report(count,'E05-concurrent-exchange',{successes:1,rejectedStaleWrites:1,headAndPeopleShareWinningOperation:true});
  phase=count+'/device-stop';
  ok(await commit(h.token,[write('centerDevices/'+a.uid,{deviceUid:a.uid,humanUid:h.uid,active:false,revision:2,preparedRoleRevision:1})]));
  denied(await get(p+'/head/current',a.token));ok(await get(p+'/head/current',b.token));denied(await commit(a.token,exchangePlan().writes));
  await seed('centerDevices/'+a.uid,{deviceUid:a.uid,humanUid:h.uid,active:true,revision:3,preparedRoleRevision:1});
  report(count,'A01-current-device-stop',{normalHumanStop:true,otherDeviceContinues:true,businessWriteDenied:true,restoreOwnerPrecondition:true});
  const oldSession=await read(p+'/sessions/'+a.uid,'owner');
  await seed(p+'/sessions/'+a.uid,{...oldSession,expiresAt:stamp(Date.now()-1000)});denied(await commit(a.token,exchangePlan().writes));
  await seed(p+'/sessions/'+a.uid,oldSession);
  ok(await commit(h.token,[write(p+'/roles/'+h.uid,{...role,active:false,revision:2})]));denied(await commit(a.token,exchangePlan().writes));
  await seed(p+'/roles/'+h.uid,{...role,revision:2});denied(await get(p+'/head/current',a.token));await seed(p+'/roles/'+h.uid,role);
  report(count,'A02-expired-revoked-and-stale-role-rejected',{roleRevocationNormalRequest:true,roleAndSessionRestoreOwnerPrecondition:true});
  phase=count+'/publication';head={...head,phase:'preparing',firstStartedAt:0};await seed(p+'/head/current',head);
  const generation=randomUUID(),proof={ready:true,baseRevision:head.revision,baseGeneration:head.generation,generation,seatIds:seats.slice(0,4096),cellCount:4096,sections:Object.fromEntries(sectionIds.map(id=>[id,generation]))};
  await seed(p+'/proofs/'+generation,proof);
  const added=Object.fromEntries(seats.slice(4032,4096).map(id=>[id,''])),pubId=randomUUID();
  const published={...copy(head),revision:head.revision+1,operationId:pubId,generation,geometryRevision:head.geometryRevision+1,cellCount:4096,sections:proof.sections,seatIds:proof.seatIds,assignments:{...head.assignments,...added}};
  const event={kind:'appendPublication',expectedRevision:head.revision,generation,added,actor:a.uid},pubWrites=[write(p+'/head/current',published),setEvent(p,pubId,event)];
  denied(await commit(a.token,[pubWrites[0]]));denied(await commit(a.token,[pubWrites[1]]));
  report(count,'P01-partial-publication-rejected',{partialCombinations:2,oldHeadPreserved:true});
  await seed(p+'/proofs/'+generation,{...proof,ready:false});denied(await commit(a.token,pubWrites));
  await seed(p+'/proofs/'+generation,{...proof,baseRevision:head.revision-1});denied(await commit(a.token,pubWrites));
  denied(await commit(a.token,[write(p+'/proofs/'+generation,proof)]));await seed(p+'/proofs/'+generation,proof);
  report(count,'P02-ready-proof-and-source-revision-required',{readyProofOwnerPrecondition:true,normalProofCreationNotImplemented:true,forgedProofWritesDenied:true});
  const eraseAssigned=copy(published);eraseAssigned.assignments[seats[0]]='';denied(await commit(a.token,[write(p+'/head/current',eraseAssigned),pubWrites[1]]));
  const removed=copy(proof);removed.seatIds=removed.seatIds.filter(id=>id!==seats[0]);await seed(p+'/proofs/'+generation,removed);
  const removedHead={...copy(published),seatIds:removed.seatIds};delete removedHead.assignments[seats[0]];denied(await commit(a.token,[write(p+'/head/current',removedHead),pubWrites[1]]));
  await seed(p+'/proofs/'+generation,proof);
  report(count,'P03-existing-id-and-assignment-protected',{assignedSeatRemovalAndOverwriteRejected:true});
  ok(await commit(a.token,pubWrites));assert.deepEqual(await read(p+'/head/current',a.token),published);
  for(let i=0;i<count;i++)assert.equal(published.assignments[people[i].seatId],people[i].personId);
  assert.deepEqual(await read(p+'/people/'+ids[0],a.token),people[0]);
  report(count,'P04-4096-cells-16-sections',{normalWrites:2,allAssignmentsPreserved:count,peopleWrites:0,postCommitProjectionCopyWrites:0});
  phase=count+'/capacity';
  const overGeneration=randomUUID(),overProof={...proof,generation:overGeneration,baseGeneration:generation,baseRevision:published.revision,cellCount:4097,seatIds:seats},overId=randomUUID();
  await seed(p+'/proofs/'+overGeneration,overProof);
  const overHead={...copy(published),revision:published.revision+1,operationId:overId,generation:overGeneration,geometryRevision:published.geometryRevision+1,cellCount:4097,seatIds:seats,assignments:{...published.assignments,[seats[4096]]:''}},overEvent={...event,expectedRevision:published.revision,generation:overGeneration,added:{[seats[4096]]:''}};
  denied(await commit(a.token,[write(p+'/head/current',overHead),setEvent(p,overId,overEvent)]));
  const extraSections={...proof.sections,[randomUUID()]:overGeneration},sectionProof={...overProof,cellCount:4096,seatIds:proof.seatIds,sections:extraSections};await seed(p+'/proofs/'+overGeneration,sectionProof);
  denied(await commit(a.token,[write(p+'/head/current',{...overHead,cellCount:4096,seatIds:proof.seatIds,assignments:published.assignments,sections:extraSections}),setEvent(p,overId,{...overEvent,added:{}})]));
  sizes.push({people:count,cells:4096,sections:16,headJsonBytes:Buffer.byteLength(JSON.stringify(published)),headDocumentModelBytes:documentBytes(p+'/head/current',published),headIncludesAllSeatIds:true,headIncludesAllAssignmentIds:true,headContainsNames:false});
  assert(sizes.at(-1).headDocumentModelBytes<1048576);
  report(count,'B01-cell-and-section-limits',{cell4097Rejected:true,section17Rejected:true,documentSizeBelow1MiB:true});
 }
}catch(error){failure={phase,name:error.name,message:error.message};console.error(JSON.stringify({failure}));process.exitCode=1;}
finally{
 try{
  const deny="rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }";
  ok(await request(`http://127.0.0.1:8382/emulator/v1/projects/${project}:securityRules`,undefined,'PUT',{ignore_errors:false,rules:{files:[{name:'security.rules',content:deny}]}}));
  ok(await request(`http://127.0.0.1:8382/emulator/v1/projects/${project}/databases/(default)/documents`,undefined,'DELETE'));
  assert.equal((await request(base+'/centerShows','owner')).body.documents?.length??0,0);
  for(const user of users)ok(await request(auth+'/accounts:delete?key=demo-api-key',undefined,'POST',{idToken:user.token}));
  const remaining=ok(await request(auth+`/projects/${project}/accounts:query`,'owner','POST',{})).body;
  cleanup={rulesClosed:true,trialDocumentsEmpty:true,authUsersRemaining:(remaining.userInfo??[]).length};
 }catch(error){cleanup={...cleanup,error:error.message};process.exitCode=1;}
 const after=sourceHashes(root,entries);fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
 fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:hashes,endSourceHashes:after,rulesHash,reports,sizes,meter,cleanup,failure,
  conservativeReferenceBudget:{exchange:{operation:10,head:2,people:[3,3],total:18},appendPublication:{operation:7,head:2,total:9},cacheDiscountAssumed:false},
  productionImplementation:false,externalFirebaseConnected:false,fullBusinessRegressionVerified:false,normalRegistrationAndProofGenerationVerified:false,receptionProjectionAndImagesVerified:false,actualSdkAndIndexedDbUsed:false,providerBillingMeasured:false},null,2)+'\n');
}
