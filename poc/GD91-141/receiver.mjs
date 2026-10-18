import assert from 'node:assert/strict';import {base,body,name} from './client.mjs';
export class ReceiveError extends Error {constructor(code){super(code);this.code=code;}}
function allowed(r){if(r.status!==200)throw new ReceiveError('access-denied');return r.body;}
export async function head(c,p,masked=false){const query=masked?'?'+new URLSearchParams([['mask.fieldPaths','revision'],['mask.fieldPaths','operationId'],['mask.fieldPaths','phase']]):'';return body(allowed(await c.send(base+'/'+p+'/head/current'+query)));}
export function decodeBatch(rows,paths){
 if(!Array.isArray(rows))throw new ReceiveError('invalid-response');const expected=new Set(paths.map(name)),result=new Map();
 for(const row of rows){if(row.error||row.missing||!row.found||!expected.has(row.found.name)||result.has(row.found.name))throw new ReceiveError('incomplete-batch');result.set(row.found.name,body(row.found));}
 if(result.size!==expected.size)throw new ReceiveError('incomplete-batch');return new Map(paths.map(p=>[p,result.get(name(p))]));
}
export async function batch(c,paths,mask){assert(paths.length>0&&paths.length<=32);return decodeBatch(allowed(await c.send(base+':batchGet','POST',{documents:paths.map(name),...(mask?{mask:{fieldPaths:mask}}:{})})),paths);}
const same=(a,b)=>a.revision===b.revision&&a.operationId===b.operationId&&a.phase===b.phase;
export async function sync(c,p,cache,options={}){
 const before=await head(c,p,true);assert.deepEqual(Object.keys(before).sort(),['operationId','phase','revision']);
 if(cache&&same(before,cache.head))return{cache,unchanged:true,bodyLabelsFetched:0,metadataLabelsFetched:0};
 const full=await head(c,p);if(!same(before,full))throw new ReceiveError('mixed-revision');
 const ids=[...new Set(Object.values(full.assignments).filter(Boolean))],labels=new Map(),changed=[];let metadataLabelsFetched=0,bodyLabelsFetched=0,batches=0;
 const hook=async()=>{if(++batches===1)await options.afterFirstBatch?.();};
 if(cache){for(let i=0;i<ids.length;i+=32){const values=await batch(c,ids.slice(i,i+32).map(id=>p+'/labels/'+id),['revision','lastOp']);metadataLabelsFetched+=values.size;
  for(const[path,value]of values){assert.deepEqual(Object.keys(value).sort(),['lastOp','revision']);const id=path.split('/').at(-1),old=cache.labels.get(id);if(old&&old.revision===value.revision&&old.lastOp===value.lastOp)labels.set(id,old);else changed.push(id);}await hook();}}
 else changed.push(...ids);
 for(let i=0;i<changed.length;i+=32){const values=await batch(c,changed.slice(i,i+32).map(id=>p+'/labels/'+id));bodyLabelsFetched+=values.size;for(const[path,value]of values){assert.deepEqual(Object.keys(value).sort(),['displayName','lastOp','performanceId','personId','revision']);labels.set(path.split('/').at(-1),value);}await hook();}
 const after=await head(c,p,true);if(!same(before,after))throw new ReceiveError('mixed-revision');
 if(labels.size!==ids.length)throw new ReceiveError('incomplete-batch');return{cache:{head:full,labels},unchanged:false,bodyLabelsFetched,metadataLabelsFetched};
}
