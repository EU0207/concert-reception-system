import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {fixture,parts,doc,seed,issueCatalog} from './support.mjs';
import {binding,put,stored,stage,start,scan,finish} from './global-support.mjs';
import {pack} from '../../GD91-49/codec.mjs';
import {ok} from './transport.mjs';
const fact=(head,p,slot)=>{const item=p.chunk.content[slot],line=head.lines[head.axis==='horizontal'?item.cell.row:item.cell.column];return{item,attributes:p.attributes.values[slot],lineId:line.lineId,prefix:item.numbering.mode==='automatic'?line.prefix:''};};
const factBody=(f,p,slot)=>({...binding(f),chunkId:p.id,slot,fact:fact(f.head,p,slot)});
async function setup(options={},change){
 const f=await fixture(options);if(change)change(f.next.model);const s=f.next.model.section;f.head={...f.head,rows:s.rows,columns:s.columns,axis:s.axis,seatOrder:s.seatOrder,lines:s.lineSettings,comparisonPlan:'seatId',protectionRevision:1};await seed(doc(f,'head/current'),f.head);
 // 旧確定版の席目録・factと保護一覧の正規発行は、この隔離試験の前提。
 const oldHead={axis:f.old.model.section.axis,lines:f.old.model.section.lineSettings},old=pack(f.old,2,{maxCells:10000});f.beforeFacts=new Map();
 for(const p of old.chunks)for(let slot=0;slot<p.chunk.content.length;slot++)if(p.chunk.content[slot].cell.kind==='seat'){const id=p.chunk.content[slot].cell.seatId,v=fact(oldHead,p,slot);f.beforeFacts.set(id,v);await seed(doc(f,'baseFacts/'+id,f.old.generation),{generation:f.old.generation,sectionId:f.section,fact:v});}
 f.oldIds=[...f.beforeFacts.keys()];await seed(doc(f,'baseSeats/current',f.old.generation),{generation:f.old.generation,sectionId:f.section,seatIds:f.oldIds});
 await seed('sourceProofShows/'+f.show+'/protection/current',{revision:1,assignedSeatIds:[],ticketSeatIds:[]});
 // 通常の目録作成を新しい候補親に対して再実行するため、別世代を構成する。
 if(change){const {randomUUID}=await import('node:crypto');f.next.generation=randomUUID();f.head.generation=f.next.generation;await seed(doc(f,'head/current'),f.head);await seed('sourceProofShows/'+f.show+'/control/current',{revision:1,activeGeneration:f.next.generation,publishedGeneration:f.old.generation,phase:'preparing'});await issueCatalog(f);}
 return f;
}
async function prepare(f){const all=parts(f);for(const p of all)await stage(f,p);const state=await scan(f,all,await start(f));ok(await put(f,'structureProof/current',finish(f,state),false));f.factBodies=new Map();for(const p of all)for(let slot=0;slot<p.chunk.content.length;slot++)if(p.chunk.content[slot].cell.kind==='seat'){const id=p.chunk.content[slot].cell.seatId,a=factBody(f,p,slot);ok(await put(f,'seatFacts/'+id,a,false));f.factBodies.set(id,a);}return{all,state};}
const initial=f=>({...binding(f),cursor:0,lastSeatId:'',changedSeatIds:[]});
const advance=(f,b)=>{const id=f.oldIds[b.cursor],next=f.factBodies.get(id);assert(next);return{...b,cursor:b.cursor+1,lastSeatId:id,changedSeatIds:b.changedSeatIds.concat(isDeepStrictEqual(f.beforeFacts.get(id),next.fact)?[]:[id])};};
async function compare(f){let a=initial(f);ok(await put(f,'seatComparison/current',a,false));for(const id of f.oldIds){a=advance(f,a);ok(await put(f,'seatComparison/current',a));}assert.deepEqual(await stored(f,'seatComparison/current'),a);return a;}
const result=(f,a)=>({...binding(f),operationId:f.next.generation,proofPlan:'GD91-55',changedSeatIds:a.changedSeatIds,protectionRevision:1,seats:f.next.model.seats.length});
const protect=(f,assignedSeatIds=[],ticketSeatIds=[],revision=1)=>seed('sourceProofShows/'+f.show+'/protection/current',{revision,assignedSeatIds,ticketSeatIds});
export {setup,prepare,factBody,initial,advance,compare,result,protect,issueCatalog};
