import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generated} from './generate.mjs';

const root=new URL('./',import.meta.url);
const hash=value=>createHash('sha256').update(value.replace(/\r\n/g,'\n')).digest('hex');
let sourceComparisons=0;
function read(name){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/'+name+'-summary.json',root)));
 assert(!r.failure,name);assert.deepEqual(r.sourceHashes,r.endSourceHashes,name);
 for(const[path,expected]of Object.entries(r.sourceHashes)){
  assert.equal(hash(fs.readFileSync(new URL(path,root),'utf8')),expected,path);sourceComparisons++;
 }
 assert.equal(r.externalFirebaseConnected,false);
 if(r.cleanup){assert.equal(r.cleanup.rulesClosed,true);assert.equal(r.cleanup.trialRootEmpty,true);}
 for(const key of ['productionFreeTierVerified','fullBusinessFreeTierVerified'])if(key in r)assert.equal(r[key],false);
 return r;
}
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',root))),generated());
const registry=read('registry');assert.equal(registry.reports.length,8);
const closing=read('closing');assert.equal(closing.reports.length,17);assert.equal(closing.closedControlAndActualsNotSeeded,true);
for(const id of ['F15','F16']){
 const r=closing.reports.find(r=>r.id===id);assert(r.realResponseSocketDrop&&r.encryptedExecutionJournalRestart&&r.committedStepNotResent&&r.totalsNotDuplicated);
}
const capacities=[];
for(const count of [4,600,1000]){
 const r=read('capacity-'+count);assert.equal(r.reports.length,1);assert.equal(r.executedRulesSource,'database.rules.json');
 const c=r.reports[0],f=c.closing;assert.equal(c.people,count);assert.equal(c.actualSdkEnvironments,6);
 assert.equal(f.registeredDevices,8);assert.equal(f.geometryCells,count===4?8:4096);assert.equal(f.result.arrived,count);
 assert(f.normalRuntimeDeviceRegistration&&f.closedAndActualsNotSeeded&&f.allNamesAndArrivalsPreserved&&f.normalSdkReferencesReleased);
 assert.equal(f.partitions,Math.ceil(count/64));assert.equal(f.trace.finalWrites,1);assert.equal(c.fullBusinessFreeTierVerified,false);
 assert.equal(r.emulatorMaintenance.measuredMaxHeapBytes,8589934592);
 assert(r.emulatorMaintenance.boundaries.every(b=>b.applicationDataHashUnchanged&&b.exactRulesRestored));
 assert(Object.values(c.stages).every(s=>s.ownerRequests===0));
 capacities.push({people:count,cells:f.geometryCells,registeredDevices:f.registeredDevices,partitions:f.partitions});
}
const scopes={section:18,'section-common':4,'geometry-slide':9,structural:9,'display-common':4,groups:19,'groups-common':8,layout:21,'layout-common':8,closed:20,'closed-common':12,quarantine:13,sharing:14,manager:12,queue:12,general:4,clock:7,review:16,common:6};
let existingGroups=0;
for(const[label,count]of Object.entries(scopes)){
 const r=read('regression-'+label);assert.equal(r.reports.length,count);assert.equal(r.executedRulesSource,'database.rules.json');existingGroups+=count;
}
assert.equal(existingGroups,216);
const budget=read('regression-read-budget');assert.equal(budget.runs.length,4);assert(budget.runs.every(r=>r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty));
assert.equal(budget.runs.find(r=>r.spec.name==='baseline-capped').failure.code,'APPLICATION_BUDGET');
assert.equal(budget.runs.find(r=>r.spec.name==='cached-capped').failure,null);
const numbering=read('numbering-regression');assert.equal(numbering.reports.length,14);
const common=read('common-local');assert.equal(common.reports.length,4);assert.equal(common.existingCapacityGroups,6);assert(common.modelTotalIncludingAllowances<=600);assert.equal(common.closedAndActualsNotSeeded,true);
const result={registryGroups:8,closingGroups:17,existingGroups,numberingGroups:14,readBudgetComparisons:4,commonClosingGroups:4,commonExistingCapacityGroups:6,commonModelIncludingSetupAndCleanup:common.modelTotalIncludingAllowances,capacities,sourceComparisons,allCurrentSourcesMatch:true,generatedRulesMatchSource:true,normalClosingAndInitialActualsVerified:true,encryptedExecutionRecoveryVerified:true,bootstrapAndStoppedControlPreconditionsRemain:true,externalFirebaseConnected:false,fullBusinessFreeTierVerified:false,productionImplementation:false};
fs.writeFileSync(new URL('artifacts/integrated-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
