import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture,manual,parts,writes,commit,doc} from './support.mjs';
import {request,base,ok,data} from './transport.mjs';
const width=Number(process.env.GD91_FRAGMENT_WIDTH??2);assert([2,3].includes(width));
const config='staged.firebase.json',rules='staged.rules';
const sources=['../'+rules,'../'+config,'staged.mjs','support.mjs','transport.mjs','../../GD91-49/codec.mjs','../../GD91-48/comparison.mjs','../../GD91-07/planner.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
const cases=[['L01','manual from gap',{},1],['L02','manual from space',{},2],['L03','retained automatic seats',{mixed:false},null],
 ['L04','manual from aisle',{},3],['L05','manual in final single-cell fragment',{columns:width+1},width],['L06','single automatic fragment',{columns:1,mixed:false},null]];
for(const[id,label,options,index]of cases){
 const f=await fixture(options);if(index!==null)manual(f,index);const selected=parts(f).find(p=>index===null||p.chunk.content.some(x=>x.cell.cellId===f.next.model.section.cells[index].cellId));assert(selected);
 const result=await commit(writes(f,selected),f.manager.token);assert([200,403].includes(result.status),JSON.stringify(result.body));
 const limited=result.status===403;if(limited)assert(result.body.error.message.includes('maximum of 1000 expressions'),JSON.stringify(result.body));
 for(const kind of ['chunks','attributes']){
  const stored=await request(base+'/'+doc(f,kind+'/'+selected.id),'owner');
  if(limited)assert.equal(stored.status,404,'Rejected pair must leave neither document');else{ok(stored);assert.deepEqual(data(stored),selected[kind==='chunks'?'chunk':'attributes']);}
 }
 reports.push({id,label,inputValidatedByCodec:true,submittedCells:selected.chunk.content.length,httpStatus:result.status,
  outcome:limited?'expression-limit':'accepted',atomicReadbackChecked:true});
 console.log(JSON.stringify({width,id,outcome:reports.at(-1).outcome}));
}
assert.equal(reports[0].outcome,'expression-limit','Known valid manual fragment must reproduce the blocker');
const endSourceHashes=await hashes();assert.deepEqual(sourceHashes,endSourceHashes);
const result={executedAt:new Date().toISOString(),runtime:{node:process.version},width,hashLineEndings:'LF',sourceHashes,endSourceHashes,
 scope:'Diagnostic characterization of six valid fragment submissions only. Parent/catalog/old source and authorization session are fixtures. No completion proof, business regression, global uniqueness, 500-seat run, new total save cost or actual-device proof.',
 successfulBusinessSuite:false,referenceUpperBounds:width===3?{chunk:8,attributes:4,batchSumWithoutCacheDiscount:12}:{chunk:8,attributes:2,batchSumWithoutCacheDiscount:10},
 accepted:reports.filter(r=>r.outcome==='accepted').length,expressionLimited:reports.filter(r=>r.outcome==='expression-limit').length,reports};
await writeFile(new URL('../artifacts/'+'staged-summary.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({width,diagnosticCases:reports.length,accepted:result.accepted,expressionLimited:result.expressionLimited,successfulBusinessSuite:false}));
