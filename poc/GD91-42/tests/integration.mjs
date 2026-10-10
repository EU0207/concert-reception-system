import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {ready,saveCustomer,customerPlan,customerWrites,saveAssignment,assignmentPlan} from './business.mjs';
import {labelPlanSync,labelWrites,saveLabel,readLabel} from './names.mjs';
import {ticketPlan,ticketWrites,saveTicket} from './ticket.mjs';
import {actor,human,sessionWrite,commit,update,get,data,ok,denied,seed,movement,slideWrites,publishSlide} from './support.mjs';
const ts=n=>({$timestamp:new Date(n).toISOString()});
async function setup(){const f=await ready(),p=await saveCustomer(f);await saveAssignment(f,await assignmentPlan(f,'assign',{seat1:f.model.seats[0].seatId,attendeeId:p.attendeeId}));return{f,id:p.attendeeId};}
async function dayFixture(f,state='operating'){const c=data(await get(f,'control/current'));await seed(f,'control/current',{...c,state,dayStartsAt:ts(Date.now()-3600000),dayEndsAt:ts(Date.now()+3600000),firstReceptionStartedAt:ts(Date.now()-1000)});f.nameDay=true;await prepare(f);}
async function prepare(f,schema=10){const d=data(await get(f,'devices/'+f.owner.uid));await seed(f,'devices/'+f.owner.uid,{...d,preparedDataSchemaVersion:schema,preparedDataRevision:f.sharedVersions.values.reception});}
async function staff(f,role='temporary'){
 const owner=await actor(),h=await human('password'),scope={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show};
 await seed(f,'roles/'+h.uid,{...scope,active:true,role,revision:1,receptionBaselineRevision:0,startsAt:ts(Date.now()-3600000),endsAt:ts(Date.now()+7200000)});
 await seed(f,'devices/'+owner.uid,{...scope,active:true,deviceUid:owner.uid,humanUid:h.uid,preparedRoleRevision:1,preparedDataSchemaVersion:10,preparedDataRevision:f.sharedVersions.values.reception});
 const g={...f,owner,human:h,labels:new Map(),people:undefined};ok(await commit(g,[sessionWrite(g,owner,h)],h.token));return g;
}
async function publicPlan(g,id,value='架空B',reason='架空：表示修正'){const v=await get(g,'versions/current',g.owner.token),l=await readLabel(g,id);ok(v);ok(l);g.sharedVersions=data(v);g.labels.set(id,data(l));return labelPlanSync(g,id,value,reason);}
async function untouched(f,writes){const paths=writes.map(w=>w.update.name),fetch=()=>Promise.all(paths.map(p=>get(f,p.split('/splitSeatShows/'+f.show+'/')[1])));const before=await fetch();denied(await commit(f,writes));assert.deepEqual(await fetch(),before);}
function wrongStamp(o,delta){const a=structuredClone(o);a.versions.values.reception+=delta;if(a.event.resultVersions)a.event.resultVersions.reception=a.versions.values.reception;if(a.event.afterValues)a.event.afterValues.reception=a.versions.values.reception;if(a.after?.resultVersions)a.after.resultVersions.reception=a.versions.values.reception;return a;}
export async function integrationCases(record){
 await record('F01','registration and both name paths reject all proper subsets',async()=>{
  const{f,id}=await setup();let requests=0;
  for(const kind of ['register','beforeName','dayName']){if(kind==='dayName')await dayFixture(f);const p=kind==='register'?customerPlan(f):labelPlanSync(f,id,kind==='beforeName'?'架空B':'架空C'),w=kind==='register'?customerWrites(f,p):labelWrites(f,p);
   for(let mask=1;mask<(1<<w.length)-1;mask++){await untouched(f,w.filter((_,i)=>mask&(1<<i)));requests++;}
   if(kind==='register')await saveCustomer(f,p);else await saveLabel(f,p);
  }
  return{properSubsetsDenied:requests,registrationWrites:5,beforeNameWrites:4,dayNameWrites:5};
 });
 await record('F02','issued-before-day names require reasons and never rewrite the private profile',async()=>{
  const{f,id}=await setup();await saveTicket(f,await ticketPlan(f,id,'ticketCheck'));const before=await get(f,'attendees/'+id),ticket=await get(f,'tickets/'+id);
  for(const reason of ['','　 \t'])await untouched(f,labelWrites(f,labelPlanSync(f,id,'架空B',reason)));
  await saveLabel(f,labelPlanSync(f,id,'😀😀😀　😀😀😀'));assert.deepEqual(await get(f,'attendees/'+id),before);assert.deepEqual(await get(f,'tickets/'+id),ticket);
  const p=customerPlan(f,{paid:true},id);p.profile.seatDisplayName='架空混入';p.event.payload.after.seatDisplayName='架空混入';await untouched(f,customerWrites(f,p));
  return{prePerformanceIssuedReasonRequired:true,profileAndTicketPreserved:true,unicodeSixAccepted:true,privateNameCopyDenied:true};
 });
 await record('F03','normal public reads build temporary proposals and own history is restricted',async()=>{
  const{f,id}=await setup(),other=await saveCustomer(f);await dayFixture(f);const g=await staff(f),p=await publicPlan(g,id);denied(await get(g,'attendeeState/current',g.owner.token));denied(await readLabel(g,other.attendeeId));
  await saveLabel(g,p);ok(await get(g,`dayEvents/${g.human.uid}/entries/${p.id}`,g.owner.token));const stranger=await staff(f);denied(await get(stranger,`dayEvents/${g.human.uid}/entries/${p.id}`,stranger.owner.token));
  const r=await staff(f,'receptionist'),bad=await publicPlan(r,id,'架空C');await untouched(r,labelWrites(r,bad));
  return{privateIndexNotRead:true,unassignedDenied:true,temporaryNormalPublicProposalSucceeded:true,otherHumanHistoryAndReceptionistWriteDenied:true};
 });
 await record('F04','schema and preparation changes cannot retain day-write authority',async()=>{
  let count=0;for(const kind of ['oldFormat','staleData','stopped','demoted','expired']){const{f,id}=await setup();await dayFixture(f);const g=await staff(f),p=await publicPlan(g,id);
   if(kind==='oldFormat')await prepare(g,9);else if(kind==='staleData'){const d=data(await get(g,'devices/'+g.owner.uid));await seed(g,'devices/'+g.owner.uid,{...d,preparedDataRevision:1});}
   else if(kind==='stopped'){const d=data(await get(g,'devices/'+g.owner.uid));await seed(g,'devices/'+g.owner.uid,{...d,active:false});}
   else{const r=data(await get(g,'roles/'+g.human.uid));await seed(g,'roles/'+g.human.uid,{...r,...(kind==='demoted'?{role:'receptionist',revision:2}:{endsAt:ts(Date.now()-1000)})});}
   await untouched(g,labelWrites(g,p));count++;
  }return{revocationCases:count,oldSchemaSameCounterDenied:true};
 });
 await record('F05','public stamps advance for actual display changes and stay for checks',async()=>{
  const{f,id}=await setup(),base=f.sharedVersions.values.reception,paid=customerPlan(f,{paid:true},id);assert.equal(paid.versions.values.reception,base);await untouched(f,customerWrites(f,wrongStamp(paid,1)));await saveCustomer(f,paid);
  const check=await ticketPlan(f,id,'ticketCheck');assert.equal(check.versions.values.reception,base);await untouched(f,ticketWrites(f,wrongStamp(check,1)));await saveTicket(f,check);
  const qr=await ticketPlan(f,id);assert.equal(qr.versions.values.reception,base+1);await untouched(f,ticketWrites(f,wrongStamp(qr,-1)));await saveTicket(f,qr);
  const name=labelPlanSync(f,id,'架空B');assert.equal(name.versions.values.reception,base+2);await untouched(f,labelWrites(f,wrongStamp(name,-1)));await saveLabel(f,name);
  for(const change of [v=>v.extra=1,v=>v.source++,v=>v.layout=0]){const move=movement(f);change(move.versions.values);move.history.resultVersions=structuredClone(move.versions.values);await untouched(f,slideWrites(f,move));}
  await publishSlide(f,movement(f));
  return{paidAndTicketCheckDoNotAdvance:true,qrAndNameAdvance:true,coherentWrongStampsDenied:4,malformedSlideVersionsDenied:3,validSlideAfterName:true};
 });
 await record('F06','name marker preserves following normal saves and day role/state boundaries',async()=>{
  const{f,id}=await setup();await saveLabel(f,labelPlanSync(f,id,'架空B'));await saveCustomer(f);await saveCustomer(f,customerPlan(f,{paid:true},id));await saveTicket(f,await ticketPlan(f,id));
  await dayFixture(f,'preparing');const missing=labelPlanSync(f,id,'架空C','');await untouched(f,labelWrites(f,missing));await saveLabel(f,labelPlanSync(f,id,'架空C'));
  let deniedStates=0;for(const state of ['ended','closed']){await dayFixture(f,state);await untouched(f,labelWrites(f,labelPlanSync(f,id,'架空D')));deniedStates++;}
  return{normalSavesAfterNameMarker:true,dayPreparingReasonRequired:true,endedClosedWritesDenied:deniedStates};
 });
}
