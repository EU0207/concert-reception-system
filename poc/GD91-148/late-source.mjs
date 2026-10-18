import assert from 'node:assert/strict';import {permitRequest} from '../GD91-100/model.mjs';import {queuedEvent} from '../GD91-96/queue.mjs';import {createQuarantine} from '../GD91-98/quarantine.mjs';
globalThis.__gd148LateSource=async({m,subject,lease,scanned,user,trial,owner})=>{
 const read=async p=>{const r=await user(p,m.device);assert.equal(r.status,200);return r.body;},control=await read('control'),clock=await read('receiptClocks/'+subject.device.uid);assert.equal(control.state,'closed');
 await owner(trial+'/devices/'+subject.device.uid+'/active','PUT',false);
 const seq=clock.sequence+1,reference={id:lease.id,record:lease.record},p=permitRequest(m,reference,clock.sequence,control.revision,{endSequence:seq});assert.equal((await user('',m.device,'PATCH',p.body)).status,200,'source-permit');
 const plan=queuedEvent(trial.split('/')[1],subject,seq,'person-0',scanned,lease,{observedAt:control.endedAt-1});let local={lease,queue:[plan],received:[],nextSequence:seq+1};
 const receive=createQuarantine({user:(s,p,method='GET',body)=>user(p,s.device,method,body),loadState:async()=>structuredClone(local),saveState:async value=>{local=structuredClone(value);}});await receive.transfer(subject);assert.equal(local.queue.length,0);
 const index=await read('receiptSources/'+subject.device.uid+'/'+String(1000000000+seq));assert.equal(index.destination,'quarantine');const progress=await read('quarantineReviewState/'+lease.id);assert.equal(progress.receivedCount,1);assert.equal(progress.reviewedCount,0);
 globalThis.__gd148Late={sourceUid:subject.device.uid,key:index.key,referenceId:lease.id,receivedNormallyAfterClose:true,sourceDeviceStopOwnerSeeded:true,reviewNotYetDecided:true,sourceAuthTokenPersisted:false};console.log(JSON.stringify({lateSourceNormallyReceived:true,unreviewed:1}));
};
