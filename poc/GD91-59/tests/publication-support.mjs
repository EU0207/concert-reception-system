import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup,prepare,compare,result} from './comparison-support.mjs';
import {prime,finish} from './candidate-support.mjs';
import {manual,seed,write,commit} from './support.mjs';
import {put} from './global-support.mjs';
import {base,request,data,ok} from './transport.mjs';

const path=(f,p)=>'publicationShows/'+f.show+'/'+p;
const scoped=f=>({schemaVersion:1,environmentId:f.old.environmentId,performanceId:f.show});
const get=(f,p,token=f.manager.token)=>request(base+'/'+path(f,p),token);
async function stored(f,p,token=f.manager.token){const r=await get(f,p,token);ok(r);return data(r);}
async function primeBusiness(f,{assigned=[],tickets=[]}={}){
 f.assignment={...scoped(f),revision:1,operationId:f.old.generation,publicationOperationId:f.old.generation,assignments:Object.fromEntries(f.oldIds.map((id,i)=>[id,assigned.includes(id)?'FAKE-person-'+i:'']))};
 f.control={...scoped(f),state:'preparing',revision:1,dayStartsAt:{$timestamp:'2099-01-01T00:00:00Z'}};
 await seed(path(f,'assignmentState/current'),f.assignment);await seed(path(f,'control/current'),f.control);await seed(path(f,'ticketProtection/current'),{...scoped(f),revision:1,seatIds:tickets});
}
async function ready({options={},change,add=false,assigned=[],tickets=[]}={}){
 const f=await setup(options,change);if(add)manual(f,1);await prime(f);await primeBusiness(f,{assigned,tickets});await prepare(f);const a=await compare(f);ok(await put(f,'comparisonResult/current',result(f,a),false));f.candidate=await finish(f);return f;
}
function proposal(f,id=randomUUID()){
 const m=f.candidate,b=f.publicationVersion,a=structuredClone(b),n=structuredClone(f.assignment);
 const removed=f.oldIds.filter(id=>!m.seatIds.includes(id)),added=m.seatIds.filter(id=>!f.oldIds.includes(id)),changed=[...new Set([...removed,...m.changedSeatIds])];
 a.operationId=id;a.sections[m.sectionId]=m.generation;a.seatIds=b.seatIds.filter(id=>!f.oldIds.includes(id)).concat(m.seatIds);a.usedIds=[...new Set([...b.usedIds,...m.entityIds])];a.usedGenerations.push(m.generation);
 for(const key of ['commit','layout','source','reception'])a.values[key]++;n.publicationOperationId=id;
 if(removed.length||added.length){a.values.assignment++;n.revision++;n.operationId=id;for(const seat of removed)delete n.assignments[seat];for(const seat of added)n.assignments[seat]='';}
 const event={...scoped(f),operationId:id,kind:'publishSection',deviceUid:f.manager.uid,humanUid:f.human,controlRevision:b.values.control,expectedVersions:b.values,resultVersions:a.values,sectionId:m.sectionId,generation:m.generation,baseGeneration:m.baseGeneration,removed:Object.fromEntries(removed.map(id=>[id,''])),added:Object.fromEntries(added.map(id=>[id,''])),changed:Object.fromEntries(changed.map(id=>[id,'']))};
 return{id,after:a,assignment:n,event};
}
function writes(f,p){const e=write(path(f,'operations/'+p.id),p.event);e.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];return[write(path(f,'versions/current'),p.after,true),write(path(f,'assignmentState/current'),p.assignment,true),e];}
const save=(f,p,w=writes(f,p),token=f.manager.token)=>commit(w,token);
async function snapshot(f,p){return Object.fromEntries(await Promise.all(['versions/current','assignmentState/current','operations/'+p.id].map(async p=>{const r=await get(f,p,'owner');return[p,r.status===200?data(r):r.status];})));}
async function reject(f,p,w=writes(f,p),token=f.manager.token){const before=await snapshot(f,p),r=await save(f,p,w,token);assert([403,409].includes(r.status),JSON.stringify(r));assert.deepEqual(await snapshot(f,p),before);return r;}
async function accept(f,p){assert.deepEqual(await stored(f,'versions/current'),p.after);assert.deepEqual(await stored(f,'assignmentState/current'),p.assignment);const e=await stored(f,'operations/'+p.id);assert(e.occurredAt?.$timestamp);delete e.occurredAt;assert.deepEqual(e,p.event);return p;}
export {path,scoped,get,stored,primeBusiness,ready,proposal,writes,save,snapshot,reject,accept};
