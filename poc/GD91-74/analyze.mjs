import fs from 'node:fs';import assert from 'node:assert/strict';
import {digest,documentSize,fieldSize} from './meter.mjs';
const ruleUrl=new URL('../GD91-73/node_modules/.cache/firestore.rules',import.meta.url),rules=fs.readFileSync(ruleUrl,'utf8');
const budgetUrl=new URL('../GD91-63/tests/budgets.mjs',import.meta.url),source=fs.readFileSync(budgetUrl,'utf8');
const literal=source.match(/export const budgets=(\{[^;]+\});/)[1];
// リポジトリ内の数値リテラルだけを読み、関数や任意コードを実行しない。
const base=JSON.parse(literal.replace(/(\w+):/g,'"$1":'));
const references=Object.entries(base).map(([kind,counts])=>{
 const extra=kind==='publication'?[1,4]:kind==='state'?[2,2]:[1,2];
 const total=counts.reduce((s,n)=>s+n,0)+extra.reduce((s,n)=>s+n,0);
 return {kind,priorPerWriteCounts:counts,eventExtra:extra[0],indexReferences:extra[1],total,within20:total<=20,latestPerWriteAnalysisComplete:false};
});
assert.equal(references.find(x=>x.kind==='protectedPair').total,23);assert.equal(references.find(x=>x.kind==='publication').total,25);
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const array=ids=>({arrayValue:{values:ids.map(stringValue=>({stringValue}))}});
// 差替え時のbaseSeats/currentが保持する主要フィールドだけの容量下限。
const capacity=[[10,10],[500,500],[1000,500],[2000,2000],[5000,5000],[10000,10000],[10000,500]].map(([n,s])=>{
 const cells=Array.from({length:n},(_,i)=>id(i)),seats=Array.from({length:s},(_,i)=>id(10000+i));
 const fields={cellIds:array(cells),seatIds:array(seats),usedIds:{mapValue:{fields:Object.fromEntries(cells.concat(seats).map(s=>[s,{booleanValue:true}]))}},seatCells:{mapValue:{fields:Object.fromEntries(seats.map((s,i)=>[s,{stringValue:cells[i]}]))}}};
 const bytes=documentSize({name:'projects/demo-concert-seat-gd91-60/databases/(default)/documents/sourceProofShows/FAKE-size/sections/'+id(20000)+'/generations/'+id(20001)+'/baseSeats/current',fields});
 return {cells:n,seats:s,majorFieldsDocumentLowerBoundBytes:bytes,aboveDocumentLimit:bytes>1048576,
  constructionMinimumWrites:n*2+Math.ceil(n/2)*7+s,constructionFormula:'2*cells + 7*ceil(cells/2) + seats; one section, even width',
  belowFullWriteCount:true,oneDayFreeWriteBudgetExceeded:n*2+Math.ceil(n/2)*7+s>20000};
});
assert(capacity.find(x=>x.cells===10000&&x.seats===10000).aboveDocumentLimit);
assert.equal(capacity.find(x=>x.cells===10000&&x.seats===500).constructionMinimumWrites,55500);
assert.equal(documentSize({name:'projects/demo/databases/(default)/documents/users/jeff/tasks/my_task_id',fields:{type:{stringValue:'Personal'},done:{booleanValue:false},priority:{integerValue:'1'},description:{stringValue:'Learn Cloud Firestore'}}}),147);
assert.equal(fieldSize({name:{stringValue:'日本語'}}),15);
assert(rules.includes('next.attendeeIds.size() <= 500'));assert(rules.includes('a.usedIds.toSet() == b.usedIds.toSet().union(m.entityIds.toSet())'));
const report={ruleHash:digest(ruleUrl),ruleSourceUtf8Bytes:Buffer.byteLength(rules.replace(/\r\n/g,'\n')),ruleSourceBelow256KiB:Buffer.byteLength(rules)<262144,
 references,referenceAssumptions:{priorBudgets:'GD91-63の到達分岐別机上予算。GD91-73は既存関数本文を保持',eventExtra:1,indexOrdinary:2,indexConstruction:4,cacheDiscount:false,actualRulesExpressionCountsMeasured:false},
 capacity,productLimitsApproved:false,indexStorageAndWireProtocolMeasured:false,
 retention:{currentGenerationPinned:true,usedIdsMonotonic:true,deletePermitImplemented:false,localDraftPinsPublished:false,automaticTtlAdopted:false},
 sources:Object.fromEntries(['meter.mjs','analyze.mjs','../GD91-63/tests/budgets.mjs','../GD91-60/tests/global-support.mjs','../GD91-69/tests/structure.mjs','../GD91-73/index.rules','../GD91-73/node_modules/.cache/firestore.rules'].map(p=>[p,digest(new URL(p,import.meta.url))]))};
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/analysis.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ruleSourceBytes:report.ruleSourceUtf8Bytes,references,capacity,productLimitsApproved:false}));
