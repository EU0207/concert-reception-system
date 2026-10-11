import assert from 'node:assert/strict';
import {seed,doc,parts,commit,write} from './support.mjs';
import {binding,put,stored} from './global-support.mjs';
import {ok,request,base,data} from './transport.mjs';

const candidatePath=(f,g=f.next.generation)=>'publicationShows/'+f.show+'/candidates/'+g;
const versionPath=f=>'publicationShows/'+f.show+'/versions/current';
const versions=()=>({commit:1,layout:1,source:1,assignment:1,attendee:1,ticket:1,control:1,reception:1});
async function prime(f) {
 f.head.expectedVersions=versions();await seed(doc(f,'head/current'),f.head);
 const m=f.old.model,s=m.section;
 f.oldEntityIds=[s.sectionId,...s.lineSettings.map(l=>l.lineId),...s.cells.map(c=>c.cellId),...m.seats.map(s=>s.seatId),f.old.generation];
 f.publicationVersion={schemaVersion:1,environmentId:f.old.environmentId,performanceId:f.show,operationId:f.old.generation,values:versions(),sections:{[f.section]:f.old.generation},seatIds:f.oldIds,usedIds:f.oldEntityIds,usedGenerations:[f.old.generation]};
 await seed(versionPath(f),f.publicationVersion);
 await seed(candidatePath(f,f.old.generation),{schemaVersion:1,environmentId:f.old.environmentId,performanceId:f.show,sectionId:f.section,generation:f.old.generation,baseGeneration:'',ready:true,seatIds:f.oldIds,entityIds:f.oldEntityIds,changedSeatIds:[]});
}
const initial=f=>({...binding(f),cursor:0,lastChunk:'',seatIds:[]});
function advance(f,p,b) {
 const i=b.cursor-p.chunk.row*f.head.columns-p.chunk.startColumn,c=p.chunk.content[i].cell;
 return {...b,cursor:b.cursor+1,lastChunk:p.id,seatIds:b.seatIds.concat(c.kind==='seat'?[c.seatId]:[])};
}
async function scanSeats(f) {
 let a=initial(f);ok(await put(f,'candidateSeats/current',a,false));
 for(const p of parts(f))for(const x of p.chunk.content){a=advance(f,p,a);ok(await put(f,'candidateSeats/current',a));}
 assert.deepEqual(await stored(f,'candidateSeats/current',f.manager.token),a);return a;
}
async function body(f) {
 const ids=await stored(f,'globalIds/current'),seats=await stored(f,'candidateSeats/current'),r=await stored(f,'comparisonResult/current');
 return {schemaVersion:1,environmentId:f.old.environmentId,performanceId:f.show,sectionId:f.section,generation:f.next.generation,baseGeneration:f.old.generation,ready:true,seatIds:seats.seatIds,entityIds:[...Object.keys(ids.usedIds),f.next.generation],changedSeatIds:r.changedSeatIds,operationId:f.next.generation,proofPlan:'GD91-57',expectedVersions:f.head.expectedVersions};
}
const save=(f,m,exists=false,token=f.manager.token,g=f.next.generation)=>commit([write(candidatePath(f,g),m,exists)],token);
const get=(f,token=f.manager.token,g=f.next.generation)=>request(base+'/'+candidatePath(f,g),token);
async function finish(f) {await scanSeats(f);const m=await body(f);ok(await save(f,m));const r=await get(f);ok(r);assert.deepEqual(data(r),m);return m;}
export {prime,initial,advance,scanSeats,body,save,get,finish,candidatePath,versionPath};
