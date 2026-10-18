import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {buildRules} from './generate.mjs';import {client} from './sdk.mjs';
import {project,base,auth,users,meter,body,stamp,request,write,commit,get,ok,denied,seed,actor,documentBytes} from './client.mjs';
assert.equal(process.env.GCLOUD_PROJECT,project);assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8383');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9493');
const root=new URL('./',import.meta.url),entries=['local.mjs','client.mjs','sdk.mjs','generate.mjs','run-local.mjs','auth.rules','registration.rules','firebase.json','../GD91-138/business.rules'];
const hashes=sourceHashes(root,entries),rulesHash=createHash('sha256').update(buildRules()).digest('hex'),reports=[],profiles=[],allClients=[];
let phase='setup',failure,cleanup={};const report=(n,id,data={})=>{reports.push({people:n,id,...data});console.log(JSON.stringify({people:n,case:id,passed:true}));};
const read=async(p,token)=>body(ok(await get(p,token)).body);
const delta=(p,value,mask)=>({...write(p,value),updateMask:{fieldPaths:mask}});
const sdkDenied=async fn=>assert.rejects(fn,e=>e.code==='permission-denied');
let accessChecks=0,blockedGroups=0;
async function accessGate(sdk,p){accessChecks++;const r=await get(p+'/access/current',sdk.actor.token);if(r.status!==200){blockedGroups++;throw Object.assign(new Error('fresh-access-denied'),{code:'permission-denied'});}return r.body;}
async function guardedBatch(sdk,p,paths){await accessGate(sdk,p);const values=await Promise.all(paths.map(path=>sdk.read(path)));await accessGate(sdk,p);return values;}
const guardedRead=async(sdk,p,path)=>(await guardedBatch(sdk,p,[path]))[0];
const role=(p,name)=>({performanceId:p,active:true,role:name,revision:1,startsAt:stamp(Date.now()-60000),endsAt:stamp(Date.now()+3600000)});
async function passwordHuman(){
 const email='fake-'+randomUUID()+'@example.com',password=randomUUID()+'Aa7!';let r=ok(await request(auth+'/accounts:signUp?key=demo-api-key',null,'POST',{email,password,returnSecureToken:true}));
 ok(await request(auth+`/projects/${project}/accounts:update`,'owner','POST',{localId:r.body.localId,emailVerified:true}));
 r=ok(await request(auth+'/accounts:signInWithPassword?key=demo-api-key',null,'POST',{email,password,returnSecureToken:true}));
 const h={uid:r.body.localId,token:r.body.idToken};users.push(h);return h;
}
async function prepare(p,show,h,d){
 const provider=JSON.parse(Buffer.from(h.token.split('.')[1],'base64url')).firebase.sign_in_provider;
 await seed(p+'/devices/'+d.uid,{performanceId:show,deviceUid:d.uid,humanUid:h.uid,active:true,revision:1,preparedRoleRevision:1});
 const s={performanceId:show,deviceUid:d.uid,humanUid:h.uid,active:true,revision:1,roleRevision:1,authProvider:provider,emailVerified:true,
  expiresAt:stamp(Date.now()+1800000),humanAuthTime:stamp(JSON.parse(Buffer.from(h.token.split('.')[1],'base64url')).auth_time*1000)};
 ok(await commit(h.token,[write(p+'/sessions/'+d.uid,s,'issuedAt')]));
}
function plan(p,show,head,manager,seatId,ordinal){
 const id=randomUUID(),personId=randomUUID(),buyerId=randomUUID(),next={...structuredClone(head),revision:head.revision+1,operationId:id,peopleIds:[...head.peopleIds,personId],nextOrdinal:head.nextOrdinal+1};
 if(seatId)next.assignments[seatId]=personId;
 const person={performanceId:show,personId,buyerId,buyerName:ordinal===1?'架'.repeat(50):'架空購入者'+ordinal,paid:ordinal%2===0,rosterOrder:head.nextOrdinal,seatId,ticketId:'',credentialId:'',revision:1,lastOp:id};
 const label={performanceId:show,personId,displayName:ordinal===1?'架 空ABCD':'架 空'+String(ordinal).padStart(4,'0'),revision:1,lastOp:id};
 const event={kind:'registerPerson',expectedRevision:head.revision,personId,seatId,reason:head.firstStartedAt?'架空の当日追加':'',actor:manager.uid};
 return{id,personId,next,person,label,event};
}
function writes(p,q){
 const value={revision:q.next.revision,operationId:q.id,peopleIds:q.next.peopleIds,nextOrdinal:q.next.nextOrdinal},mask=Object.keys(value);
 if(q.person.seatId){value.assignments={[q.person.seatId]:q.personId};mask.push('assignments.`'+q.person.seatId+'`');}
 return[delta(p+'/head/current',value,mask),write(p+'/people/'+q.personId,q.person),write(p+'/labels/'+q.personId,q.label),write(p+'/operations/'+q.id,q.event,'at')];
}
try{
 for(const n of [requestedPeople()]){
  phase=n+'/fixture';const show=randomUUID(),p='centerShows/'+show,h=await actor(true),manager=await actor(),spare=await actor(),clients=[],staff=[];
  await seed(p+'/roles/'+h.uid,role(show,'owner'));await prepare(p,show,h,manager);await prepare(p,show,h,spare);
  for(let i=0;i<6;i++){const person=await passwordHuman(),sdk=await client();allClients.push(sdk);clients.push(sdk);staff.push(person);await seed(p+'/roles/'+person.uid,role(show,'receptionist'));await prepare(p,show,person,sdk.actor);}
  const seats=Array.from({length:4096},()=>randomUUID()),generation=randomUUID();let head={performanceId:show,phase:'preparing',firstStartedAt:0,revision:1,operationId:randomUUID(),geometryRevision:1,generation,cellCount:4096,
   sections:Object.fromEntries(Array.from({length:16},()=>[randomUUID(),generation])),seatIds:seats,assignments:Object.fromEntries(seats.map(id=>[id,''])),peopleIds:[],nextOrdinal:1};
  await seed(p+'/head/current',head);await seed(p+'/access/current',{performanceId:show});const initialHead=structuredClone(head),registered=[];
  assert.equal((await request(base+'/'+p+'/people','owner')).body.documents?.length??0,0);
  report(n,'F01-empty-roster',{registeredDevices:8,actualSdkContexts:6,allSessionsNormallyIssued:true,headGeometryAndRoleRegistrationOwnerPreconditions:true,peopleOwnerSeeds:0});
  phase=n+'/negative';const first=plan(p,show,head,manager,seats[0],1);
  for(let mask=1;mask<15;mask++)denied(await commit(manager.token,writes(p,first).filter((_,i)=>(mask&(1<<i))!==0)));
  assert.deepEqual(await read(p+'/head/current',manager.token),initialHead);
  report(n,'R01-registration-partials',{rejectedCombinations:14,headUnchanged:true});
  for(const mutate of [q=>q.person.buyerName='架'.repeat(51),q=>q.person.buyerName=' 架空',q=>q.person.buyerName='   ',q=>q.label.displayName='ABCDEFG',q=>q.label.buyerName='private',q=>q.person.buyerId='forged',q=>q.event.expectedRevision--]){
   const q=plan(p,show,head,manager,seats[0],1);mutate(q);denied(await commit(manager.token,writes(p,q)));
  }
  denied(await commit(clients[0].actor.token,writes(p,first)));
  report(n,'R02-private-data-and-input-guards',{invalidInputs:7,receptionistBusinessWriteDenied:true,displayWhitespaceSixCharacterRule:true});
  phase=n+'/normal-registration';const start=Date.now(),before={...meter};
  for(let i=0;i<n-1;i++){
   const q=plan(p,show,head,manager,seats[i],i+1);ok(await commit(manager.token,writes(p,q)));head=q.next;registered.push(q);
   if((i+1)%100===0)console.log(JSON.stringify({people:n,stage:'registered',count:i+1}));
  }
  assert.deepEqual(await read(p+'/head/current',manager.token),head);
  for(const q of [registered[0],registered.at(-1)])assert.deepEqual(await read(p+'/people/'+q.personId,manager.token),q.person);
  const normalRegistration={people:n-1,elapsedMs:Date.now()-start,normalWrites:meter.normalWrites-before.normalWrites,normalCommits:meter.normalCommits-before.normalCommits,
   restObservedRequestBytes:meter.upBytes-before.upBytes,restObservedResponseBytes:meter.downBytes-before.downBytes};
  assert.equal(normalRegistration.normalWrites,4*(n-1));report(n,'R03-normal-registration',{...normalRegistration,ownerPersonOrLabelWrites:0});
  phase=n+'/reception';head={...head,phase:'operating',firstStartedAt:1};await seed(p+'/head/current',head);
  const labelCounts=[],sdkJsonBytes=[];
  for(const sdk of clients){const firstHead=await guardedRead(sdk,p,p+'/head/current');assert.equal(firstHead.revision,head.revision);let bytes=Buffer.byteLength(JSON.stringify(firstHead));
   for(let offset=0;offset<registered.length;offset+=12){const batch=registered.slice(offset,offset+12),data=await guardedBatch(sdk,p,batch.map(q=>p+'/labels/'+q.personId));for(let k=0;k<data.length;k++){assert.deepEqual(data[k],batch[k].label);assert(!('buyerName'in data[k])&&!('paid'in data[k])&&!('buyerId'in data[k]));bytes+=Buffer.byteLength(JSON.stringify(data[k]));}}
   assert.equal((await guardedRead(sdk,p,p+'/head/current')).revision,head.revision);labelCounts.push(registered.length);sdkJsonBytes.push(bytes);
  }
  report(n,'S01-six-sdk-public-labels',{receivedPerClient:labelCounts,privateBuyerFieldsExcluded:true,mixedRevisionRejectedByComparison:true,sdkApplicationJsonBytes:sdkJsonBytes,sdkWireBytesMeasured:false});
  await sdkDenied(()=>clients[0].read(p+'/people/'+registered[0].personId));await sdkDenied(()=>clients[0].read(p+'/operations/'+registered[0].id));
  denied(await request(base+'/'+p+'/roles',clients[0].actor.token));
  report(n,'S02-management-data-denied',{peopleAndOperationServerReadsDenied:true,roleListDenied:true});
  phase=n+'/late-registration';const late=plan(p,show,head,manager,n===4?'':seats[n-1],n);ok(await commit(manager.token,writes(p,late)));head=late.next;registered.push(late);
  for(const sdk of clients){assert.equal((await guardedRead(sdk,p,p+'/head/current')).peopleIds.length,n);if(n===4)await sdkDenied(()=>guardedRead(sdk,p,p+'/labels/'+late.personId));else assert.deepEqual(await guardedRead(sdk,p,p+'/labels/'+late.personId),late.label);}
  assert.deepEqual(await read(p+'/operations/'+late.id,manager.token).then(e=>Object.fromEntries(Object.keys(late.event).map(k=>[k,e[k]]))),late.event);
  denied(await commit(manager.token,writes(p,late)));
  report(n,'R04-late-addition-and-optional-seat',{finalPeople:n,assignedPeople:n===4?n-1:n,unassignedLabelHidden:n===4,oldOperationReplayRejected:true,newIdResultMatched:true});
  phase=n+'/revocation';const target=clients[0].actor;
  ok(await commit(h.token,[delta(p+'/devices/'+target.uid,{active:false,revision:2},['active','revision'])]));
  phase=n+'/device-stop-rest-head';denied(await get(p+'/head/current',target.token));
  phase=n+'/device-stop-sdk-head';await sdkDenied(()=>clients[0].read(p+'/head/current'));
  phase=n+'/device-stop-sdk-label';await sdkDenied(()=>clients[0].read(p+'/labels/'+registered[0].personId));await sdkDenied(()=>guardedRead(clients[0],p,p+'/head/current'));assert.equal((await guardedRead(clients[1],p,p+'/head/current')).revision,head.revision);
  const oldDevice=await read(p+'/devices/'+target.uid,'owner');await seed(p+'/devices/'+target.uid,{...oldDevice,active:true,revision:3});
  const targetRole=await read(p+'/roles/'+staff[0].uid,'owner');ok(await commit(h.token,[delta(p+'/roles/'+staff[0].uid,{active:false,revision:2},['active','revision'])]));
  phase=n+'/role-revoke-rest-head';denied(await get(p+'/head/current',target.token));
  phase=n+'/role-revoke-sdk-head';await sdkDenied(()=>clients[0].read(p+'/head/current'));await sdkDenied(()=>guardedRead(clients[0],p,p+'/head/current'));await seed(p+'/roles/'+staff[0].uid,targetRole);
  const targetSession=await read(p+'/sessions/'+target.uid,'owner');await seed(p+'/sessions/'+target.uid,{...targetSession,expiresAt:stamp(Date.now()-1000)});
  phase=n+'/session-expiry-rest-head';denied(await get(p+'/head/current',target.token));
  phase=n+'/session-expiry-sdk-head';let rawSdkExpiryAllowed=false;try{await clients[0].read(p+'/head/current');rawSdkExpiryAllowed=true;}catch(error){assert.equal(error.code,'permission-denied');}
  phase=n+'/session-expiry-access-gate';await sdkDenied(()=>guardedRead(clients[0],p,p+'/head/current'));
  phase=n+'/session-expiry-new-connection';await clients[0].resetConnection();await sdkDenied(()=>clients[0].read(p+'/head/current'));await seed(p+'/sessions/'+target.uid,targetSession);
  report(n,'X01-raw-sdk-expiry-observation',{restReadDenied:true,rawSdkReturnedData:rawSdkExpiryAllowed,rawSdkAloneExpiryBoundaryVerified:false,newConnectionRejectedExpiredSession:true,freshGateRejectsBeforeReturningData:true,causeUnresolved:true});
  report(n,'A01-sdk-stop-role-and-session-expiry',{normalManagerStopOfOtherHuman:true,otherDeviceContinues:true,normalRoleRevocation:true,sessionExpiryOwnerPrecondition:true,restoresOwnerPreconditions:true});
  phase=n+'/performance-isolation';const otherShow=randomUUID(),other='centerShows/'+otherShow;await seed(other+'/roles/'+staff[0].uid,role(otherShow,'receptionist'));await prepare(other,otherShow,staff[0],target);await seed(other+'/head/current',{...head,performanceId:otherShow});await seed(other+'/access/current',{performanceId:otherShow});
  await clients[0].resetConnection();
  ok(await commit(h.token,[delta(p+'/devices/'+target.uid,{active:false,revision:4},['active','revision'])]));await sdkDenied(()=>guardedRead(clients[0],p,p+'/head/current'));assert.equal((await guardedRead(clients[0],other,other+'/head/current')).performanceId,otherShow);
  report(n,'A02-performance-scoped-stop',{sameAnonymousUidInTwoPerformances:true,otherPerformanceUnaffected:true,otherHeadOwnerPrecondition:true});
  const headBytes=documentBytes(p+'/head/current',head);
  profiles.push({people:n,normalRegistration,lateRegistrationNormalWrites:4,headApplicationJsonBytes:Buffer.byteLength(JSON.stringify(head)),headDocumentModelBytes:headBytes,registeredDeviceCount:8,
   publicLabelsPerClient:n===4?n-1:n,readContexts:6,allPersonAndLabelWritesNormal:true,normalInitializationAndStartVerified:false,normalAutomaticAllocationVerified:false});
  assert(headBytes<1048576);
 }
}catch(error){failure={phase,name:error.name,message:error.message};console.error(JSON.stringify({failure}));process.exitCode=1;}
finally{
 try{
  for(const sdk of allClients)await sdk.close();
  const deny="rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }";
  ok(await request(`http://127.0.0.1:8383/emulator/v1/projects/${project}:securityRules`,undefined,'PUT',{ignore_errors:false,rules:{files:[{name:'security.rules',content:deny}]}}));
  ok(await request(`http://127.0.0.1:8383/emulator/v1/projects/${project}/databases/(default)/documents`,undefined,'DELETE'));
  assert.equal((await request(base+'/centerShows','owner')).body.documents?.length??0,0);
  for(const user of users)ok(await request(auth+'/accounts:delete?key=demo-api-key',undefined,'POST',{idToken:user.token}));
  const remaining=ok(await request(auth+`/projects/${project}/accounts:query`,'owner','POST',{})).body;
  cleanup={sdkClientsClosed:true,rulesClosed:true,trialDocumentsEmpty:true,authUsersRemaining:(remaining.userInfo??[]).length};
 }catch(error){cleanup={...cleanup,error:error.message};process.exitCode=1;}
  const after=sourceHashes(root,entries);fs.mkdirSync(new URL('artifacts/',root),{recursive:true});fs.writeFileSync(new URL('artifacts/profile-'+requestedPeople()+'.json',root),JSON.stringify({sourceHashes:hashes,endSourceHashes:after,rulesHash,reports,profiles,meter,accessChecks,blockedGroups,cleanup,failure,
  externalFirebaseConnected:false,productionImplementation:false,actualSdkContextsUsed:true,allBusinessRegressionVerified:false,fullBusinessFreeTierVerified:false,normalInitializationAndStartVerified:false,
  deviceAndRoleRegistrationOwnerPreconditions:true,temporaryBaselineRoleTransitionVerified:false,sharedBuyerAndTicketLifecycleVerified:false,rawSdkExpiryEnforcementVerified:false,accessGateCandidateVerified:!failure,providerBillingMeasured:false,sdkWireBytesMeasured:false},null,2)+'\n');
}
function requestedPeople(){const n=Number(process.argv.find(x=>x.startsWith('--people='))?.split('=')[1]??4);assert([4,600,1000].includes(n));return n;}
