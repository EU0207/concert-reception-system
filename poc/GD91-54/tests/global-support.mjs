import assert from 'node:assert/strict';
import {fixture,manual,parts,writes,commit,doc,write,seed} from './support.mjs';
import {request,base,ok,data} from './transport.mjs';

const binding=f=>({formatVersion:1,generation:f.next.generation,baseGeneration:f.old.generation,controlRevision:1});
const initialIds=f=>({...binding(f),cursor:0,lastChunk:'',usedIds:Object.fromEntries([f.section,...Object.values(f.head.lines).map(l=>l.lineId)].map(id=>[id,true])),usedLabels:{}});
const initialNumbers=f=>({...binding(f),cursor:0,lastChunk:'',numberCursors:{}});
const put=(f,path,value,exists=true,token=f.manager.token)=>commit([write(doc(f,path),value,exists)],token);
const get=(f,path,token='owner')=>request(base+'/'+doc(f,path),token);
async function stored(f,path,token='owner'){const r=await get(f,path,token);ok(r);return data(r);}
async function stage(f,p,through=4){ok(await commit(writes(f,p),f.manager.token));for(let step=1;step<=through;step++)ok(await put(f,'proofs/'+p.id,{...binding(f),chunkId:p.id,step},step>1));}
async function start(f){const ids=initialIds(f),numbers=initialNumbers(f);ok(await put(f,'globalIds/current',ids,false));ok(await put(f,'numberScan/current',numbers,false));return {ids,numbers};}
function nextIds(f,p,b){
 const a=structuredClone(b);a.lastChunk=p.id;a.cursor+=p.chunk.content.length;
 for(const x of p.chunk.content){a.usedIds[x.cell.cellId]=true;if(x.cell.kind==='seat'){
  a.usedIds[x.cell.seatId]=true;const line=f.head.lines[f.head.axis==='horizontal'?x.cell.row:x.cell.column];
  const label=x.numbering.mode==='manual'?x.numbering.manualNumber.trim():(line.prefix+x.numbering.number).trim();
  a.usedLabels[line.lineId+':'+label]=true;
 }}return a;
}
function nextNumber(f,p,b){
 const a=structuredClone(b),x=p.chunk.content[b.cursor-p.chunk.row*f.head.columns-p.chunk.startColumn];
 assert(x);const key=String(f.head.axis==='horizontal'?x.cell.row:x.cell.column),line=f.head.lines[key],delta=f.head.seatOrder==='forward'?1:-1;
 const before=b.numberCursors[key]??(delta===1?line.startNumber:line.nextAutomaticNumber-1);
 const consumed=x.cell.kind==='seat'&&x.numbering.mode==='automatic'?x.numbering.number:x.cell.consumedNumber;
 a.numberCursors[key]=before+(consumed===undefined?0:delta);a.cursor++;a.lastChunk=p.id;return a;
}
const finish=(f,state)=>({...binding(f),operationId:f.next.generation,proofPlan:'GD91-54',cells:f.head.rows*f.head.columns,seats:Object.keys(state.ids.usedLabels).length});
async function scan(f,all,state){for(const p of all){state.ids=nextIds(f,p,state.ids);ok(await put(f,'globalIds/current',state.ids));for(const x of p.chunk.content){state.numbers=nextNumber(f,p,state.numbers);ok(await put(f,'numberScan/current',state.numbers));}}return state;}
async function complete(f,all=parts(f)){for(const p of all)await stage(f,p);const state=await scan(f,all,await start(f));ok(await put(f,'structureProof/current',finish(f,state),false));assert.deepEqual(await stored(f,'structureProof/current'),finish(f,state));return{all,state};}
async function changeControl(f,change){await seed('sourceProofShows/'+f.show+'/control/current',{revision:1,activeGeneration:f.next.generation,publishedGeneration:f.old.generation,phase:'preparing',...change});}
export {fixture,manual,parts,writes,commit,doc,write,seed,binding,initialIds,initialNumbers,put,get,stored,stage,start,nextIds,nextNumber,finish,scan,complete,changeControl};
