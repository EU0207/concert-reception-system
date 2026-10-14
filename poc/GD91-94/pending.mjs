import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {sharedPlan,inspectShared} from '../GD91-93/shared.mjs';
export function prepareShared(subject,generation,expectedSharedRevision,head,sourceControlRevision){
 const operationId=randomUUID(),referenceId=randomUUID(),body=sharedPlan(generation,expectedSharedRevision+1,head,operationId);body.sharedHead.referenceId=referenceId;body['sharedOperations/'+operationId].referenceId=referenceId;
 const record={schemaVersion:4,generation,baseLayoutGeneration:head.generation,baseLayoutRevision:head.revision,expectedSharedRevision,sourceControlRevision,operationId,deviceUid:subject.device.uid,active:true,revision:1};return{operationId,referenceId,body,record};
}
export function createPendingShare({user,saveFixed}){
 const ok=r=>assert.equal(r.status,200,JSON.stringify(r.body)),read=(s,p)=>user(s,p);
 function validate(s,p){assert.equal(p.operationId,p.record.operationId,'proposal-operation-mismatch');assert.equal(p.record.deviceUid,s.device.uid,'proposal-device-mismatch');const expected=sharedPlan(p.record.generation,p.record.expectedSharedRevision+1,{generation:p.record.baseLayoutGeneration,revision:p.record.baseLayoutRevision},p.operationId);expected.sharedHead.referenceId=p.referenceId;expected['sharedOperations/'+p.operationId].referenceId=p.referenceId;assert.deepEqual(p.body,expected,'proposal-body-mismatch');}
 async function reserve(s,p){validate(s,p);await saveFixed(p);const old=await read(s,'references/'+p.referenceId);ok(old);if(old.body){assert.deepEqual(old.body,p.record,'reservation-conflict');return{alreadyReserved:true};}const pins=Object.fromEntries([p.record.generation,p.record.baseLayoutGeneration].map(g=>['generations/'+g+'/refs/'+p.referenceId,true]));ok(await user(s,'','PATCH',{['references/'+p.referenceId]:p.record,...pins}));return{alreadyReserved:false};}
 async function inspect(s,p){validate(s,p);return inspectShared(path=>read(s,path),p.body);}
 async function release(s,p){validate(s,p);const old=await read(s,'references/'+p.referenceId);ok(old);assert(old.body,'reservation-missing');assert.deepEqual({...old.body,active:true,revision:1},p.record,'reservation-conflict');const found=await inspect(s,p);
  if(found.state==='absent'){const sh=await read(s,'sharedHead'),head=await read(s,'head'),control=await read(s,'control');for(const r of[sh,head,control])ok(r);assert((sh.body?.revision??0)>p.record.expectedSharedRevision||head.body.revision>p.record.baseLayoutRevision||control.body.revision>p.record.sourceControlRevision,'share-not-resolved');}
  if(old.body.active===false)return{alreadyReleased:true};const pins=Object.fromEntries([p.record.generation,p.record.baseLayoutGeneration].map(g=>['generations/'+g+'/refs/'+p.referenceId,null]));ok(await user(s,'','PATCH',{['references/'+p.referenceId]:{...p.record,active:false,revision:2},...pins}));return{alreadyReleased:false};
 }
 return{reserve,inspect,release};
}
