import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {generated} from './generate.mjs';import {generated as previous} from '../GD91-111/generate.mjs';
const root=new URL('./',import.meta.url),changes=[];let sourceComparisons=0;
function compare(a,b,path=''){
 if(a===b)return;
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  assert.deepEqual(Object.keys(a),Object.keys(b));for(const key of Object.keys(a))compare(a[key],b[key],path+'/'+key);
 }else changes.push(path);
}
compare(previous(),generated());
assert.deepEqual(changes.sort(),['/rules/checks/$run/quarantine/$device/events/$key/.validate','/rules/checks/$run/receipts/$device/events/$key/.validate']);
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',root))),generated());
function read(name){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/'+name+'-summary.json',root)));assert(!r.failure,name);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const [path,h] of Object.entries(r.sourceHashes)){
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,path);sourceComparisons++;
 }
 if(r.cleanup)assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);
 return r;
}
const local=read('local');assert.equal(local.reports.length,28);assert.equal(local.fullCommonGroups,4);assert.equal(local.existingGroups,6);assert.equal(local.closedCommonGroups,12);
const scopes={section:18,'section-common':4,'geometry-slide':9,closed:20,'closed-common':12,quarantine:13,manager:12,queue:12,general:4,clock:7,review:16,common:6};let existingGroups=0;
for(const [name,n] of Object.entries(scopes)){const r=read('regression-'+name);assert.equal(r.reports.length,n);existingGroups+=n;}
assert.equal(existingGroups,133);
const interruption=JSON.parse(fs.readFileSync(new URL('artifacts/regression-scope-interruption.json',root)));assert.equal(interruption.interruptedScopePassed,false);assert(interruption.cleanup.rulesClosed&&interruption.cleanup.trialRootEmpty);
const external=read('external-local');assert.equal(external.reports.length,8);
assert.deepEqual(external.reports.map(x=>x.httpStatus),[200,401,401,200,401,200,401,401]);
const result={observationCases:28,commonGroups:10,closedCommonGroups:12,receptionRegressionGroups:102,completedOtherRegressionGroups:31,existingGroups,externalPlanLocalGroups:8,structuralSuiteInterruptedAndNotPassed:true,changedRulePaths:changes,sourceComparisons,allCurrentSourcesMatch:true,externalFirebaseConnected:false,externalFailureCauseConfirmed:false,productionImplementation:false,fullBusinessFreeTierVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
