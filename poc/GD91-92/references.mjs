import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {user,ok} from '../GD91-84/transport.mjs';import {inspect} from '../GD91-91/sdk-adapter.mjs';
export async function acquire(subject,head){
 const id=randomUUID(),record={schemaVersion:3,generation:head.generation,baseLayoutRevision:head.revision,deviceUid:subject.device.uid,active:true,revision:1,pendingOperationId:'',expectedEventRevision:0};
 ok(await user('',subject.device,'PATCH',{['references/'+id]:record,['generations/'+head.generation+'/refs/'+id]:true}));subject.referenceId=id;return id;
}
async function load(subject,id=subject.referenceId){const r=await user('references/'+id,subject.device);ok(r);assert(r.body,'reference-missing');assert.equal(r.body.deviceUid,subject.device.uid);return r.body;}
export async function reserve(subject,p){
 const id=subject.referenceId,r=await load(subject);assert.equal(p.body['operations/'+p.operationId].referenceId,id);assert(r.active);
 if(r.pendingOperationId===p.operationId){assert.equal(r.expectedEventRevision,p.body.commit.revision-1);return{alreadyReserved:true};}
 assert.equal(r.pendingOperationId,'','pending-operation-unresolved');ok(await user('references/'+id,subject.device,'PUT',{...r,revision:r.revision+1,pendingOperationId:p.operationId,expectedEventRevision:p.body.commit.revision-1}));return{alreadyReserved:false};
}
export async function clear(subject,p,{resolution='committed'}={}){
 const r=await load(subject);assert.equal(r.pendingOperationId,p.operationId);assert.equal(p.body['operations/'+p.operationId].referenceId,subject.referenceId);
 if(resolution==='committed')assert.equal((await inspect(subject,p)).state,'committed');else{
  assert.equal(resolution,'fenced');assert.equal((await inspect(subject,p)).state,'absent');const event=await user('event/commit',subject.device),head=await user('head',subject.device);ok(event);ok(head);assert(event.body.revision>r.expectedEventRevision||head.body.revision>r.baseLayoutRevision,'operation-not-fenced');
 }
 ok(await user('references/'+subject.referenceId,subject.device,'PUT',{...r,revision:r.revision+1,pendingOperationId:'',expectedEventRevision:0}));
}
export async function release(subject){const r=await load(subject);if(!r.active)return{alreadyReleased:true};assert.equal(r.pendingOperationId,'','pending-operation-unresolved');ok(await user('',subject.device,'PATCH',{['references/'+subject.referenceId]:{...r,active:false,revision:r.revision+1},['generations/'+r.generation+'/refs/'+subject.referenceId]:null}));return{alreadyReleased:false};}

export async function reserveKnown(subject,p,record){
 assert.equal(record.deviceUid,subject.device.uid);assert.equal(record.active,true);assert.equal(record.pendingOperationId,'','pending-operation-unresolved');assert.equal(p.body['operations/'+p.operationId].referenceId,subject.referenceId);
 const next={...record,revision:record.revision+1,pendingOperationId:p.operationId,expectedEventRevision:p.body.commit.revision-1};ok(await user('references/'+subject.referenceId,subject.device,'PUT',next));return next;
}
export async function clearAcknowledged(subject,p,record,acknowledgement){
 assert.equal(record.pendingOperationId,p.operationId);assert.equal(acknowledgement.status,200);const actual=acknowledgement.body?.['operations/'+p.operationId]??acknowledgement.body?.operations?.[p.operationId];assert(actual,'acknowledgement-operation-missing');
 const normalize=(v,t)=>v&&typeof v==='object'?(Object.keys(v).length===1&&v['.sv']==='timestamp'?t:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x,t)]))):v;
 assert.deepEqual(actual,normalize(p.body['operations/'+p.operationId],actual.committedAt),'acknowledgement-operation-mismatch');
 const next={...record,revision:record.revision+1,pendingOperationId:'',expectedEventRevision:0};ok(await user('references/'+subject.referenceId,subject.device,'PUT',next));return next;
}
