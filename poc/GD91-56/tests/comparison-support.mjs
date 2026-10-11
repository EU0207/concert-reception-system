import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fixture,parts,doc,seed,issueCatalog} from './support.mjs';
import {binding,put,stored,stage,start,scan,finish} from './global-support.mjs';
import {pack} from '../../GD91-49/codec.mjs';
import {ok} from './transport.mjs';

function fact(head,p,slot) {
 const item=p.chunk.content[slot],line=head.lines[head.axis==='horizontal'?item.cell.row:item.cell.column];
 return {item,attributes:p.attributes.values[slot],lineId:line.lineId,prefix:item.cell.kind==='seat'&&item.numbering.mode==='automatic'?line.prefix:''};
}
const factBody=(f,p,slot)=>({...binding(f),chunkId:p.id,slot,fact:fact(f.head,p,slot)});
const baseFactBody=(f,p,slot)=>({...binding(f),sectionId:f.section,chunkId:p.id,slot,fact:fact(f.oldHead,p,slot)});

async function setup(options={},change) {
 const f=await fixture(options);if(change)change(f.next.model);
 const s=f.next.model.section;
 f.head={...f.head,rows:s.rows,columns:s.columns,axis:s.axis,seatOrder:s.seatOrder,lines:s.lineSettings,comparisonPlan:'seatId',protectionRevision:1};
 if(change)f.next.generation=randomUUID();f.head.generation=f.next.generation;
 await seed(doc(f,'head/current'),f.head);
 if(change){await seed('sourceProofShows/'+f.show+'/control/current',{revision:1,activeGeneration:f.next.generation,publishedGeneration:f.old.generation,phase:'preparing'});await issueCatalog(f);}
 const old=f.old.model.section;
 f.oldHead={environmentId:f.old.environmentId,performanceId:f.show,sectionId:f.section,generation:f.old.generation,status:'published',rows:old.rows,columns:old.columns,axis:old.axis,seatOrder:old.seatOrder,lines:old.lineSettings};
 f.oldPacked=pack(f.old,2,{maxCells:10000}).chunks;
 // 旧確定データと保護一覧だけを前提として投入する。比較用目録は通常要求で発行する。
 await seed(doc(f,'head/current',f.old.generation),f.oldHead);
 await seed(doc(f,'lineCatalog/current',f.old.generation),{sectionId:f.section,generation:f.old.generation,lines:old.lineSettings,lineIds:old.lineSettings.map(l=>l.lineId)});
 f.beforeFacts=new Map();f.oldCells=new Map();
 for(const p of f.oldPacked){await seed(doc(f,'attributes/'+p.id,f.old.generation),p.attributes);for(let slot=0;slot<p.chunk.content.length;slot++){
  const v=fact(f.oldHead,p,slot);f.oldCells.set(v.item.cell.cellId,v);
  if(v.item.cell.kind==='seat')f.beforeFacts.set(v.item.cell.seatId,v);
 }}
 f.oldIds=[...f.beforeFacts.keys()];
 await seed('sourceProofShows/'+f.show+'/protection/current',{revision:1,assignedSeatIds:[],ticketSeatIds:[]});
 return f;
}
const initialBase=f=>({...binding(f),sectionId:f.section,rows:f.oldHead.rows,columns:f.oldHead.columns,cursor:0,lastChunk:'',cellIds:[],seatIds:[],seatCells:{},usedIds:Object.fromEntries([f.section,...f.oldHead.lines.map(l=>l.lineId)].map(id=>[id,true]))});
function nextBase(f,p,slot,b) {
 const a=structuredClone(b),c=p.chunk.content[slot].cell;a.cursor++;a.lastChunk=p.id;a.cellIds.push(c.cellId);a.usedIds[c.cellId]=true;
 if(c.kind==='seat'){a.seatIds.push(c.seatId);a.seatCells[c.seatId]=c.cellId;a.usedIds[c.seatId]=true;}return a;
}
async function extractBase(f) {
 if(f.basePrepared)return f.baseManifest;
 for(const p of f.oldPacked)for(let slot=0;slot<p.chunk.content.length;slot++)ok(await put(f,'baseCellFacts/'+p.chunk.content[slot].cell.cellId,baseFactBody(f,p,slot),false));
 let a=initialBase(f);ok(await put(f,'baseSeats/current',a,false));
 for(const p of f.oldPacked)for(let slot=0;slot<p.chunk.content.length;slot++){a=nextBase(f,p,slot,a);ok(await put(f,'baseSeats/current',a));}
 assert.deepEqual(await stored(f,'baseSeats/current',f.manager.token),a);f.basePrepared=true;f.baseManifest=a;return a;
}
const initialCells=f=>({...binding(f),cursor:0,lastCellId:''});
const nextCell=(f,b)=>({...b,cursor:b.cursor+1,lastCellId:f.baseManifest.cellIds[b.cursor]});
async function compareCells(f) {
 let a=initialCells(f);ok(await put(f,'cellComparison/current',a,false));
 while(a.cursor<f.baseManifest.cellIds.length){a=nextCell(f,a);ok(await put(f,'cellComparison/current',a));}
 assert.deepEqual(await stored(f,'cellComparison/current',f.manager.token),a);return a;
}
async function newSources(f,all=parts(f)) {
 f.factBodies=new Map();
 for(const p of all){await stage(f,p);for(let slot=0;slot<p.chunk.content.length;slot++){
  const c=p.chunk.content[slot].cell,a=factBody(f,p,slot);
  if(c.kind==='seat')f.factBodies.set(c.seatId,a);
  if(f.oldCells.has(c.cellId)&&f.oldCells.get(c.cellId).item.cell.kind!=='seat')ok(await put(f,'cellFacts/'+c.cellId,a,false));
 }}return all;
}
async function prepare(f,{cells=true}={}) {
 await extractBase(f);const all=await newSources(f),state=await scan(f,all,await start(f));
 ok(await put(f,'structureProof/current',finish(f,state),false));if(cells)await compareCells(f);return {all,state};
}
const initial=f=>({...binding(f),cursor:0,lastSeatId:'',changedSeatIds:[]});
const advance=(f,b)=>{const id=f.oldIds[b.cursor],next=f.factBodies.get(id);assert(next);return {...b,cursor:b.cursor+1,lastSeatId:id,changedSeatIds:b.changedSeatIds.concat(isDeepStrictEqual(f.beforeFacts.get(id),next.fact)?[]:[id])};};
async function compare(f){let a=initial(f);ok(await put(f,'seatComparison/current',a,false));for(const id of f.oldIds){a=advance(f,a);ok(await put(f,'seatComparison/current',a));}assert.deepEqual(await stored(f,'seatComparison/current'),a);return a;}
const result=(f,a)=>({...binding(f),operationId:f.next.generation,proofPlan:'GD91-56',changedSeatIds:a.changedSeatIds,protectionRevision:1,seats:f.next.model.seats.length});
const protect=(f,assignedSeatIds=[],ticketSeatIds=[],revision=1)=>seed('sourceProofShows/'+f.show+'/protection/current',{revision,assignedSeatIds,ticketSeatIds});
export {setup,prepare,newSources,factBody,baseFactBody,initialBase,nextBase,extractBase,initialCells,nextCell,compareCells,initial,advance,compare,result,protect,issueCatalog};
