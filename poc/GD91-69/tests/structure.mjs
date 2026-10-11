import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {createSection,numberInitial} from '../../GD91-07/planner.mjs';
import {issueCatalog,doc,parts} from '../../GD91-60/tests/support.mjs';
import {complete,put,stored as sourceStored,binding} from '../../GD91-60/tests/global-support.mjs';
import {initial,advance,body,save} from '../../GD91-60/tests/candidate-support.mjs';
import {version,seed,ok} from '../../GD91-68/tests/support.mjs';
export function envelope(b,c){return c.kind==='unset'?b:b===null?{minRow:c.row,maxRow:c.row,minColumn:c.column,maxColumn:c.column}:{minRow:Math.min(b.minRow,c.row),maxRow:Math.max(b.maxRow,c.row),minColumn:Math.min(b.minColumn,c.column),maxColumn:Math.max(b.maxColumn,c.column)};}
export async function finish(f){
 let a={...initial(f),envelope:null};ok(await put(f,'candidateSeats/current',a,false));
 for(const p of parts(f))for(const x of p.chunk.content){a={...advance(f,p,a),envelope:envelope(a.envelope,x.cell)};ok(await put(f,'candidateSeats/current',a));}
 const m={...await body(f),geometry:{rows:f.head.rows,columns:f.head.columns,envelope:a.envelope}};ok(await save(f,m));return m;
}
export async function prepareFirst(f,{rows=1,columns=4,axis='horizontal',seatOrder='forward',margin=0,unusable=false,append=false}={}){
 const raw=createSection({name:'架空区画'+(f.models?.length??0),rows,columns,axis,seatOrder,lines:Array.from({length:axis==='horizontal'?rows:columns},(_,i)=>({name:'列'+i}))},{maxCells:10000});
 const model=numberInitial(raw,Object.fromEntries(raw.section.cells.map(c=>[c.row+','+c.column,c.row>=margin&&c.row<rows-margin&&c.column>=margin&&c.column<columns-margin?'seat':'unset'])),{maxCells:10000});
 if(unusable)model.seats.at(-1).usable=false;
 f.section=model.section.sectionId;f.models=append?[...f.models,model]:[model];f.old={environmentId:'FAKE-environment',performanceId:f.show,generation:'',model};f.next={...f.old,generation:randomUUID()};f.seats=model.seats.map(s=>s.seatId);const s=model.section,v=await version(f);
 f.head={environmentId:'FAKE-environment',performanceId:f.show,sectionId:f.section,generation:f.next.generation,baseGeneration:'',status:'building',controlRevision:v.values.control,rows:s.rows,columns:s.columns,axis:s.axis,seatOrder:s.seatOrder,lines:s.lineSettings,comparisonPlan:'seatId',protectionRevision:v.values.ticket,expectedVersions:v.values};
 // 構成入力headと制御だけは前提。構成片・完成証明・候補は通常要求。
 await seed(doc(f,'head/current'),f.head);await seed('sourceProofShows/'+f.show+'/control/current',{revision:v.values.control,activeGeneration:f.next.generation,publishedGeneration:'',phase:'preparing'});
 await issueCatalog(f);await complete(f);ok(await put(f,'comparisonResult/current',{...binding(f),operationId:f.next.generation,proofPlan:'GD91-57',changedSeatIds:[],protectionRevision:v.values.ticket,seats:f.seats.length},false));
 f.candidate=await finish(f);assert.equal(f.candidate.geometry.envelope?.maxRow??null,model.section.cells.filter(c=>c.kind!=='unset').at(-1)?.row??null);return f;
}
