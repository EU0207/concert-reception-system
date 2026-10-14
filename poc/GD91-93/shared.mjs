import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
export function sharedPlan(generation,revision,head,operationId=randomUUID()){
 const common={generation,baseLayoutGeneration:head.generation,baseLayoutRevision:head.revision};
 return{sharedHead:{...common,revision,operationId},['sharedOperations/'+operationId]:{...common,resultRevision:revision}};
}
export async function inspectShared(read,body){
 const id=body.sharedHead.operationId,found=await read('sharedOperations/'+id);assert.equal(found.status,200);if(found.body===null)return{state:'absent'};
 assert.deepEqual(found.body,body['sharedOperations/'+id],'shared-operation-content-conflict');return{state:'committed'};
}
