import assert from 'node:assert/strict';
import {createQueue} from '../GD91-99/queue.mjs';
import {permitRequest} from '../GD91-100/model.mjs';
import {maxObservationMillis} from './generate.mjs';

export function observationProbe(io,manager,reports){
 let tested=false;
 return async(subject,path,method='GET',body)=>{
  if(tested||method!=='PATCH'||!path.startsWith('receipts/'))return io.normal(subject,path,method,body);
  tested=true;const baseline=await io.owner(''),eventKey=Object.keys(body).find(k=>k.startsWith('events/')&&typeof body[k]==='object');assert(eventKey);
  const future=Date.now()+86400000,referenceId=body[eventKey].layoutReferenceId;
  const check=async(id,change,expected=401,{quarantine=false,setup}={})=>{
   await io.owner('','PUT',baseline);if(setup)await setup();
   const fixed=structuredClone(body);fixed[eventKey].observedAt=future;change(fixed[eventKey]);
   const target=quarantine?'quarantine/'+subject.device.uid:path;
   const request=quarantine?{counter:{...fixed.counter,lastSourceSequence:fixed.counter.sequence},[eventKey]:fixed[eventKey],['ids/'+fixed.counter.eventId]:fixed.counter.eventKey,['leaseHolds/'+referenceId]:true}:fixed;
   const before=await io.owner(''),response=await io.normal(subject,target,'PATCH',request),after=await io.owner('');assert.equal(response.status,expected,id);
   if(expected===401)assert.deepEqual(after,before,id);
   else{
    const stored=after[quarantine?'quarantine':'receipts'][subject.device.uid].events[body.counter.eventKey];
    assert.equal(stored.observedAt,fixed[eventKey].observedAt);assert(Number.isInteger(stored.receivedAt));
    assert.deepEqual(after.event.reception,before.event.reception);
   }
   reports.push({id,httpStatus:response.status,observationPreserved:expected===200,rejectedStateUnchanged:expected===401});
   return {fixed,after};
  };
  for(const [name,value] of [['zero',0],['past',1],['future',future],['max-date',maxObservationMillis]])await check('normal-'+name,e=>{e.observedAt=value;},200);
  for(const [name,value] of [['negative',-1],['fraction',1.5],['text','future'],['object',{}],['null',null],['beyond-date',maxObservationMillis+1]])await check('normal-invalid-'+name,e=>{e.observedAt=value;});
  await check('normal-observation-missing',e=>{delete e.observedAt;});
  await check('server-received-time-cannot-be-forged',e=>{e.receivedAt=0;});
  for(const [id,p,value] of [
   ['session-expired','sessions/'+subject.device.uid+'/expiresAt',Date.now()-1],
   ['role-expired','roles/'+subject.human.uid+'/endsAt',Date.now()-1],
   ['role-revoked','roles/'+subject.human.uid+'/active',false],
   ['device-stopped','devices/'+subject.device.uid+'/active',false],
   ['role-version-changed','roles/'+subject.human.uid+'/revision',2],
   ['performance-stopped','control/state','stopped'],['performance-closed','control/state','closed']
  ])await check('normal-'+id,()=>{},401,{setup:()=>io.owner(p,'PUT',value)});
  const stopped=()=>io.owner('control','PUT',{...baseline.control,state:'stopped',revision:3});
  await check('quarantine-future-observation',()=>{},200,{quarantine:true,setup:stopped});
  await check('quarantine-invalid-observation',e=>{e.observedAt='future';},401,{quarantine:true,setup:stopped});
  await check('quarantine-forged-received-time',e=>{e.receivedAt=0;},401,{quarantine:true,setup:stopped});
  const closed=async()=>{await io.owner('control','PUT',{...baseline.control,state:'closed',revision:3});await io.owner('devices/'+subject.device.uid+'/active','PUT',false);};
  await check('closed-without-permit-future',()=>{},401,{quarantine:true,setup:closed});
  await check('closed-without-permit-past',e=>{e.observedAt=0;},401,{quarantine:true,setup:closed});
  const permit=permitRequest(manager,{id:referenceId,record:baseline.references[referenceId]},0,3,{endSequence:1});
  const allowed=async()=>{await closed();assert.equal((await io.normal(manager,'','PATCH',permit.body)).status,200);};
  await check('closed-with-permit-future',()=>{},200,{quarantine:true,setup:allowed});
  await check('closed-expired-permit-future',()=>{},401,{quarantine:true,setup:async()=>{await allowed();await io.owner(permit.path+'/expiresAt','PUT',Date.now()-1);}});
  const {fixed}=await check('idempotent-future-first',()=>{},200);
  let state={lease:{id:referenceId,record:baseline.references[referenceId]},queue:[{event:fixed[eventKey],body:fixed}],received:[],nextSequence:2};
  const queue=createQueue({user:io.normal,loadState:async()=>structuredClone(state),saveState:async s=>{state=structuredClone(s);}}),trace={writes:0};
  await queue.flush(subject,{trace});assert.equal(trace.writes,0);assert.equal(state.queue.length,0);reports.push({id:'idempotent-future-retry',secondWrites:0,queueEmpty:true});
  await io.owner('','PUT',baseline);return io.normal(subject,path,method,body);
 };
}
