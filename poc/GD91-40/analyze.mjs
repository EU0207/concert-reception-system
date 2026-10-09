import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {budgets} from '../GD91-36/tests/budgets.mjs';

// 過去のRulesから得た予算と未実装の設計目標を分離する静的照合。
const sources=['analyze.mjs','../GD91-36/firestore.rules','../GD91-36/tests/budgets.mjs','../GD91-36/artifacts/emulator-summary.json','../GD91-39/firestore.rules','../GD91-39/artifacts/emulator-summary.json'];
const read=async p=>(await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update(await read(p)).digest('hex')])));
const sourceHashes=await hashes();
const oldProof=JSON.parse(await read('../GD91-36/artifacts/emulator-summary.json'));
assert.deepEqual(oldProof.budgets,budgets);
assert.equal(oldProof.reports.length,57);
const currentProof=JSON.parse(await read('../GD91-39/artifacts/emulator-summary.json'));
assert.deepEqual(currentProof.budgets.publication,[9,2,3,3,1]);
assert.equal(currentProof.reports.length,24);
const baseline=Object.fromEntries(Object.entries(budgets).map(([kind,perWrite])=>[kind,{perWrite,total:perWrite.reduce((a,b)=>a+b,0),maxPerWrite:Math.max(...perWrite)}]));
assert.equal(baseline.reissue.total,20);assert.equal(baseline.cancel.total,20);assert.equal(baseline.noTicketAssigned.maxPerWrite,10);

// 参照数は次のRulesに実装する分担の目標。コード解析結果や実測値ではない。
const targetReferences={
 versions:{authorization:3,control:1,operationAfter:1,attendeeIndexAfter:1,ownDayEventAfter:1},
 label:{versionsBefore:1,versionsAfter:1,operationAfter:1},
 attendeeIndex:{versionsBefore:1,versionsAfter:1,labelAfter:1},
 operation:{versionsBefore:1,versionsAfter:1},
 ownDayEvent:{labelBefore:1,labelAfter:1,session:1,operationAfter:1}
};
const perWrite=Object.values(targetReferences).map(x=>Object.values(x).reduce((a,b)=>a+b,0));
assert.deepEqual(perWrite,[7,3,3,2,4]);assert.equal(perWrite.reduce((a,b)=>a+b,0),19);
assert(perWrite.every(n=>n<=10));
const oldStandalone=currentProof.budgets.publication.reduce((a,b)=>a+b,0);
const naiveAddition={reissue:baseline.reissue.total+oldStandalone,cancel:baseline.cancel.total+oldStandalone,noTicketCentralPlusOne:baseline.noTicketAssigned.maxPerWrite+1};
assert.deepEqual(naiveAddition,{reissue:38,cancel:38,noTicketCentralPlusOne:11});
const source=await read('../GD91-36/firestore.rules');
for(const name of ['normalVersion','ticketVersion','cancelVersion','noTicketVersion']){
 const start=source.indexOf('    function '+name+'('),end=source.indexOf('\n    function ',start+1),body=source.slice(start,end);
 assert(start>=0);assert(body.includes('let c = control(p);')||body.includes(',e,c)'));
}
const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
await mkdir(new URL('artifacts/',import.meta.url),{recursive:true});
const result={executedAt:new Date().toISOString(),testLevel:'Static source/previous-evidence comparison and arithmetic only. No new Emulator, unit, SDK or physical-device test.',hashLineEndings:'LF',sourceHashes,endSourceHashes,baseline,baselineProof:{GD9136:57,GD9139:24,rerunThisStage:false},naiveAddition,
 plannedNameChange:{implemented:false,proposedBusinessSchema:9,targetReferences,perWrite,total:19,maxPerWrite:7,writeCount:5,expressionEvaluationMeasured:false,cacheDiscount:false},
 scope:'Candidate normalized label source plus existing assignment/layout sources; no per-seat display copy. Existing budgets are source-derived; proposed budgets are unimplemented targets. No full-save adoption or performance result.'};
await writeFile(new URL('artifacts/contract-analysis.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({baselinePaths:Object.keys(baseline).length,baselineMaxRequest:Math.max(...Object.values(baseline).map(x=>x.total)),baselineMaxDocument:Math.max(...Object.values(baseline).map(x=>x.maxPerWrite)),plannedNameChange:perWrite,plannedTotal:19,sourceHashes:Object.keys(sourceHashes).length,newEmulatorScenarios:0}));
