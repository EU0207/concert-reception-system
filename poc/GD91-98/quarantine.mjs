import assert from 'node:assert/strict';
import {key,sameEvent} from '../GD91-88/receipt-client.mjs';

export function createQuarantine({user,loadState,saveState}){
 const ok=r=>assert.equal(r.status,200,'quarantine-request-denied');
 async function existing(subject,path,event){
  const id=await user(subject,path+'/ids/'+event.eventId);ok(id);
  if(!id.body)return null;
  const found=await user(subject,path+'/events/'+id.body);ok(found);
  assert(sameEvent(found.body,event),'quarantine-result-conflict');
  return found.body;
 }
 async function transfer(subject,{online=true,write,trace={}}={}){
  assert(online,'explicit-offline');let state=await loadState();trace.writes??=0;
  while(state.queue.length){
   const p=state.queue[0],e=p.event;
   assert.equal(e.deviceUid,subject.device.uid);assert.equal(e.layoutReferenceId,state.lease.id);
   assert.equal(e.sourceLayoutGeneration,state.lease.record.generation);assert.equal(e.sourceLayoutRevision,state.lease.record.baseLayoutRevision);assert.equal(e.sourceControlRevision,state.lease.record.sourceControlRevision);
   const normal='receipts/'+subject.device.uid,quarantine='quarantine/'+subject.device.uid;
   let receipt=await existing(subject,normal,e),destination='normal';
   if(!receipt){destination='quarantine';receipt=await existing(subject,quarantine,e);
    if(!receipt){const counter=await user(subject,quarantine+'/counter');ok(counter);const sequence=(counter.body?.sequence??0)+1,entry=key(sequence);
     const body={counter:{sequence,eventKey:entry,eventId:e.eventId,lastSourceSequence:e.sequence},['events/'+entry]:e,['ids/'+e.eventId]:entry,['leaseHolds/'+e.layoutReferenceId]:true};
     trace.writes++;const response=await(write?write({path:quarantine,body}):user(subject,quarantine,'PATCH',body));ok(response);
     receipt=response.body['events/'+entry]??response.body.events?.[entry];assert(receipt&&sameEvent(receipt,e),'quarantine-ack-conflict');
    }
   }
   const next={...state,queue:state.queue.slice(1),received:[...(state.received??[]),{event:e,receipt,destination}]};
   await saveState(next);state=next;
  }
  return{empty:true};
 }
 return{transfer};
}
