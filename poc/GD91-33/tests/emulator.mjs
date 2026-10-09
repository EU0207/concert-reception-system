import {noTicketPlan,noTicketWrites,saveNoTicket,acceptNoTicket,noTicketSnapshot} from './no-ticket-cancel.mjs';
import assert from 'node:assert/strict';
import {cancelPlan,cancelWrites,saveCancel,acceptCancel,cancelSnapshot} from './cancel.mjs';
import {budgets} from './budgets.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {ready,saveCustomer,customerPlan,customerWrites,bootstrap,assignmentPlan,assignmentWrites,saveAssignment,assignment,controlPlan,saveControl} from './business.mjs';
import {commit,update,get,data,ok,denied,seed,actor,fixture,resetCounts,movement,publishSlide} from './support.mjs';
import {ticketPlan,ticketWrites,saveTicket,acceptTicket,ticketSnapshot,generateCredential,generateCode} from './ticket.mjs';
const sources=['../firestore.rules','../firebase.json','support.mjs','business.mjs','ticket.mjs','emulator.mjs','budgets.mjs','cancel.mjs','no-ticket-cancel.mjs',
 '../../GD91-16/codec.mjs','../../GD91-07/planner.mjs','../../GD91-08/slide.mjs','../../GD91-10/projection.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
async function record(id,label,run){if(process.env.GD91_CASE&&process.env.GD91_CASE!==id)return;const result=await run();reports.push({id,label,status:'passed',...result});console.log(`${id}: CHECKED ${label}`);}
const conflict=r=>assert([403,409].includes(r.status),JSON.stringify(r.body));
let largeFixture;
async function setup(n=2,options=n>16?{large:true}:{}){const f=await ready(options),people=[];for(let i=0;i<n;i++)people.push(await saveCustomer(f));const seats=f.model.seats.slice(0,n).map(s=>s.seatId);await saveAssignment(f,await assignmentPlan(f,'bulkAssign',{mapping:Object.fromEntries(seats.map((s,i)=>[s,people[i].attendeeId]))}));return{f,people,seats};}
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
 for(const schema of [1,3,4,5,6])for(const target of ['after','credential','code']){const o=await ticketPlan(f,id);o[target].schemaVersion=schema;await reject(f,o);count++;}
 const t=await saveTicket(f,await ticketPlan(f,id));const clear=await ticketPlan(f,id,'ticketCheck',{field:'issued',value:true});clear.after.everIssued=false;await reject(f,clear);
 const only=await ticketPlan(f,id,'ticketCheck',{field:'sent',value:true});await reject(f,only,[ticketWrites(f,only)[1]]);
 assert.equal(data(await get(f,'tickets/'+id)).activeCredentialId,t.activeCredentialId);
 return{forgedRequestsDenied:count+2,rawValuesNotInAudit:true,oldFormatsDenied:true};
});
await record('Q06','missing unassigned and not attending customers cannot obtain a QR',async()=>{
 const{f,people}=await setup();await reject(f,await ticketPlan(f,randomUUID()));const unassigned=await saveCustomer(f);
 await reject(f,await ticketPlan(f,unassigned.attendeeId));await saveNoTicket(f,await noTicketPlan(f,unassigned.attendeeId));
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
 largeFixture={f,people};
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


async function rejectCancel(f,o,w=cancelWrites(f,o),token=f.owner.token,check=denied){const before=await cancelSnapshot(f,o);check(await commit(f,w,token));assert.deepEqual(await cancelSnapshot(f,o),before);}
async function issuedFixture(){const x=await qualified(),id=x.people[0].attendeeId;await saveCustomer(x.f,customerPlan(x.f,{paid:true},id));await saveTicket(x.f,await ticketPlan(x.f,id,'ticketCheck'));await saveTicket(x.f,await ticketPlan(x.f,id,'ticketCheck',{field:'sent',value:true}));await seed(x.f,'receptions/'+id,{attendeeId:id,firstReceivedAt:{$timestamp:'2026-10-01T00:00:00Z'},eventId:randomUUID()});return x;}
await record('Q22','a stored operation cannot authorize a new ticket-only check mutation',async()=>{
 const{f,people}=await qualified(1),id=people[0].attendeeId,before=data(await get(f,'tickets/'+id)),o=await ticketPlan(f,id,'ticketCheck');
 Object.assign(o.after,{operationId:before.operationId,ticketRevision:before.ticketRevision,expectedVersions:before.expectedVersions,resultVersions:before.resultVersions});
 await reject(f,o,[ticketWrites(f,o)[0]]);assert.deepEqual(data(await get(f,'tickets/'+id)),before);return{existingOperationLoneTicketDenied:true,sharedTicketVersionMustAdvance:true};
});
await record('Q23','all 510 nonattendance partial sets fail and nine writes preserve payment and first reception',async()=>{
 const{f,people}=await issuedFixture(),id=people[0].attendeeId,o=await cancelPlan(f,id),w=cancelWrites(f,o),reception=await get(f,'receptions/'+id),other=await get(f,'tickets/'+people[1].attendeeId);assert.equal(w.length,9);
 for(let mask=1;mask<511;mask++)await rejectCancel(f,o,w.filter((_,i)=>mask&(1<<i)));
 resetCounts(f);const t=await saveCancel(f,o);assert.deepEqual([f.counts.requests,f.counts.writes],[1,9]);assert(t.cycleClosed&&!t.issued&&!t.sent&&t.activeCredentialId==='');assert.equal(t.everIssued,true);
 assert.equal(f.profiles.get(id).paid,true);assert(!f.people.eligibleAttendeeIds.includes(id)&&!f.ticket.protectedAttendeeIds.includes(id));assert.equal((await assignment(f)).assignments[o.oldSeatId],'');
 assert.equal(data(await get(f,'credentials/'+o.before.activeCredentialId,f.reader.token)).status,'revoked');assert.equal(data(await get(f,'confirmationCodes/'+o.before.activeCode)).active,false);
 assert.deepEqual(await get(f,'receptions/'+id),reception);assert.deepEqual(await get(f,'tickets/'+people[1].attendeeId),other);
 const event=data(await get(f,'operations/'+o.id));assert.equal(event.payload.oldSeatId,o.oldSeatId);assert(event.payload.before.issued&&event.payload.before.sent);hasNoRaw(event,o.before);
 return{partialSubsetsDenied:510,cancel:structuredClone(f.counts),paymentAndSeededReceptionPreserved:true,oldSeatAndTicketFactsInAudit:true,otherTicketUnchanged:true};
});
await record('Q24','return does not reclaim the old seat or ticket and a new assigned cycle gets a new qualification',async()=>{
 const{f,people}=await issuedFixture(),id=people[0].attendeeId,o=await cancelPlan(f,id);await saveCancel(f,o);const closed=await get(f,'tickets/'+id),oldCredential=await get(f,'credentials/'+o.before.activeCredentialId),reception=await get(f,'receptions/'+id);
 const third=await saveCustomer(f);await saveAssignment(f,await assignmentPlan(f,'assign',{seat1:o.oldSeatId,attendeeId:third.attendeeId}));
 resetCounts(f);await saveCustomer(f,customerPlan(f,{attendancePlan:'planned'},id));const costs=structuredClone(f.counts);assert.deepEqual([costs.requests,costs.writes],[1,4]);
 assert.deepEqual(await get(f,'tickets/'+id),closed);assert.deepEqual(await get(f,'credentials/'+o.before.activeCredentialId),oldCredential);assert.deepEqual(await get(f,'receptions/'+id),reception);
 assert.equal((await assignment(f)).assignments[o.oldSeatId],third.attendeeId);assert(!Object.values((await assignment(f)).assignments).includes(id));assert(f.profiles.get(id).paid);
 await reject(f,await ticketPlan(f,id));await reject(f,await ticketPlan(f,id,'ticketCheck'));
 const newSeat=f.model.seats[5].seatId;await saveAssignment(f,await assignmentPlan(f,'assign',{seat1:newSeat,attendeeId:id}));const t=await saveTicket(f,await ticketPlan(f,id));
 assert.equal(t.currentCycle,2);assert(!t.cycleClosed&&!t.issued&&!t.sent&&!t.everIssued);assert.notEqual(t.activeCredentialId,o.before.activeCredentialId);assert.notEqual(t.activeCode,o.before.activeCode);assert.equal(data(await get(f,'credentials/'+o.before.activeCredentialId)).status,'revoked');
 return{return:costs,oldSeatOccupiedByOtherPreserved:true,unassignedQrAndReopenCheckDenied:2,newCycle:2,newQualification:true};
});
await record('Q25','confirmation becomes stale after customer seat control or authorization changes',async()=>{
 const{f,people,seats}=await issuedFixture(),id=people[0].attendeeId;let count=0;
 let o=await cancelPlan(f,id);await saveCustomer(f,customerPlan(f,{seatDisplayName:'架空B'},id));await rejectCancel(f,o);count++;
 o=await cancelPlan(f,id);await saveAssignment(f,await assignmentPlan(f,'swap',{seat1:seats[0],seat2:seats[1]}));await rejectCancel(f,o);count++;
 o=await cancelPlan(f,id);await saveControl(f,await controlPlan(f));await rejectCancel(f,o);count++;
 for(const[path,changes]of [['devices/'+f.owner.uid,{active:false}],['sessions/'+f.owner.uid,{active:false}],['roles/'+f.human.uid,{role:'temporary'}],['roles/'+f.human.uid,{revision:2}]]){const original=data(await get(f,path));await seed(f,path,{...original,...changes});await rejectCancel(f,await cancelPlan(f,id));count++;await seed(f,path,original);}
 const stranger=await actor();for(const token of [f.reader.token,f.human.token,stranger.token]){await rejectCancel(f,await cancelPlan(f,id),undefined,token);count++;}
 return{staleAndUnauthorizedRequestsDenied:count};
});
await record('Q26','forgeries cannot change payment another seat another ticket or the immutable reception',async()=>{
 const{f,people}=await issuedFixture(),id=people[0].attendeeId,other=people[1].attendeeId;let count=0;
 const mutations=[o=>o.profile.paid=false,o=>o.profile.buyerId=randomUUID(),o=>o.profile.attendancePlan='planned',o=>o.profile.cancelOperationId=randomUUID(),
  o=>o.people.eligibleAttendeeIds=[],o=>o.people.cancelOperationId=randomUUID(),o=>o.index.protectedAttendeeIds=[],o=>o.after.currentCycle++,o=>o.after.everIssued=false,
  o=>o.after.credentialVersion++,o=>o.after.closedSeatId=f.model.seats[1].seatId,o=>o.assignment.assignments[f.model.seats[1].seatId]='',o=>o.assignment.cancelledAttendeeId=other,
  o=>o.assignment.cancelOperationId=randomUUID(),o=>o.event.payload.oldSeatId=randomUUID(),o=>o.event.payload.before.issued=false,o=>o.event.payload.rawQr=o.before.activeCredentialId,
  o=>o.oldCredential.status='active',o=>o.oldCode.active=true,o=>o.after.resultVersions.ticket++,o=>o.after.expectedVersions.commit--];
 for(const mutate of mutations){const o=await cancelPlan(f,id);mutate(o);await rejectCancel(f,o);count++;}
 const o=await cancelPlan(f,id),x=await ticketPlan(f,other,'ticketCheck');x.after.operationId=o.id;x.after.ticketRevision=o.after.ticketRevision;await rejectCancel(f,o,[...cancelWrites(f,o),ticketWrites(f,x)[0]]);count++;
 const reception=data(await get(f,'receptions/'+id));await rejectCancel(f,o,[...cancelWrites(f,o),update(f,'receptions/'+id,{...reception,firstReceivedAt:null},undefined,true)]);count++;
 return{forgeriesAndExtraTargetsDenied:count};
});
await record('Q27','two business confirmations and physical stop assertion are required together',async()=>{
 const{f,people}=await issuedFixture(),id=people[0].attendeeId;let holds=0,count=0;
 for(const options of [{confirmedPrimary:false,confirmedTicketWarning:true,stopConfirmed:true},{confirmedPrimary:true,confirmedTicketWarning:false,stopConfirmed:true},{confirmedPrimary:true,confirmedTicketWarning:true,stopConfirmed:false}]){await assert.rejects(()=>cancelPlan(f,id,options));holds++;}
 for(const field of ['confirmedPrimary','confirmedTicketWarning','stopConfirmed']){const o=await cancelPlan(f,id);o.event.payload[field]=false;await rejectCancel(f,o);count++;}
 const o=await cancelPlan(f,id);o.event.payload.confirmedControlVersion--;await rejectCancel(f,o);count++;
 return{plannerHolds:holds,directRequestsDenied:count,physicalFleetVerified:false,independentDialogsUntested:true};
});
await record('Q28','response loss and cancel versus reissue race leave exactly one complete outcome',async()=>{
 const{f,people}=await issuedFixture(),id=people[0].attendeeId,o=await cancelPlan(f,id),w=cancelWrites(f,o);ok(await commit(f,w));
 const event=data(await get(f,'operations/'+o.id));assert.deepEqual(event.resultVersions,o.versions.values);assert.equal(data(await get(f,'credentials/'+o.before.activeCredentialId)).revokedOperationId,o.id);
 await rejectCancel(f,o,w,undefined,conflict);const different=structuredClone(o);different.event.payload.oldSeatId=randomUUID();await rejectCancel(f,different,cancelWrites(f,different),undefined,conflict);await acceptCancel(f,o);
 await saveCustomer(f,customerPlan(f,{attendancePlan:'planned'},id));await saveAssignment(f,await assignmentPlan(f,'assign',{seat1:o.oldSeatId,attendeeId:id}));await saveTicket(f,await ticketPlan(f,id));
 const cancel=await cancelPlan(f,id),qr=await reissue(f,id),plans=[{o:cancel,w:cancelWrites(f,cancel)},{o:qr,w:ticketWrites(f,qr)}],results=await Promise.all(plans.map(p=>commit(f,p.w)));let recovery=false;
 if(!results.some(r=>r.status===200)){for(const p of plans)assert.equal((await get(f,'operations/'+p.o.id)).status,404);const at=results.findIndex(r=>r.status===409&&r.body.error.status==='ABORTED');assert(at>=0);ok(await commit(f,plans[at].w));recovery=true;}else assert.equal(results.filter(r=>r.status===200).length,1);
 const t=data(await get(f,'tickets/'+id)),winner=plans.find(p=>p.o.id===t.operationId),loser=plans.find(p=>p.o.id!==t.operationId);assert(winner&&loser);assert.equal((await get(f,'operations/'+loser.o.id)).status,404);
 if(t.cycleClosed){assert.equal(data(await get(f,'attendees/'+id)).attendancePlan,'notAttending');assert.equal((await assignment(f)).assignments[cancel.oldSeatId],'');assert.equal((await get(f,'credentials/'+qr.after.activeCredentialId)).status,404);}
 else{assert.equal(data(await get(f,'attendees/'+id)).attendancePlan,'planned');assert.equal((await assignment(f)).assignments[cancel.oldSeatId],id);assert.equal(data(await get(f,'credentials/'+t.activeCredentialId)).status,'active');}
 return{responseLocated:true,replaysDenied:2,completeWinners:1,winner:t.cycleClosed?'cancel':'reissue',lockAbortRecovery:recovery,sdkRetryTested:false};
});
await record('Q29','cycle cannot reopen without assignment or skip and manual check may begin the next assigned cycle',async()=>{
 const{f,people}=await issuedFixture(),id=people[0].attendeeId,o=await cancelPlan(f,id);await saveCancel(f,o);await saveCustomer(f,customerPlan(f,{attendancePlan:'planned'},id));
 await reject(f,await ticketPlan(f,id));await reject(f,await ticketPlan(f,id,'ticketCheck'));await saveAssignment(f,await assignmentPlan(f,'assign',{seat1:o.oldSeatId,attendeeId:id}));
 for(const cycle of [1,3]){const x=await ticketPlan(f,id);x.after.currentCycle=cycle;x.credential.currentCycle=cycle;x.event.payload.after.currentCycle=cycle;await reject(f,x);}
 const t=await saveTicket(f,await ticketPlan(f,id,'ticketCheck'));assert.equal(t.currentCycle,2);assert(t.issued&&t.everIssued&&t.activeCredentialId==='');
 const fresh=await saveTicket(f,await ticketPlan(f,id));assert.equal(fresh.currentCycle,2);assert(fresh.issued&&fresh.everIssued);const replacement=await saveTicket(f,await reissue(f,id));assert.equal(replacement.currentCycle,2);assert.equal(replacement.credentialVersion,2);
 assert.equal(data(await get(f,'credentials/'+o.before.activeCredentialId)).status,'revoked');return{unassignedReopenDenied:2,cycleSkipOrRollbackDenied:2,newCycleFromCheck:2,qrAndReissueInCycle2:true};
});
await record('Q30','one cancellation among five hundred protected assigned people preserves the other 499',async()=>{
 const{f,people}=largeFixture??await qualified(500),id=people[0].attendeeId,before=await assignment(f),tickets=await Promise.all(people.slice(1).map(p=>get(f,'tickets/'+p.attendeeId))),o=await cancelPlan(f,id);
 resetCounts(f);await saveCancel(f,o);const costs=structuredClone(f.counts),after=await assignment(f);assert.deepEqual(after.assignments,{...before.assignments,[o.oldSeatId]:''});
 assert.equal(f.people.eligibleAttendeeIds.length,499);assert.equal(f.ticket.protectedAttendeeIds.length,499);assert.deepEqual(await Promise.all(people.slice(1).map(p=>get(f,'tickets/'+p.attendeeId))),tickets);assert.deepEqual([costs.requests,costs.writes],[1,9]);
 return{customers:500,otherAssignmentsRetained:499,otherTicketsRetained:499,cancel:costs};
});

async function rejectNoTicket(f,o,w=noTicketWrites(f,o),token=f.owner.token,check=denied){const before=await noTicketSnapshot(f,o);check(await commit(f,w,token));assert.deepEqual(await noTicketSnapshot(f,o),before);}
await record('Q31','no-ticket assigned cancellation is five writes and every partial subset is rejected',async()=>{
 const{f,people,seats}=await setup(),id=people[0].attendeeId;await saveCustomer(f,customerPlan(f,{paid:true},id));await seed(f,'receptions/'+id,{fact:'FAKE-existing-reception',immutable:true});
 const o=await noTicketPlan(f,id),w=noTicketWrites(f,o),ticketIndex=await get(f,'ticketState/current'),before=await assignment(f),receipt=await get(f,'receptions/'+id);assert.equal(w.length,5);
 for(let mask=1;mask<31;mask++)await rejectNoTicket(f,o,w.filter((_,i)=>mask&(1<<i)));
 resetCounts(f);await saveNoTicket(f,o);const costs=structuredClone(f.counts);assert.deepEqual([costs.requests,costs.writes],[1,5]);assert.deepEqual((await assignment(f)).assignments,{...before.assignments,[seats[0]]:''});
 assert.deepEqual(await get(f,'ticketState/current'),ticketIndex);assert.equal((await get(f,'tickets/'+id)).status,404);assert.deepEqual(await get(f,'receptions/'+id),receipt);assert(f.profiles.get(id).paid);assert.equal(o.versions.values.ticket,o.event.expectedVersions.ticket);
 return{partialSubsetsDenied:30,cancel:costs,ticketAbsent:true,ticketIndexUnchanged:true,paidAndSeededReceptionPreserved:true};
});
await record('Q32','unassigned cancellation uses four writes and return does not recover a seat or create a ticket',async()=>{
 const{f,people}=await setup(),person=await saveCustomer(f),id=person.attendeeId,o=await noTicketPlan(f,id),w=noTicketWrites(f,o),before=await assignment(f),ti=await get(f,'ticketState/current');assert.equal(w.length,4);
 for(let mask=1;mask<15;mask++)await rejectNoTicket(f,o,w.filter((_,i)=>mask&(1<<i)));
 resetCounts(f);await saveNoTicket(f,o);const costs=structuredClone(f.counts);assert.deepEqual([costs.requests,costs.writes],[1,4]);assert.deepEqual(await assignment(f),before);assert.deepEqual(await get(f,'ticketState/current'),ti);
 await saveCustomer(f,customerPlan(f,{attendancePlan:'planned'},id));assert.deepEqual(await assignment(f),before);assert.equal((await get(f,'tickets/'+id)).status,404);assert(!Object.values(before.assignments).includes(id));
 await rejectNoTicket(f,o,w,undefined,conflict);return{partialSubsetsDenied:14,cancel:costs,assignmentAndTicketStateUnchanged:true,returnKeepsUnassignedAndTicketAbsent:true,replayDenied:true};
});
await record('Q33','roster-first cancellation works before any seating map exists without creating placeholder documents',async()=>{
 const f=await fixture();await bootstrap(f);const person=await saveCustomer(f),id=person.attendeeId,o=await noTicketPlan(f,id),w=noTicketWrites(f,o);assert.equal(w.length,4);
 for(let mask=1;mask<15;mask++)await rejectNoTicket(f,o,w.filter((_,i)=>mask&(1<<i)));
 resetCounts(f);await saveNoTicket(f,o);const costs=structuredClone(f.counts);assert.deepEqual([costs.requests,costs.writes],[1,4]);assert.equal((await get(f,'assignmentState/current')).status,404);assert.equal((await get(f,'tickets/'+id)).status,404);assert.equal(f.sharedVersions.values.layout,0);assert.equal(f.sharedVersions.values.assignment,0);
 await saveCustomer(f,customerPlan(f,{attendancePlan:'planned'},id));assert.equal((await get(f,'assignmentState/current')).status,404);return{partialSubsetsDenied:14,cancel:costs,mapAndTicketAbsent:true,returnSupported:true};
});
await record('Q34','forged omissions extra writes and ordinary customer-update bypass cannot cancel incompletely',async()=>{
 const{f,people,seats}=await setup(),id=people[0].attendeeId;let count=0;
 const mutations=[o=>o.profile.paid=true,o=>o.profile.buyerId=randomUUID(),o=>o.profile.seatDisplayName='架空B',o=>o.profile.attendancePlan='planned',o=>o.profile.cancelNoTicketOperationId=randomUUID(),
 o=>o.people.eligibleAttendeeIds=[],o=>o.people.cancelNoTicketOperationId=randomUUID(),o=>o.people.attendeeId=people[1].attendeeId,
 o=>o.versions.values.ticket++,o=>o.versions.values.layout++,o=>o.versions.values.assignment--,o=>o.assignment.assignments[seats[1]]='',o=>o.assignment.cancelledAttendeeId=people[1].attendeeId,
 o=>o.assignment.cancelOperationId=randomUUID(),o=>o.event.payload.oldSeatId='',o=>o.event.payload.oldSeatId=seats[1],o=>o.event.payload.ticketAbsent=false,
 o=>o.event.payload.confirmedPrimary=false,o=>o.event.payload.confirmedTicketWarning=false,o=>o.event.payload.stopConfirmed=false,o=>o.event.payload.confirmedControlVersion--,
 o=>o.event.payload.attendeeId=people[1].attendeeId,o=>o.event.payload.rawQr='FAKE-extra',o=>o.event.expectedVersions.commit--];
 for(const mutate of mutations){const o=await noTicketPlan(f,id);mutate(o);await rejectNoTicket(f,o);count++;}
 const extra=await noTicketPlan(f,id),ticket=await ticketPlan(f,id,'ticketCheck');await rejectNoTicket(f,extra,[...noTicketWrites(f,extra),ticketWrites(f,ticket)[0]]);count++;
 const index=await noTicketPlan(f,id);await rejectNoTicket(f,index,[...noTicketWrites(f,index),update(f,'ticketState/current',{...f.ticket,revision:f.ticket.revision+1,operationId:index.id,attendeeId:id},undefined,true)]);count++;
 const reception=await noTicketPlan(f,id);await rejectNoTicket(f,reception,[...noTicketWrites(f,reception),update(f,'receptions/'+id,{fact:'FAKE-forged'},undefined,false)]);count++;
 const unassigned=await saveCustomer(f),normal=customerPlan(f,{attendancePlan:'notAttending'},unassigned.attendeeId);await rejectNoTicket(f,await noTicketPlan(f,unassigned.attendeeId),customerWrites(f,normal));count++;
 await assert.rejects(()=>noTicketPlan(f,id,{confirmedPrimary:false}));return{forgedRequestsDenied:count,ordinaryUnassignedCancellationDenied:true,confirmationHolds:1};
});
await record('Q35','stale customer assignment control and lost authorization leave the no-ticket draft unchanged',async()=>{
 const{f,people,seats}=await setup(),id=people[0].attendeeId;let count=0;
 let o=await noTicketPlan(f,id);await saveCustomer(f,customerPlan(f,{seatDisplayName:'架空B'},id));await rejectNoTicket(f,o);count++;
 o=await noTicketPlan(f,id);await saveAssignment(f,await assignmentPlan(f,'swap',{seat1:seats[0],seat2:seats[1]}));await rejectNoTicket(f,o);count++;
 o=await noTicketPlan(f,id);await saveControl(f,await controlPlan(f));await rejectNoTicket(f,o);count++;
 for(const[p,changes]of [['devices/'+f.owner.uid,{active:false}],['sessions/'+f.owner.uid,{active:false}],['roles/'+f.human.uid,{role:'temporary'}],['roles/'+f.human.uid,{revision:2}]]){const before=data(await get(f,p));await seed(f,p,{...before,...changes});await rejectNoTicket(f,await noTicketPlan(f,id));count++;await seed(f,p,before);}
 const stranger=await actor();for(const token of [f.reader.token,f.human.token,stranger.token]){await rejectNoTicket(f,await noTicketPlan(f,id),undefined,token);count++;}return{staleAndUnauthorizedRequestsDenied:count};
});
await record('Q36','response loss replay and simultaneous seat movement produce only one complete no-ticket outcome',async()=>{
 const{f,people,seats}=await setup(),id=people[0].attendeeId,o=await noTicketPlan(f,id);ok(await commit(f,noTicketWrites(f,o)));const found=data(await get(f,'operations/'+o.id));assert.deepEqual(found.resultVersions,o.versions.values);await rejectNoTicket(f,o,undefined,undefined,conflict);acceptNoTicket(f,o);
 await saveCustomer(f,customerPlan(f,{attendancePlan:'planned'},id));await saveAssignment(f,await assignmentPlan(f,'assign',{seat1:seats[0],attendeeId:id}));
 const cancel=await noTicketPlan(f,id),move=await assignmentPlan(f,'move',{seat1:seats[0],seat2:f.model.seats[5].seatId}),plans=[{id:cancel.id,w:noTicketWrites(f,cancel)},{id:move.id,w:assignmentWrites(f,move)}],results=await Promise.all(plans.map(p=>commit(f,p.w)));let recovery=false;
 if(!results.some(r=>r.status===200)){for(const p of plans)assert.equal((await get(f,'operations/'+p.id)).status,404);const at=results.findIndex(r=>r.status===409&&r.body.error.status==='ABORTED');assert(at>=0);ok(await commit(f,plans[at].w));recovery=true;}else assert.equal(results.filter(r=>r.status===200).length,1);
 const profile=data(await get(f,'attendees/'+id)),a=await assignment(f),cancelled=profile.attendancePlan==='notAttending';assert.equal((await get(f,'operations/'+(cancelled?move.id:cancel.id))).status,404);assert.equal(a.assignments[seats[0]],'');assert.equal(a.assignments[f.model.seats[5].seatId],cancelled?'':id);assert.equal((await get(f,'tickets/'+id)).status,404);
 return{responseLocated:true,replayDenied:true,completeWinners:1,winner:cancelled?'cancel':'move',lockAbortRecovery:recovery,sdkRetryTested:false};
});
await record('Q37','every existing ticket including an unprotected sent-only ticket is excluded from the no-ticket route',async()=>{
 let count=0;for(const mode of ['sentOnly','issuedWithoutQr','activeQr','closedCycle']){const{f,people}=await setup(),id=people[0].attendeeId,o=await noTicketPlan(f,id);
 if(mode==='activeQr'||mode==='closedCycle')await saveTicket(f,await ticketPlan(f,id));else await saveTicket(f,await ticketPlan(f,id,'ticketCheck',{field:mode==='sentOnly'?'sent':'issued',value:true}));
 if(mode==='closedCycle'){await saveCancel(f,await cancelPlan(f,id));await saveCustomer(f,customerPlan(f,{attendancePlan:'planned'},id));await saveAssignment(f,await assignmentPlan(f,'assign',{seat1:f.model.seats[0].seatId,attendeeId:id}));}
 await assert.rejects(()=>noTicketPlan(f,id));const forged=structuredClone(o);forged.profile={...f.profiles.get(id),revision:f.profiles.get(id).revision+1,operationId:o.id,attendancePlan:'notAttending',cancelNoTicketOperationId:o.id};forged.people={...f.people,revision:f.people.revision+1,operationId:o.id,attendeeId:id,cancelNoTicketOperationId:o.id,eligibleAttendeeIds:f.people.eligibleAttendeeIds.filter(x=>x!==id)};
 const old=await assignment(f);forged.assignment={...old,revision:old.revision+1,operationId:o.id,lastKind:'cancelWithoutTicket',cancelOperationId:o.id,cancelledAttendeeId:id,assignments:{...old.assignments,[o.oldSeatId]:''}};
 forged.versions={...f.sharedVersions,operationId:o.id,values:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,attendee:f.sharedVersions.values.attendee+1,assignment:f.sharedVersions.values.assignment+1}};forged.event.expectedVersions=structuredClone(f.sharedVersions.values);forged.event.resultVersions=structuredClone(forged.versions.values);forged.event.generation=f.sharedVersions.generation;await rejectNoTicket(f,forged);count++;
 }return{existingTicketVariantsDenied:count,plannerAndDirectRequestsRejected:true,noQrExistingTicketStillUntestedForNormalCancellation:true};
});
await record('Q38','one no-ticket cancellation among five hundred people preserves 499 assignments and creates no ticket',async()=>{
 const{f,people}=await setup(500),id=people[0].attendeeId,before=await assignment(f),ticketIndex=await get(f,'ticketState/current'),otherTickets=await Promise.all(people.slice(1).map(p=>get(f,'tickets/'+p.attendeeId))),o=await noTicketPlan(f,id);
 assert(otherTickets.every(r=>r.status===404));resetCounts(f);await saveNoTicket(f,o);const costs=structuredClone(f.counts);assert.deepEqual([costs.requests,costs.writes],[1,5]);assert.deepEqual((await assignment(f)).assignments,{...before.assignments,[o.oldSeatId]:''});assert.equal(f.people.eligibleAttendeeIds.length,499);assert.deepEqual(await get(f,'ticketState/current'),ticketIndex);assert.equal((await get(f,'tickets/'+id)).status,404);assert.deepEqual(await Promise.all(people.slice(1).map(p=>get(f,'tickets/'+p.attendeeId))),otherTickets);
 return{customers:500,otherAssignmentsRetained:499,otherTicketAbsencesRetained:499,ticketIndexUnchanged:true,cancel:costs};
});

const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({project:'demo-concert-seat-gd91-33',executedAt:new Date().toISOString(),runtime:{node:process.version},selectedCase:process.env.GD91_CASE??'all',hashLineEndings:'LF',sourceHashes,endSourceHashes,budgets,
 scope:'Single section; first qualification, manual checks and loss reissue; REST commit; seeded role/device/control. Device-stop confirmation is an asserted precondition, not physical fleet verification. Assigned active-QR cancellation regression and no-ticket cancellation with assigned, unassigned and roster-first states covered; existing no-QR ticket cancellation, SDK, IndexedDB, output files and physical fleet untested. Reception fact seeded, not normally produced.',reports},null,2)+'\n');
console.log(`${reports.length} scenarios executed`);
