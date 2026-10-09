import assert from 'node:assert/strict';
import {budgets} from './budgets.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {ready,saveCustomer,customerPlan,assignmentPlan,assignmentWrites,saveAssignment,assignment,controlPlan,saveControl} from './business.mjs';
import {commit,update,get,data,ok,denied,seed,actor,resetCounts,movement,publishSlide} from './support.mjs';
import {ticketPlan,ticketWrites,saveTicket,acceptTicket,ticketSnapshot,generateCredential,generateCode} from './ticket.mjs';
const sources=['../firestore.rules','../firebase.json','support.mjs','business.mjs','ticket.mjs','emulator.mjs','budgets.mjs',
 '../../GD91-16/codec.mjs','../../GD91-07/planner.mjs','../../GD91-08/slide.mjs','../../GD91-10/projection.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
async function record(id,label,run){if(process.env.GD91_CASE&&process.env.GD91_CASE!==id)return;const result=await run();reports.push({id,label,status:'passed',...result});console.log(`${id}: CHECKED ${label}`);}
const conflict=r=>assert([403,409].includes(r.status),JSON.stringify(r.body));
async function setup(n=2,options={}){const f=await ready(options),people=[];for(let i=0;i<n;i++)people.push(await saveCustomer(f));const seats=f.model.seats.slice(0,n).map(s=>s.seatId);await saveAssignment(f,await assignmentPlan(f,'bulkAssign',{mapping:Object.fromEntries(seats.map((s,i)=>[s,people[i].attendeeId]))}));return{f,people,seats};}
async function reject(f,o,w=ticketWrites(f,o),token=f.owner.token,check=denied){const before=await ticketSnapshot(f,o);check(await commit(f,w,token));assert.deepEqual(await ticketSnapshot(f,o),before);}
const equalExceptRequestMetadata=(a,b)=>assert.deepEqual(a,b);
const hasNoRaw=(o,t)=>{const encoded=JSON.stringify(o);assert(!encoded.includes(t.activeCredentialId)&&!encoded.includes(t.activeCode));};

await record('Q01','first QR is six atomic writes and every partial subset leaves all state unchanged',async()=>{
 const{f,people}=await setup(),o=await ticketPlan(f,people[0].attendeeId),w=ticketWrites(f,o);assert.equal(w.length,6);
 assert.equal((await get(f,'tickets/'+people[1].attendeeId)).status,404);
 for(let mask=1;mask<63;mask++)await reject(f,o,w.filter((_,i)=>mask&(1<<i)));
 resetCounts(f);const t=await saveTicket(f,o);assert.deepEqual([f.counts.requests,f.counts.writes],[1,6]);
 assert.equal(t.issued,false);assert.equal(t.sent,false);assert.equal(f.profiles.get(t.attendeeId).paid,false);assert(f.ticket.protectedAttendeeIds.includes(t.attendeeId));
 assert.equal((await get(f,'credentials/'+t.activeCredentialId,f.reader.token)).status,200);
 assert.equal((await get(f,'tickets/'+people[1].attendeeId)).status,404);hasNoRaw(data(await get(f,'operations/'+o.id)),t);
 return{partialSubsetsDenied:62,firstQr:structuredClone(f.counts),otherTicketAbsent:true,paidAndChecksUnchanged:true};
});
await record('Q02','manual issue check is four atomic writes and unchecking preserves the issue history fence',async()=>{
 const{f,people,seats}=await setup(),id=people[0].attendeeId,o=await ticketPlan(f,id,'ticketCheck');const w=ticketWrites(f,o);assert.equal(w.length,4);
 for(let mask=1;mask<15;mask++)await reject(f,o,w.filter((_,i)=>mask&(1<<i)));
 resetCounts(f);let t=await saveTicket(f,o);assert.deepEqual([f.counts.requests,f.counts.writes],[1,4]);assert(t.issuedAt.$timestamp);assert.equal(t.activeCredentialId,'');
 const off=await ticketPlan(f,id,'ticketCheck',{value:false});t=await saveTicket(f,off);assert(!t.issued&&t.everIssued);assert(f.ticket.protectedAttendeeIds.includes(id));
 assert.equal(data(await get(f,'operations/'+off.id)).deviceUid,'');
 await reject(f,off,assignmentWrites(f,await assignmentPlan(f,'unassign',{seat1:seats[0]})));
 const before=await assignment(f);await reject(f,off,assignmentWrites(f,await assignmentPlan(f,'bulkAssign',{mapping:{[seats[0]]:people[1].attendeeId,[seats[1]]:id}})));assert.deepEqual(await assignment(f),before);
 return{partialSubsetsDenied:14,checkWrites:4,everIssued:true,unassignAndBulkDenied:true,actorOmitted:true};
});
await record('Q03','QR and protection survive independent issue sent and payment check changes',async()=>{
 const{f,people}=await setup(),id=people[0].attendeeId;const qr=await saveTicket(f,await ticketPlan(f,id));
 for(const[field,value]of [['issued',true],['issued',false],['sent',true],['sent',false]]){
  const o=await ticketPlan(f,id,'ticketCheck',{field,value}),t=await saveTicket(f,o);assert.equal(t.activeCredentialId,qr.activeCredentialId);assert.equal(t.activeCode,qr.activeCode);assert(f.ticket.protectedAttendeeIds.includes(id));assert(t[field+'At'].$timestamp);
  hasNoRaw(data(await get(f,'operations/'+o.id)),t);assert.equal(data(await get(f,'operations/'+o.id)).deviceUid,'');
 }
 for(const paid of [true,false])await saveCustomer(f,customerPlan(f,{paid},id));
 const t=data(await get(f,'tickets/'+id));assert.equal(t.activeCredentialId,qr.activeCredentialId);assert.equal(t.activeCode,qr.activeCode);assert(!f.profiles.get(id).paid);
 return{independentCheckChanges:4,paymentChanges:2,credentialAndCodeUnchanged:true};
});
await record('Q04','QR may follow a manually unchecked issue flag while the historical protection remains',async()=>{
 const{f,people}=await setup(),id=people[0].attendeeId;await saveTicket(f,await ticketPlan(f,id,'ticketCheck'));await saveTicket(f,await ticketPlan(f,id,'ticketCheck',{value:false}));
 const before=data(await get(f,'tickets/'+id)),t=await saveTicket(f,await ticketPlan(f,id));assert.equal(t.issued,false);assert.equal(t.everIssued,true);assert.deepEqual(t.issuedAt,before.issuedAt);assert(f.ticket.protectedAttendeeIds.includes(id));
 return{manualFirst:true,issuedAtPreserved:true,everIssuedPreserved:true};
});
await record('Q05','schema metadata audit qualification and index forgeries cannot bypass the joint write set',async()=>{
 const{f,people}=await setup(),id=people[0].attendeeId;let count=0;
 const mutations=[o=>o.versions.values.attendee++,o=>o.versions.values.layout++,o=>o.versions.values.control++,o=>o.versions.values.ticket++,o=>o.versions.operationId=randomUUID(),
  o=>o.index.protectedAttendeeIds=[],o=>o.index.protectedAttendeeIds.push(randomUUID()),o=>o.index.revision++,o=>o.index.attendeeId=randomUUID(),
  o=>o.after.currentCycle=2,o=>o.after.cycleClosed=true,o=>o.after.attendeeId=randomUUID(),o=>o.after.ticketId=randomUUID(),o=>o.after.activeCredentialId='A-1',o=>o.after.activeCode='IIII0000',
  o=>o.after.issued=true,o=>o.after.everIssued=true,o=>o.after.buyerName='架空',o=>o.credential.status='revoked',o=>o.credential.ticketId=randomUUID(),o=>o.credential.currentCycle=2,
  o=>o.credential.createdOperationId=randomUUID(),o=>o.code.credentialId=generateCredential(),o=>o.code.active=false,o=>o.code.ticketId=randomUUID(),
  o=>o.event.deviceUid='',o=>o.event.payload.before={},o=>o.event.payload.after.issued=true,o=>o.event.payload.after.credentialVersion=2,
  o=>o.event.payload.rawQr='crs:v1:'+o.after.activeCredentialId,o=>o.event.payload.after.activeCode=o.after.activeCode,o=>o.event.resultVersions.ticket++];
 for(const mutate of mutations){const o=await ticketPlan(f,id);mutate(o);await reject(f,o);count++;}
 for(const schema of [1,3,4])for(const target of ['after','credential','code']){const o=await ticketPlan(f,id);o[target].schemaVersion=schema;await reject(f,o);count++;}
 const t=await saveTicket(f,await ticketPlan(f,id));const clear=await ticketPlan(f,id,'ticketCheck',{field:'issued',value:true});clear.after.everIssued=false;await reject(f,clear);
 const only=await ticketPlan(f,id,'ticketCheck',{field:'sent',value:true});await reject(f,only,[ticketWrites(f,only)[1]]);
 assert.equal(data(await get(f,'tickets/'+id)).activeCredentialId,t.activeCredentialId);
 return{forgedRequestsDenied:count+2,rawValuesNotInAudit:true,oldFormatsDenied:true};
});
await record('Q06','missing unassigned and not attending customers cannot obtain a QR',async()=>{
 const{f,people}=await setup();await reject(f,await ticketPlan(f,randomUUID()));const unassigned=await saveCustomer(f);
 await reject(f,await ticketPlan(f,unassigned.attendeeId));await saveCustomer(f,customerPlan(f,{attendancePlan:'notAttending'},unassigned.attendeeId));
 await reject(f,await ticketPlan(f,unassigned.attendeeId));assert.equal((await get(f,'tickets/'+unassigned.attendeeId)).status,404);
 return{denied:3,unassignedTicketAbsent:true};
});
await record('Q07','credential and confirmation code collisions do not overwrite or partially issue another ticket',async()=>{
 const{f,people}=await setup(),first=await saveTicket(f,await ticketPlan(f,people[0].attendeeId)),id=people[1].attendeeId;
 await reject(f,await ticketPlan(f,id,'qrCreate',{code:first.activeCode}),undefined,undefined,conflict);
 await reject(f,await ticketPlan(f,id,'qrCreate',{credentialId:first.activeCredentialId}),undefined,undefined,conflict);
 assert.equal((await get(f,'tickets/'+id)).status,404);const fresh=await saveTicket(f,await ticketPlan(f,id));assert.notEqual(fresh.activeCredentialId,first.activeCredentialId);assert.notEqual(fresh.activeCode,first.activeCode);
 await reject(f,await ticketPlan(f,id));return{collisionsDenied:2,secondGenerationForExistingCredentialDenied:true,distinctFreshQualification:true};
});
await record('Q08','version changes after confirmation reject the old QR proposal',async()=>{
 const{f,people}=await setup(),id=people[0].attendeeId;
 let o=await ticketPlan(f,id);await saveCustomer(f,customerPlan(f,{seatDisplayName:'架空B'},id));await reject(f,o);
 o=await ticketPlan(f,id);const after=movement(f);await publishSlide(f,after);f.sharedVersions=data(await get(f,'versions/current'));await reject(f,o);
 o=await ticketPlan(f,id);await saveControl(f,await controlPlan(f));await reject(f,o);
 return{staleAttendeeLayoutAndControlDenied:3};
});
await record('Q09','response loss is resolved through operation and limited canonical records without reapplying',async()=>{
 const{f,people}=await setup(),o=await ticketPlan(f,people[0].attendeeId),w=ticketWrites(f,o);ok(await commit(f,w));
 const event=data(await get(f,'operations/'+o.id)),t=data(await get(f,'tickets/'+o.attendeeId));assert.deepEqual(event.resultVersions,o.versions.values);assert.equal(t.activeCredentialId,o.after.activeCredentialId);
 assert.equal(data(await get(f,'credentials/'+t.activeCredentialId)).createdOperationId,o.id);assert.equal(data(await get(f,'confirmationCodes/'+t.activeCode)).createdOperationId,o.id);hasNoRaw(event,t);
 await reject(f,o,w,undefined,conflict);await acceptTicket(f,o);
 const different=structuredClone(o);different.after.activeCredentialId=generateCredential();await reject(f,different,ticketWrites(f,different),undefined,conflict);
 return{sameOperationLocated:true,rawQualificationComparedInRestrictedRecords:true,replaysDenied:2,sdkRetryTested:false};
});
await record('Q10','concurrent initial qualification requests produce at most one complete final winner',async()=>{
 const{f,people}=await setup(),id=people[0].attendeeId,a=await ticketPlan(f,id),b=await ticketPlan(f,id),plans=[a,b];
 const results=await Promise.all(plans.map(o=>commit(f,ticketWrites(f,o))));let successes=results.filter(r=>r.status===200).length,recovered=false;
 if(successes===0){for(let i=0;i<2;i++){assert.equal((await get(f,'operations/'+plans[i].id)).status,404);assert.equal((await get(f,'credentials/'+plans[i].after.activeCredentialId)).status,404);}
  assert.equal((await get(f,'tickets/'+id)).status,404);const retry=results.findIndex(r=>r.status===409&&r.body.error.status==='ABORTED');assert(retry>=0,JSON.stringify(results.map(r=>[r.status,r.body.error?.status])));ok(await commit(f,ticketWrites(f,plans[retry])));recovered=true;successes=1;}
 assert.equal(successes,1);const t=data(await get(f,'tickets/'+id)),winner=plans.find(o=>o.id===t.operationId),loser=plans.find(o=>o.id!==t.operationId);assert(winner&&loser);
 for(const[collection,key]of [['credentials',loser.after.activeCredentialId],['confirmationCodes',loser.after.activeCode],['operations',loser.id]])assert.equal((await get(f,collection+'/'+key)).status,404);
 assert.equal(data(await get(f,'credentials/'+t.activeCredentialId)).createdOperationId,winner.id);assert.equal(data(await get(f,'confirmationCodes/'+t.activeCode)).createdOperationId,winner.id);
 assert.equal(data(await get(f,'ticketState/current')).operationId,winner.id);assert.deepEqual(data(await get(f,'versions/current')).values,winner.versions.values);
 return{completeWinners:1,initialSuccesses:results.filter(r=>r.status===200).length,lockAbortRecovery:recovered};
});
await record('Q11','latest authorization rejects both QR creation and manual ticket checks',async()=>{
 const{f,people}=await setup(),id=people[0].attendeeId;let count=0;
 const cases=[['devices/'+f.owner.uid,{active:false}],['sessions/'+f.owner.uid,{active:false}],['sessions/'+f.owner.uid,{expiresAt:{$timestamp:'2000-01-01T00:00:00Z'}}],
  ['roles/'+f.human.uid,{active:false}],['roles/'+f.human.uid,{role:'temporary'}],['roles/'+f.human.uid,{revision:2}],['devices/'+f.owner.uid,{humanUid:randomUUID()}]];
 for(const[path,changes]of cases){const original=data(await get(f,path));await seed(f,path,{...original,...changes});for(const kind of ['qrCreate','ticketCheck']){await reject(f,await ticketPlan(f,id,kind));count++;}await seed(f,path,original);}
 const stranger=await actor();for(const token of [f.human.token,f.reader.token,stranger.token])for(const kind of ['qrCreate','ticketCheck']){await reject(f,await ticketPlan(f,id,kind),undefined,token);count++;}
 return{deniedRequests:count,authorizationFixturesSeeded:true};
});
await record('Q12','ticket history and confirmation lookup stay private while active staff can resolve credentials',async()=>{
 const{f,people}=await setup(),o=await ticketPlan(f,people[0].attendeeId),t=await saveTicket(f,o);
 for(const path of ['tickets/'+t.attendeeId,'confirmationCodes/'+t.activeCode,'operations/'+o.id,'ticketState/current'])denied(await get(f,path,f.reader.token));
 ok(await get(f,'credentials/'+t.activeCredentialId,f.reader.token));const stranger=await actor();denied(await get(f,'credentials/'+t.activeCredentialId,stranger.token));
 const qual=data(await get(f,'credentials/'+t.activeCredentialId));assert(!Object.hasOwn(qual,'paid')&&!Object.hasOwn(qual,'issued')&&!Object.hasOwn(qual,'buyerName'));
 return{privateReadsDenied:4,strangerDenied:true,minimalCredentialAllowed:true};
});
await record('Q13','an additional ticket cannot piggyback on another customer qualification or check operation',async()=>{
 const{f,people}=await setup(),primary=await ticketPlan(f,people[0].attendeeId),extra=await ticketPlan(f,people[1].attendeeId,'ticketCheck');extra.after.operationId=primary.id;
 await reject(f,primary,[...ticketWrites(f,primary),ticketWrites(f,extra)[0]]);assert.equal((await get(f,'tickets/'+people[1].attendeeId)).status,404);
 await saveTicket(f,await ticketPlan(f,people[1].attendeeId));const next=await ticketPlan(f,people[0].attendeeId),existing=await ticketPlan(f,people[1].attendeeId,'ticketCheck',{field:'sent',value:true});existing.after.operationId=next.id;
 const before=await get(f,'tickets/'+people[1].attendeeId);await reject(f,next,[...ticketWrites(f,next),ticketWrites(f,existing)[0]]);assert.deepEqual(await get(f,'tickets/'+people[1].attendeeId),before);
 return{additionalNewAndExistingTicketsDenied:2};
});
await record('Q14','five hundred normally registered and assigned customers acquire independent qualifications',async()=>{
 const f=await ready({large:true}),people=[];resetCounts(f);
 for(let i=0;i<500;i++){people.push(await saveCustomer(f));if((i+1)%100===0)console.log(`Q14: registered ${i+1}/500`);}const registration=structuredClone(f.counts);
 const mapping=Object.fromEntries(f.model.seats.slice(0,500).map((s,i)=>[s.seatId,people[i].attendeeId]));resetCounts(f);await saveAssignment(f,await assignmentPlan(f,'bulkAssign',{mapping}));const allocation=structuredClone(f.counts),before=await assignment(f);
 resetCounts(f);const credentials=new Set(),codes=new Set();for(let i=0;i<500;i++){
  const t=await saveTicket(f,await ticketPlan(f,people[i].attendeeId));credentials.add(t.activeCredentialId);codes.add(t.activeCode);assert(!t.issued&&!t.sent&&!t.everIssued);if((i+1)%100===0)console.log(`Q14: qualified ${i+1}/500`);}
 const qualifications=structuredClone(f.counts);assert.equal(credentials.size,500);assert.equal(codes.size,500);assert.equal(f.ticket.protectedAttendeeIds.length,500);assert.deepEqual(await assignment(f),before);assert.deepEqual([qualifications.requests,qualifications.writes],[500,3000]);
 const pair=f.model.seats.slice(0,2).map(s=>s.seatId),preserved=await Promise.all(people.slice(0,2).map(p=>get(f,'tickets/'+p.attendeeId)));
 resetCounts(f);await saveAssignment(f,await assignmentPlan(f,'swap',{seat1:pair[0],seat2:pair[1]}));const swap=structuredClone(f.counts);assert.deepEqual(await Promise.all(people.slice(0,2).map(p=>get(f,'tickets/'+p.attendeeId))),preserved);
 resetCounts(f);await publishSlide(f,movement(f));const slide=structuredClone(f.counts);assert.deepEqual(await Promise.all(people.slice(0,2).map(p=>get(f,'tickets/'+p.attendeeId))),preserved);assert.deepEqual((await assignment(f)).assignments,{...before.assignments,[pair[0]]:people[1].attendeeId,[pair[1]]:people[0].attendeeId});
 for(const p of people){const t=data(await get(f,'tickets/'+p.attendeeId));assert(credentials.has(t.activeCredentialId));assert.equal(data(await get(f,'credentials/'+t.activeCredentialId)).ticketId,p.attendeeId);assert.equal(data(await get(f,'confirmationCodes/'+t.activeCode)).ticketId,p.attendeeId);}
 const bootstrap=f.bootstrapCosts,initialization=f.initialCosts;
 return{customers:500,seats:f.model.seats.length,cells:f.model.section.cells.length,bootstrap,initialization,registration,allocation,qualifications,swap,slide,
  totalToQualification:{requests:bootstrap.requests+initialization.requests+registration.requests+allocation.requests+qualifications.requests,writes:bootstrap.writes+initialization.writes+registration.writes+allocation.writes+qualifications.writes},allAssignmentsRetained:true,allQualificationsChecked:true,checksNotAutoUpdated:true};
});


const reissue=(f,id,extra={})=>ticketPlan(f,id,'qrReissue',{reason:'架空の紛失による再発行',stopConfirmed:true,...extra});
async function qualified(n=2){const fxt=await setup(n);for(const p of fxt.people)await saveTicket(fxt.f,await ticketPlan(fxt.f,p.attendeeId));return fxt;}
const noQualificationAudit=(event,o)=>{for(const value of [o.before.activeCredentialId,o.before.activeCode,o.after.activeCredentialId,o.after.activeCode])assert(!JSON.stringify(event).includes(value));};

await record('Q15','all 254 partial reissue subsets fail and eight writes revoke both old references atomically',async()=>{
 const{f,people}=await qualified(),id=people[0].attendeeId;
 await saveTicket(f,await ticketPlan(f,id,'ticketCheck'));await saveTicket(f,await ticketPlan(f,id,'ticketCheck',{field:'sent',value:true}));
 const o=await reissue(f,id),w=ticketWrites(f,o);assert.equal(w.length,8);const beforeAssignment=await assignment(f),beforeProfile=await get(f,'attendees/'+id);
 for(let mask=1;mask<255;mask++)await reject(f,o,w.filter((_,i)=>mask&(1<<i)));
 resetCounts(f);const t=await saveTicket(f,o);assert.deepEqual([f.counts.requests,f.counts.writes],[1,8]);
 for(const k of ['issued','sent','issuedAt','sentAt','everIssued','currentCycle'])assert.deepEqual(t[k],o.before[k]);
 assert.equal(t.credentialVersion,2);assert.equal(data(await get(f,'credentials/'+o.before.activeCredentialId,f.reader.token)).status,'revoked');
 assert.equal(data(await get(f,'confirmationCodes/'+o.before.activeCode)).active,false);
 assert.equal(data(await get(f,'credentials/'+t.activeCredentialId,f.reader.token)).status,'active');assert.equal(data(await get(f,'confirmationCodes/'+t.activeCode)).active,true);
 assert.deepEqual(await assignment(f),beforeAssignment);assert.deepEqual(await get(f,'attendees/'+id),beforeProfile);
 assert(f.ticket.protectedAttendeeIds.includes(id));noQualificationAudit(data(await get(f,'operations/'+o.id)),o);
 return{partialSubsetsDenied:254,reissue:structuredClone(f.counts),oldCredentialRevoked:true,oldCodeInactive:true,checksPaymentSeatAndCyclePreserved:true};
});
await record('Q16','reissue forgeries cannot change flags or revoke another ticket qualification',async()=>{
 const{f,people}=await qualified(),id=people[0].attendeeId,other=data(await get(f,'tickets/'+people[1].attendeeId));let count=0;
 const mutations=[o=>o.after.previousCredentialId=other.activeCredentialId,o=>o.after.previousCode=other.activeCode,o=>o.after.ticketRevision++,
  o=>o.after.credentialVersion++,o=>o.after.activeCredentialId=o.before.activeCredentialId,o=>o.after.activeCode=o.before.activeCode,
  o=>o.after.issued=!o.before.issued,o=>o.after.everIssued=true,o=>o.after.currentCycle++,o=>o.after.cycleClosed=true,
  o=>o.oldCredential.ticketId=other.ticketId,o=>o.oldCredential.status='active',o=>o.oldCredential.revokedOperationId=randomUUID(),
  o=>o.oldCode.credentialId=other.activeCredentialId,o=>o.oldCode.active=true,o=>o.credential.credentialVersion=1,
  o=>o.code.createdOperationId=randomUUID(),o=>o.index.attendeeId=other.attendeeId,o=>o.index.revision++,
  o=>o.event.payload.before.credentialVersion++,o=>o.event.payload.after.credentialVersion++,o=>o.event.payload.rawCredential=o.before.activeCredentialId];
 for(const mutate of mutations){const o=await reissue(f,id);mutate(o);await reject(f,o);count++;}
 const o=await reissue(f,id);o.oldCredential.schemaVersion=4;await reject(f,o);count++;
 return{forgeriesDenied:count};
});
await record('Q17','unknown reissue response and racing reissues never produce two active replacements',async()=>{
 const{f,people}=await qualified(),id=people[0].attendeeId,o=await reissue(f,id),w=ticketWrites(f,o);ok(await commit(f,w));
 const event=data(await get(f,'operations/'+o.id));assert.deepEqual(event.resultVersions,o.versions.values);noQualificationAudit(event,o);
 assert.equal(data(await get(f,'credentials/'+o.before.activeCredentialId)).revokedOperationId,o.id);assert.equal(data(await get(f,'credentials/'+o.after.activeCredentialId)).createdOperationId,o.id);
 await reject(f,o,w,undefined,conflict);const different=structuredClone(o);different.event.payload.reason='別の内容';await reject(f,different,ticketWrites(f,different),undefined,conflict);await acceptTicket(f,o);
 const plans=[await reissue(f,id),await reissue(f,id)],results=await Promise.all(plans.map(p=>commit(f,ticketWrites(f,p))));let recovered=false;
 let winners=results.filter(r=>r.status===200).length;
 if(winners===0){for(const p of plans){assert.equal((await get(f,'operations/'+p.id)).status,404);assert.equal((await get(f,'credentials/'+p.after.activeCredentialId)).status,404);}assert.equal(data(await get(f,'tickets/'+id)).operationId,o.id);
  const at=results.findIndex(r=>r.status===409&&r.body.error.status==='ABORTED');assert(at>=0);ok(await commit(f,ticketWrites(f,plans[at])));winners=1;recovered=true;}
 assert.equal(winners,1);const t=data(await get(f,'tickets/'+id)),winner=plans.find(p=>p.id===t.operationId),loser=plans.find(p=>p.id!==t.operationId);assert(winner&&loser);
 for(const path of ['operations/'+loser.id,'credentials/'+loser.after.activeCredentialId,'confirmationCodes/'+loser.after.activeCode])assert.equal((await get(f,path)).status,404);
 assert.equal(data(await get(f,'credentials/'+o.after.activeCredentialId)).revokedOperationId,winner.id);assert.equal(data(await get(f,'credentials/'+t.activeCredentialId)).status,'active');
 return{responseLocated:true,replaysDenied:2,completeWinners:1,initialWinners:results.filter(r=>r.status===200).length,lockAbortRecovery:recovered,sdkRetryTested:false};
});
await record('Q18','latest customer layout control and authorization fences apply to reissue',async()=>{
 const{f,people}=await qualified(),id=people[0].attendeeId;let count=0;
 let o=await reissue(f,id);await saveCustomer(f,customerPlan(f,{paid:true},id));await reject(f,o);count++;
 o=await reissue(f,id);await publishSlide(f,movement(f));f.sharedVersions=data(await get(f,'versions/current'));await reject(f,o);count++;
 o=await reissue(f,id);await saveControl(f,await controlPlan(f));await reject(f,o);count++;
 for(const[path,changes]of [['devices/'+f.owner.uid,{active:false}],['sessions/'+f.owner.uid,{active:false}],['roles/'+f.human.uid,{role:'temporary'}],['roles/'+f.human.uid,{revision:2}]]){
  const original=data(await get(f,path));await seed(f,path,{...original,...changes});await reject(f,await reissue(f,id));count++;await seed(f,path,original);}
 const stranger=await actor();for(const token of [f.reader.token,f.human.token,stranger.token]){await reject(f,await reissue(f,id),undefined,token);count++;}
 return{staleAndUnauthorizedRequestsDenied:count};
});
await record('Q19','collisions and repeated reissue preserve tombstones across swaps and check changes',async()=>{
 const{f,people,seats}=await qualified(),id=people[0].attendeeId,other=data(await get(f,'tickets/'+people[1].attendeeId)),history=[];
 for(const extra of [{code:other.activeCode},{credentialId:other.activeCredentialId}])await reject(f,await reissue(f,id,extra),undefined,undefined,conflict);
 for(let i=0;i<3;i++){const o=await reissue(f,id);await saveTicket(f,o);history.push(o);}
 for(const old of history){assert.equal(data(await get(f,'credentials/'+old.before.activeCredentialId)).status,'revoked');assert.equal(data(await get(f,'confirmationCodes/'+old.before.activeCode)).active,false);}
 await reject(f,await reissue(f,id,{code:history[0].before.activeCode}),undefined,undefined,conflict);
 await reject(f,await reissue(f,id,{credentialId:history[0].before.activeCredentialId}),undefined,undefined,conflict);
 await saveTicket(f,await ticketPlan(f,id,'ticketCheck'));await saveTicket(f,await ticketPlan(f,id,'ticketCheck',{value:false}));
 const before=await get(f,'tickets/'+id);await saveAssignment(f,await assignmentPlan(f,'swap',{seat1:seats[0],seat2:seats[1]}));assert.deepEqual(await get(f,'tickets/'+id),before);
 await reject(f,await reissue(f,id),assignmentWrites(f,await assignmentPlan(f,'unassign',{seat1:seats[1]})));
 return{collisionsDenied:4,reissues:3,allOldReferencesRemainInvalid:true,swapPreservesTicket:true,protectionPreserved:true};
});
await record('Q20','missing physical stop assertion or reason holds the operation and direct false acknowledgments fail',async()=>{
 const{f,people}=await qualified(),id=people[0].attendeeId;const before=await get(f,'tickets/'+id);
 for(const extra of [{stopConfirmed:false},{reason:''},{reason:'   '}])await assert.rejects(()=>reissue(f,id,extra));
 assert.deepEqual(await get(f,'tickets/'+id),before);
 for(const mutate of [o=>o.event.payload.stopConfirmed=false,o=>delete o.event.payload.stopConfirmed,o=>o.event.payload.confirmedControlVersion--,o=>o.event.payload.reason='',o=>o.event.payload.reason='   ',o=>o.event.payload.reason='a'.repeat(501)]){const o=await reissue(f,id);mutate(o);await reject(f,o);}
 return{plannerHolds:3,directRequestsDenied:6,physicalFleetVerified:false,updateReceiptAndResumeUntested:true};
});
await record('Q21','reduced reference checks cannot authorize lone writes replays reactivation or extra targets',async()=>{
 const{f,people}=await qualified(),id=people[0].attendeeId,o=await reissue(f,id),extra=await reissue(f,people[1].attendeeId);let count=0;
 extra.after.operationId=o.id;extra.after.ticketRevision=o.after.ticketRevision;await reject(f,o,[...ticketWrites(f,o),ticketWrites(f,extra)[0]]);count++;
 for(const w of ticketWrites(f,o)){await reject(f,o,[w]);count++;}
 await saveTicket(f,o);const after=ticketWrites(f,o);for(const i of [1,4,5,6,7]){await reject(f,o,[after[i]],undefined,conflict);count++;}
 const oldC=data(await get(f,'credentials/'+o.before.activeCredentialId)),oldK=data(await get(f,'confirmationCodes/'+o.before.activeCode));
 await reject(f,o,[update(f,'credentials/'+o.before.activeCredentialId,{...oldC,status:'active',revokedOperationId:''},undefined,true)]);count++;
 await reject(f,o,[update(f,'confirmationCodes/'+o.before.activeCode,{...oldK,active:true,revokedOperationId:''},undefined,true)]);count++;
 const forged=generateCredential();await reject(f,o,[update(f,'credentials/'+forged,o.credential,undefined,false)]);assert.equal((await get(f,'credentials/'+forged)).status,404);count++;
 await reject(f,o,[update(f,'credentials/'+extra.before.activeCredentialId,{...data(await get(f,'credentials/'+extra.before.activeCredentialId)),status:'revoked',revokedOperationId:o.id},undefined,true)]);count++;
 return{additionalLoneReplayAndReactivationRequestsDenied:count};
});

const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({project:'demo-concert-seat-gd91-31',executedAt:new Date().toISOString(),runtime:{node:process.version},selectedCase:process.env.GD91_CASE??'all',hashLineEndings:'LF',sourceHashes,endSourceHashes,budgets,
 scope:'Single section; first qualification, manual checks and loss reissue; REST commit; seeded role/device/control. Device-stop confirmation is an asserted precondition, not physical fleet verification. Nonattendance/cycle reopening, SDK, IndexedDB, output files and physical devices untested.',reports},null,2)+'\n');
console.log(`${reports.length} scenarios executed`);
