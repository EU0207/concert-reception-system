import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {setup,prepare,newSources,factBody,baseFactBody,initialBase,nextBase,extractBase,initialCells,nextCell,compareCells,compare,result} from './comparison-support.mjs';
import {manual,parts,doc,seed} from './support.mjs';
import {binding,put,get,stored,stage,start,nextIds,nextNumber,changeControl} from './global-support.mjs';
import {ok,denied,request,base,data} from './transport.mjs';

const sources=['../firestore.rules','../firebase.json','history-emulator.mjs','comparison-support.mjs','global-support.mjs','support.mjs','transport.mjs','../../GD91-49/codec.mjs','../../GD91-48/comparison.mjs','../../GD91-07/planner.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const sourceHashes=await hashes(),reports=[];
async function run(id,label,test){reports.push({id,label,status:'passed',...await test()});console.log(JSON.stringify({id,status:'passed'}));}
async function baseFacts(f){for(const p of f.oldPacked)for(let slot=0;slot<p.chunk.content.length;slot++)ok(await put(f,'baseCellFacts/'+p.chunk.content[slot].cell.cellId,baseFactBody(f,p,slot),false));}
async function partialBase(f){await baseFacts(f);const b=initialBase(f);ok(await put(f,'baseSeats/current',b,false));return b;}
async function cellAt(f,target){let a=initialCells(f);ok(await put(f,'cellComparison/current',a,false));while(a.cursor<target){a=nextCell(f,a);ok(await put(f,'cellComparison/current',a));}return a;}

await run('H01','ordinary extraction covers seats and all non-seat cells',async()=>{
 const f=await setup({rows:2,columns:5}),a=await extractBase(f);
 assert.deepEqual(a.cellIds,[...f.oldCells.keys()]);assert.deepEqual(a.seatIds,f.oldIds);assert.equal(a.cursor,10);
 for(const p of f.oldPacked)for(let slot=0;slot<p.chunk.content.length;slot++)assert.deepEqual(await stored(f,'baseCellFacts/'+p.chunk.content[slot].cell.cellId),baseFactBody(f,p,slot));
 return {oldCells:10,oldSeats:2,baseFactsOwnerInjected:false};
});
await run('H02','manual additions from gap space aisle and unset preserve history',async()=>{
 const f=await setup();for(let i=1;i<5;i++)manual(f,i,'補助-'+i);
 await prepare(f);const a=await compare(f);ok(await put(f,'comparisonResult/current',result(f,a),false));
 const gap=f.next.model.section.cells[1];assert.equal(gap.consumedNumber,f.old.model.section.cells[1].consumedNumber);
 return {convertedKinds:4,gapConsumptionRetained:true};
});
await run('H03','old fact content slot binding and path cannot be forged',async()=>{
 for(const change of [a=>a.fact.item.cell.kind='unset',a=>a.fact.attributes.usable=false,a=>a.slot=1,a=>a.baseGeneration=randomUUID(),a=>a.sectionId=randomUUID()]){
  const f=await setup(),p=f.oldPacked[0],a=structuredClone(baseFactBody(f,p,0));change(a);
  denied(await put(f,'baseCellFacts/'+p.chunk.content[0].cell.cellId,a,false));
 }
 const f=await setup(),p=f.oldPacked[0];denied(await put(f,'baseCellFacts/'+randomUUID(),baseFactBody(f,p,0),false));
});
await run('H04','old fact needs published matching raw sources',async()=>{
 for(const target of ['head','catalog','attributes']){
  const f=await setup(),p=f.oldPacked[0];
  if(target==='head')await seed(doc(f,'head/current',f.old.generation),{...f.oldHead,status:'building'});
  if(target==='catalog')await seed(doc(f,'lineCatalog/current',f.old.generation),{sectionId:f.section,generation:randomUUID(),lines:f.oldHead.lines,lineIds:f.oldHead.lines.map(l=>l.lineId)});
  if(target==='attributes')await seed(doc(f,'attributes/'+p.id,f.old.generation),{...p.attributes,values:[null,null]});
  denied(await put(f,'baseCellFacts/'+p.chunk.content[0].cell.cellId,baseFactBody(f,p,0),false));
 }return {corruptPublishedSourceFixture:true};
});
await run('H05','manifest cannot begin precompleted or with invented dimensions',async()=>{
 const f=await setup(),b=initialBase(f);
 for(const a of [{...b,cursor:5},{...b,rows:2},{...b,cellIds:[randomUUID()]},{...b,seatIds:f.oldIds},{...b,usedIds:{}}])denied(await put(f,'baseSeats/current',a,false));
});
await run('H06','manifest must visit every old cell and derive seat mapping',async()=>{
 const f=await setup(),b=await partialBase(f),p=f.oldPacked[0],a=nextBase(f,p,0,b);
 for(const x of [{...a,cursor:2},{...a,cellIds:[]},{...a,seatIds:[]},{...a,seatCells:{}},{...a,lastChunk:f.oldPacked[1].id},{...a,usedIds:{...b.usedIds}}])denied(await put(f,'baseSeats/current',x));
 assert.deepEqual(await stored(f,'baseSeats/current'),b);
});
await run('H07','missing fact and partial manifest cannot become comparison bases',async()=>{
 const f=await setup(),b=initialBase(f);ok(await put(f,'baseSeats/current',b,false));
 denied(await put(f,'baseSeats/current',nextBase(f,f.oldPacked[0],0,b)));
 denied(await put(f,'cellComparison/current',initialCells(f),false));
 denied(await put(f,'seatComparison/current',{...binding(f),cursor:0,lastSeatId:'',changedSeatIds:[]},false));
});
await run('H08','new cell facts need completed local proof and exact contents',async()=>{
 const f=await setup(),p=parts(f)[0],id=p.chunk.content[1].cell.cellId,a=factBody(f,p,1);
 await stage(f,p,3);denied(await put(f,'cellFacts/'+id,a,false));ok(await put(f,'proofs/'+p.id,{...binding(f),chunkId:p.id,step:4}));
 for(const change of [x=>x.slot=0,x=>x.fact.item.cell.consumedNumber++,x=>x.fact.lineId=randomUUID(),x=>x.fact.attributes={},x=>x.generation=randomUUID()]){const x=structuredClone(a);change(x);denied(await put(f,'cellFacts/'+id,x,false));}
 denied(await put(f,'cellFacts/'+randomUUID(),a,false));ok(await put(f,'cellFacts/'+id,a,false));denied(await put(f,'cellFacts/'+id,a));
});
await run('H09','all new seats require exact source indexes before global proof',async()=>{
 const f=await setup({mixed:false}),p=parts(f)[0];await stage(f,p,4,false);const s=await start(f);
 let a=nextNumber(f,p,s.numbers);denied(await put(f,'numberScan/current',a));
 const id=p.chunk.content[0].cell.seatId;ok(await put(f,'seatFacts/'+id,factBody(f,p,0),false));ok(await put(f,'numberScan/current',a));
 const b=nextNumber(f,p,a);denied(await put(f,'numberScan/current',b));
 ok(await put(f,'seatFacts/'+p.chunk.content[1].cell.seatId,factBody(f,p,1),false));ok(await put(f,'numberScan/current',b));
 return {missingSecondSeatIndexRejected:true};
});
await run('H10','missing former non-seat cell source blocks comparison',async()=>{
 const f=await setup();await extractBase(f);const p=parts(f)[0];await stage(f,p);
 const b=await cellAt(f,1);denied(await put(f,'cellComparison/current',nextCell(f,b)));assert.deepEqual(await stored(f,'cellComparison/current'),b);
});
await run('H11','lost changed and invented consumed numbers are rejected',async()=>{
 for(const kind of ['lost','changed','invented']){
  const f=await setup();await extractBase(f);const all=parts(f),index=kind==='invented'?2:1,p=all.find(p=>p.chunk.content.some(x=>x.cell.column===index)),slot=p.chunk.content.findIndex(x=>x.cell.column===index);
  if(kind==='lost')delete p.chunk.content[slot].cell.consumedNumber;else p.chunk.content[slot].cell.consumedNumber=99;
  await newSources(f,all);const b=await cellAt(f,index);denied(await put(f,'cellComparison/current',nextCell(f,b)));
  assert.deepEqual(await stored(f,'cellComparison/current'),b);
 }return {directFragmentMutation:true,wholeNumberScanBypassedToIsolateHistoryCheck:true};
});
await run('H12','former non-seat cannot silently become automatic numbered seat',async()=>{
 const f=await setup();await extractBase(f);manual(f,2);const all=parts(f);all[1].chunk.content[0].numbering={mode:'automatic',number:1};
 await newSources(f,all);const b=await cellAt(f,2);denied(await put(f,'cellComparison/current',nextCell(f,b)));
 return {directFragmentMutation:true,wholeNumberScanBypassedToIsolateHistoryCheck:true};
});
await run('H13','cell comparison cannot skip reorder reset or cross generation',async()=>{
 const f=await setup();await extractBase(f);await newSources(f);const b=initialCells(f);ok(await put(f,'cellComparison/current',b,false));const a=nextCell(f,b);
 for(const x of [{...a,cursor:2},{...a,lastCellId:f.baseManifest.cellIds[1]},{...a,generation:randomUUID()},{...a,extra:true}])denied(await put(f,'cellComparison/current',x));
 ok(await put(f,'cellComparison/current',a));denied(await put(f,'cellComparison/current',b));
});
await run('H14','result requires complete old cell scan even when seats complete',async()=>{
 const f=await setup();await prepare(f,{cells:false});const a=await compare(f),b=await cellAt(f,1);
 denied(await put(f,'comparisonResult/current',result(f,a),false));let c=b;while(c.cursor<f.baseManifest.cellIds.length){c=nextCell(f,c);ok(await put(f,'cellComparison/current',c));}
 ok(await put(f,'comparisonResult/current',result(f,a),false));
});
await run('H15','latest authority and base revocation stop history operations',async()=>{
 for(const target of ['roles','devices','sessions','base']){
  const f=await setup();await extractBase(f);await newSources(f);const b=await cellAt(f,1);
  if(target==='base')await changeControl(f,{publishedGeneration:randomUUID()});else{const id=target==='roles'?f.human:f.manager.uid,path='publicationShows/'+f.show+'/'+target+'/'+id,r=await request(base+'/'+path,'owner');ok(r);await seed(path,{...data(r),active:false});}
  denied(await put(f,'cellComparison/current',nextCell(f,b)));
  const f2=await setup();
  if(target==='base')await changeControl(f2,{publishedGeneration:randomUUID()});else{const id=target==='roles'?f2.human:f2.manager.uid,path='publicationShows/'+f2.show+'/'+target+'/'+id,r=await request(base+'/'+path,'owner');ok(r);await seed(path,{...data(r),active:false});}
  const p=f2.oldPacked[0];denied(await put(f2,'baseCellFacts/'+p.chunk.content[0].cell.cellId,baseFactBody(f2,p,0),false));
 }return {revocationAfterSourcePreparation:true};
});
await run('H16','concurrent manifest and cell scans advance once and resume',async()=>{
 const f=await setup(),b=await partialBase(f),a=nextBase(f,f.oldPacked[0],0,b);
 const rs=await Promise.all([put(f,'baseSeats/current',a),put(f,'baseSeats/current',a)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,403]);
 let c=await stored(f,'baseSeats/current',f.manager.token);for(const p of f.oldPacked)for(let slot=0;slot<p.chunk.content.length;slot++){if(p===f.oldPacked[0]&&slot===0)continue;c=nextBase(f,p,slot,c);ok(await put(f,'baseSeats/current',c));}f.baseManifest=c;
 await newSources(f);const x=await cellAt(f,0),y=nextCell(f,x),rr=await Promise.all([put(f,'cellComparison/current',y),put(f,'cellComparison/current',y)]);assert.deepEqual(rr.map(r=>r.status).sort(),[200,403]);assert.deepEqual(await stored(f,'cellComparison/current',f.manager.token),y);
 return {transportFaultInjected:false};
});
await run('H17','source indexes and complete manifest cannot be overwritten',async()=>{
 const f=await setup();await extractBase(f);const p=f.oldPacked[0],id=p.chunk.content[0].cell.cellId;
 denied(await put(f,'baseCellFacts/'+id,baseFactBody(f,p,0)));denied(await put(f,'baseSeats/current',initialBase(f)));
 denied(await put(f,'head/current',{...f.oldHead,status:'building'},true));denied(await put(f,'chunks/'+p.id,p.chunk,true));denied(await put(f,'candidates/current',{},false));
 denied(await put({...f,next:{...f.next,generation:f.old.generation}},'chunks/'+p.id,p.chunk,true));
});
await run('H18','mixed cells complete with ordinary sources and retained gap',async()=>{
 const f=await setup({rows:2,columns:5});await prepare(f);const a=await compare(f);ok(await put(f,'comparisonResult/current',result(f,a),false));
 assert.deepEqual(a.changedSeatIds,[]);assert.equal((await stored(f,'cellComparison/current')).cursor,10);assert.equal((await stored(f,'baseSeats/current')).cursor,10);
 return {oldCells:10,newSeats:2,newNonSeatFacts:8,baseFactWrites:10,baseManifestWrites:11,cellComparisonWrites:11};
});

const endSourceHashes=await hashes();assert.deepEqual(sourceHashes,endSourceHashes);
await writeFile(new URL('../artifacts/history-summary.json',import.meta.url),JSON.stringify({executedAt:new Date().toISOString(),runtime:{node:process.version},hashLineEndings:'LF',sourceHashes,endSourceHashes,scope:'Ordinary base fact/manifest issuance from trusted published raw fixtures, complete new-seat indexing and old non-seat consumption history. No publication or full business eligibility proof.',referenceUpperBounds:{baseFactCreate:9,baseManifestStart:7,baseManifestStep:8,newCellFactCreate:9,cellComparisonStart:6,cellComparisonStep:8,globalIds:8,numberScan:9,comparisonResult:10},reports},null,2)+'\n');
console.log(JSON.stringify({scenarios:reports.length,passed:reports.length,publicationCostMeasured:false}));
