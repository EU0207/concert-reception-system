import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generated} from './generate.mjs';

const root=new URL('./',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL('artifacts/'+name+'-summary.json',root)));
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
let sourceComparisons=0;
function verify(r){
 assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const[p,h]of Object.entries(r.sourceHashes)){
  assert.equal(hash(fs.readFileSync(new URL(p,root),'utf8')),h,p);sourceComparisons++;
 }
 assert.equal(r.cleanup.rulesClosed,true);assert.equal(r.cleanup.trialRootEmpty,true);
 assert.equal(r.externalFirebaseConnected,false);assert(!r.failure);
 for(const k of ['fullBusinessFreeTierVerified','wholeBusinessFreeTierVerified','productionFreeTierVerified'])if(k in r)assert.equal(r[k],false);
}
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',root))),generated());
const boundary=read('validate');verify(boundary);assert.equal(boundary.reports.length,5);
assert.equal(boundary.capacityPolicy.maxCells,4096);assert.equal(boundary.maxParts,256);
assert.equal(boundary.reports[0].overBudgetPlanNetworkRequests,0);
assert.equal(boundary.reports[0].localDraftRetained,true);
assert.equal(boundary.reports[2].twoIndividuallyValidSectionsCannotExceedTotal,true);
assert.equal(boundary.reports[3].exact4096SavedPublishedAndRead,true);
assert.equal(boundary.reports[4].normalCollectionStillAllowed,true);
assert.equal(boundary.reports[3].maintenance.measuredMaxHeapBytes,8589934592);
assert(boundary.reports[3].maintenance.boundaries.every(x=>x.applicationDataHashUnchanged&&x.exactRulesRestored));
const scopes={section:18,'section-common':4,'geometry-slide':9,structural:9,'display-common':4,groups:19,'groups-common':8,layout:21,'layout-common':8,closed:20,'closed-common':12,quarantine:13,sharing:14,manager:12,queue:12,general:4,clock:7,review:16,common:6};
let existingGroups=0;
for(const[label,count]of Object.entries(scopes)){
 const r=read('regression-'+label);verify(r);assert.equal(r.executedRulesSource,'database.rules.json');assert.equal(r.reports.length,count);existingGroups+=count;
}
assert.equal(existingGroups,216);
const budget=read('regression-read-budget');assert.deepEqual(budget.sourceHashes,budget.endSourceHashes);
for(const[p,h]of Object.entries(budget.sourceHashes)){assert.equal(hash(fs.readFileSync(new URL(p,root),'utf8')),h,p);sourceComparisons++;}
assert.equal(budget.externalFirebaseConnected,false);assert.equal(budget.executedRulesSource,'database.rules.json');assert.equal(budget.runs.length,4);
assert(budget.runs.every(r=>r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty));
assert.equal(budget.runs.find(x=>x.spec.name==='baseline-capped').failure.code,'APPLICATION_BUDGET');
assert.equal(budget.runs.find(x=>x.spec.name==='cached-capped').failure,null);
const numbering=read('numbering-regression');verify(numbering);assert.equal(numbering.reports.length,14);
const common=read('common-local');verify(common);assert.equal(common.reports.length,6);assert.equal(common.modelTotalIncludingAllowances,153);assert(common.modelTotalIncludingAllowances<=300);
assert.equal(common.reports[5].cachedPartReads,0);assert.equal(common.realIndexedDbVerifiedHere,false);
const retention=read('retention');verify(retention);assert.equal(retention.reports.length,8);
assert.equal(retention.executedRulesSource,'database.rules.json');assert.equal(retention.capacityPlannerSource,'layout.mjs');
assert.equal(retention.realIndexedDbVerifiedHere,true);assert.equal(retention.normalClosingVerified,false);
assert.equal(retention.reports.find(x=>x.id==='R02').physicalSocketDrop,true);
assert.equal(retention.reports.find(x=>x.id==='R04').realResponseSocketDropAndIndexedDbRestart,true);
assert.equal(retention.reports.find(x=>x.id==='R08').revokedAndExpiredRoleCannotResume,true);
assert.equal(retention.storageStats.dbRequests,0);assert.equal(retention.storageStats.externalRequests,0);
const result={boundaryGroups:5,existingGroups,readBudgetComparisons:4,numberingGroups:14,commonGroups:6,retentionGroups:8,sourceComparisons,allCurrentSourcesMatch:true,generatedRulesMatchSource:true,commonModelIncludingSetupAndCleanup:common.modelTotalIncludingAllowances,realIndexedDbVerifiedHere:true,normalClosingVerified:false,externalFirebaseConnected:false,externalTrialExecuted:false,fullBusinessFreeTierVerified:false,productionImplementation:false};
fs.writeFileSync(new URL('artifacts/integrated-summary.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
