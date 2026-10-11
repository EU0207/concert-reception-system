import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture,manual,parts,writes,commit,doc,write} from './support.mjs';
import {request,base,ok,data} from './transport.mjs';
const steps=Number(process.env.GD91_PROOF_STEPS);assert([3,4].includes(steps));
const rules=steps===3?'firestore.rules':'four-step.rules',config=steps===3?'firebase.json':'four-step.firebase.json';
const sources=['../'+rules,'../'+config,'boundary-diagnostic.mjs','support.mjs','transport.mjs','../../GD91-51/firestore.rules','../../GD91-49/codec.mjs','../../GD91-48/comparison.mjs','../../GD91-07/planner.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
const cases=[['B01','horizontal forward',{rows:5,columns:5,axis:'horizontal',order:'forward'},1],['B02','horizontal reverse',{rows:5,columns:5,axis:'horizontal',order:'reverse'},1],['B03','vertical forward',{rows:5,columns:5,axis:'vertical',order:'forward'},1],['B04','vertical reverse',{rows:5,columns:5,axis:'vertical',order:'reverse'},1],['B05','all optional attributes',{rows:1,columns:5},1]];
for(const[id,label,options,index]of cases){
 const f=await fixture(options);if(index!==null)manual(f,index);
 const p=parts(f).find(p=>index===null||p.chunk.content.some(x=>x.cell.cellId===f.next.model.section.cells[index].cellId));assert(p);if(id==='B05')for(const a of p.attributes.values)Object.assign(a,{category:'reserved',usable:false,reservedLabel:'架空予約',displayOrder:42,emergencyChange:{kind:'move',reason:'架空：配置調整'}});ok(await commit(writes(f,p),f.manager.token));
 let completed=0,limitedAt=null;
 for(let step=1;step<=steps;step++){
  const body={formatVersion:1,generation:f.next.generation,baseGeneration:f.old.generation,controlRevision:1,chunkId:p.id,step};
  const r=await commit([write(doc(f,'proofs/'+p.id),body,step!==1)],f.manager.token);assert([200,403].includes(r.status),JSON.stringify(r.body));
  if(r.status===403){assert(r.body.error.message.includes('maximum of 1000 expressions'),JSON.stringify(r.body));limitedAt=step;break;}completed=step;
 }
 const r=await request(base+'/'+doc(f,'proofs/'+p.id),'owner');if(completed===0)assert.equal(r.status,404);else{ok(r);assert.equal(data(r).step,completed);}
 for(const[k,v]of [['chunks',p.chunk],['attributes',p.attributes]]){const r=await request(base+'/'+doc(f,k+'/'+p.id),'owner');ok(r);assert.deepEqual(data(r),v);}
 reports.push({id,label,inputValidatedByCodec:true,submittedCells:p.chunk.content.length,completed,limitedAt,outcome:limitedAt===null?'accepted':'expression-limit',progressAndDataReadbackChecked:true});
 console.log(JSON.stringify({steps,id,outcome:reports.at(-1).outcome,limitedAt}));
}
const endSourceHashes=await hashes();assert.deepEqual(sourceHashes,endSourceHashes);
const summary={executedAt:new Date().toISOString(),runtime:{node:process.version},steps,hashLineEndings:'LF',sourceHashes,endSourceHashes,scope:'Five directional/attribute inputs comparing grouped local proof only. No adverse-input regression, full candidate, publication, total save cost, production or actual-device proof.',accepted:reports.filter(r=>r.outcome==='accepted').length,expressionLimited:reports.filter(r=>r.outcome==='expression-limit').length,reports};
await writeFile(new URL('../artifacts/'+steps+'-step-boundary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({steps,accepted:summary.accepted,expressionLimited:summary.expressionLimited}));
