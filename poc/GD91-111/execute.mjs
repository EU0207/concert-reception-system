import assert from 'node:assert/strict';import {beginClose,acknowledgement,advance,foldSource,factStep,completeClose} from './closing.mjs';import {createSubmission} from '../GD91-99/submission.mjs';

export async function executeClosing({read,send,normal,manager,subjects,confirmations,store,afterBoundary=async()=>{},beforeFacts=async()=>{},assertLocalEmpty}){
 assert.equal(typeof assertLocalEmpty,'function','local-queue-confirmation-required');
 let local={progressPending:null,finalSubmission:null,operationId:null};store??={load:async()=>structuredClone(local),save:async s=>{local=structuredClone(s);}};
 const trace={progressWrites:0,progressLookups:0,finalWrites:0};let state=await store.load()??local;
 async function checkpoint(body){
  const target=body['closing/meta'];assert(target);const old=state.progressPending;
  if(old){assert.deepEqual(old,body,'different-pending-closing-step');const current=await read('closing/meta');trace.progressLookups++;
   if(current?.operationId===target.operationId&&current.phase!=='aborted'&&current.revision>=target.revision){if(current.revision===target.revision)assert.deepEqual(current,target,'closing-step-content-conflict');state={...state,progressPending:null,operationId:target.operationId};await store.save(state);return current;}
   assert((!current&&target.revision===1)||(current?.operationId===target.operationId&&current.revision===target.revision-1)||(current?.phase==='aborted'&&target.revision===1),'closing-step-fenced');
  }else{state={...state,progressPending:structuredClone(body),operationId:target.operationId};await store.save(state);}
  trace.progressWrites++;await send(body);state={...state,progressPending:null};await store.save(state);return target;
 }
 let meta;if(state.progressPending)meta=await checkpoint(state.progressPending);else meta=await read('closing/meta');
 if(meta&&meta.phase!=='aborted')assert.equal(state.operationId,meta.operationId,'different-active-closing-operation');
 const control=await read('control');if(!meta||meta.phase==='aborted'){
  assert(!state.progressPending);const roster=await read('deviceRoster/meta'),head=await read('head'),facts=await read('performanceFacts'),business=await read('event/commit'),count=await read('event/roster/count');
  meta=await checkpoint({'closing/meta':beginClose(control,roster,count??0,head,{...facts,businessRevision:business.revision})});
 }
 if(meta.phase==='closed'){
  if(state.finalSubmission?.pending){const submission=createSubmission({user:normal,loadState:async()=>state.finalSubmission,saveState:async value=>{state={...state,finalSubmission:value};await store.save(state);}}),retry={writes:0};const result=await submission.submit(manager,state.finalSubmission.pending,{trace:retry});trace.finalWrites=retry.writes;return{result,trace};}
  return{result:await read('closingResults/'+meta.operationId),trace};
 }
 const actors=new Map(subjects.map(s=>[s.device.uid,s]));
 const boundary=async name=>{assert.equal(state.progressPending,null);await afterBoundary(name,{trace,meta});};await boundary('closing-prepare');
 while(meta.phase==='scan'&&meta.deviceIndex<meta.registryCount){
  const uid=await read('deviceRoster/byOrder/n'+meta.deviceIndex),subject=actors.get(uid);assert(subject,'registered-device-not-confirmed');await assertLocalEmpty(subject);const clock=await read('receiptClocks/'+uid),final=clock?.sequence??0,path='closingRuns/'+meta.operationId+'/acks/'+uid;
  if(!await read(path)){const r=await normal(subject,path,'PUT',acknowledgement(meta,uid,final));assert.equal(r.status,200,'device-confirmation-denied');}
  while(meta.sequenceCursor<final){const key=String(1000000000+meta.sequenceCursor+1),source=await read('receiptSources/'+uid+'/'+key);assert(source&&['normal','quarantine'].includes(source.destination),'missing-source-index');const event=await read((source.destination==='normal'?'receipts':'quarantine')+'/'+uid+'/events/'+source.key);assert(event&&event.eventId===source.eventId,'source-event-conflict');let adopted=true;
   if(source.destination==='quarantine'){const decision=await read('quarantineReviews/'+uid+'/'+source.key);assert(decision,'quarantine-review-required');adopted=decision.outcome==='adopt';}
   meta=await checkpoint(foldSource(meta,uid,event,await read('closingRuns/'+meta.operationId+'/arrivals/'+event.attendeeId),adopted));if(meta.sequenceCursor%100===0)await boundary('closing-sources');
  }
  meta=await checkpoint({'closing/meta':advance(meta,{deviceIndex:meta.deviceIndex+1,sequenceCursor:0})});
 }
 if(meta.phase==='scan')meta=await checkpoint({'closing/meta':advance(meta,{phase:'geometry'})});await boundary('closing-geometry');
 if(meta.phase==='geometry'){const count=(await read('generations/'+meta.generation+'/meta')).expectedParts;
  while(meta.partCursor<count){const part=await read('generations/'+meta.generation+'/parts/p'+meta.partCursor);assert(part,'missing-layout-part');const seats=Object.values(part.slots).filter(s=>s.kind==='seat').length;meta=await checkpoint({'closing/meta':advance(meta,{partCursor:meta.partCursor+1,seatCount:meta.seatCount+seats})});if(meta.partCursor%100===0)await boundary('closing-geometry');}
  meta=await checkpoint({'closing/meta':advance(meta,{phase:'facts'})});
 }
 await boundary('closing-facts');await beforeFacts(meta);
 while(meta.phase==='facts'&&meta.personCursor<meta.peopleCount){
  const id=await read('event/roster/byOrder/n'+meta.personCursor),person=await read('event/people/'+id),profile=await read('event/profiles/'+id),ticket=await read('event/tickets/'+id),arrival=await read('closingRuns/'+meta.operationId+'/arrivals/'+id);assert(id&&person&&profile,'missing-roster-person');
  if(arrival?.firstCount>1)assert((await read('closingRuns/'+meta.operationId+'/confirmations/'+id))?.firstCount===arrival.firstCount,'multiple-first-review-required');
  const total=await read('actualTotals/part'+Math.floor(meta.personCursor/64));meta=await checkpoint(factStep(meta,{...person,id,performanceId:person.performanceId??(await read('devices/'+manager.device.uid)).performanceId},profile,ticket,arrival,total));if(meta.personCursor%100===0)await boundary('closing-facts');
 }
 const body=completeClose(meta,control,manager,confirmations),path='closingResults/'+meta.operationId,submission=createSubmission({user:normal,loadState:async()=>state.finalSubmission,saveState:async value=>{state={...state,finalSubmission:value};await store.save(state);}}),finalTrace={writes:0};
 const result=await submission.submit(manager,{path,decision:body[path],body},{trace:finalTrace});trace.finalWrites=finalTrace.writes;return{result,trace};
}
