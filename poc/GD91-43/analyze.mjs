import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

const read=async p=>(await readFile(new URL(p,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const sources=['analyze.mjs','../GD91-42/firestore.rules','../GD91-42/tests/budgets.mjs',
 '../GD91-42/artifacts/emulator-summary.json','artifacts/plan-summary.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update(await read(p)).digest('hex')])));
const sourceHashes=await hashes();
const rules=await read('../GD91-42/firestore.rules');
function body(name){const start=rules.indexOf('    function '+name+'('),end=rules.indexOf('\n    function ',start+1);assert(start>=0&&end>start);return rules.slice(start,end);}
const assumptions=[
 ['completedTarget',"b.publishedGeneration == ''",'existing published generation cannot be replaced'],
 ['initialVersion','b.values.layout == 0 && b.values.source == 0 && b.values.assignment == 0','initial publication only'],
 ['firstPublication',"b.publishedGeneration == ''",'single selection publication'],
 ['assignmentUpdate','h.revision == v.values.layout','local head revision equals global layout version'],
 ['assignmentUpdate','a.assignments.keys().toSet() == ids.seatIds.keys().toSet()','global assignment keys equal one generation registry'],
 ['assignedForQr','s.generation == n.generation','QR is bound to the single global generation']
];
for(const [fn,text]of assumptions)assert(body(fn).includes(text),fn+': '+text);
const {budgets,joinedBudgets}=await import('../GD91-42/tests/budgets.mjs');
const summarize=values=>Object.fromEntries(Object.entries(values).map(([name,refs])=>[name,{perWrite:refs,total:refs.reduce((a,b)=>a+b,0),maxPerWrite:Math.max(...refs)}]));
const baseline={...summarize(budgets),...summarize(joinedBudgets)};
const naiveExtraDirectoryRead={reissue:baseline.reissue.total+1,cancel:baseline.cancel.total+1,
 registration:baseline.registration.total+1,dayLabel:baseline.dayLabel.total+1,noTicketAssignedCentral:baseline.noTicketAssigned.maxPerWrite+1};
assert.deepEqual(naiveExtraDirectoryRead,{reissue:21,cancel:21,registration:21,dayLabel:21,noTicketAssignedCentral:11});
const previous=JSON.parse(await read('../GD91-42/artifacts/emulator-summary.json'));
assert.equal(previous.selectedCase,'all');assert.equal(previous.reports.length,63);assert(previous.reports.every(x=>x.status==='passed'));
const calculation=JSON.parse(await read('artifacts/plan-summary.json'));assert.equal(calculation.reports.length,24);assert(calculation.reports.every(x=>x.status==='passed'));
const endSourceHashes=await hashes();assert.deepEqual(endSourceHashes,sourceHashes);
const result={executedAt:new Date().toISOString(),testLevel:'Static source and previous-evidence comparison with reference arithmetic. No new Rules or Emulator execution.',
 hashLineEndings:'LF',sourceHashes,endSourceHashes,assumptions:assumptions.map(([functionName,sourceText,meaning])=>({functionName,sourceText,meaning})),baseline,
 naiveExtraDirectoryRead,previousEvidence:{GD9142RecordedScenarios:63,rerun:false},logicalPlanScenarios:24,
 proposedContract:{businessSchemaAssigned:false,implementedRules:false,perSectionConstruction:true,performanceGlobalAssignments:true,
  normalAssignmentKeepsSeatKeys:true,seatKeysChangeOnlyWithLayoutPublication:true,newDirectoryReadOnEveryBusinessSave:false,invariantProvedByRules:false},
 limits:'No candidate write/reference/expression budget, Firestore capacity, billing, cleanup, SDK, IndexedDB or physical-device proof. Existing budget values are source-derived, not new-provider measurements.'};
await mkdir(new URL('artifacts/',import.meta.url),{recursive:true});
await writeFile(new URL('artifacts/contract-analysis.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({staticAssumptions:assumptions.length,baselinePaths:Object.keys(baseline).length,sourceHashes:sources.length,naiveExtraDirectoryRead,newRules:false,newEmulatorScenarios:0}));
