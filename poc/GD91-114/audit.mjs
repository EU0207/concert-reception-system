import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generated} from './generate.mjs';
import {generated as prior} from '../GD91-111/generate.mjs';

const root=new URL('./',import.meta.url);let sourceComparisons=0;
const hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
function verify(path,base=root){
 const r=JSON.parse(fs.readFileSync(new URL(path,base)));assert(!r.failure,path);
 assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const [p,h] of Object.entries(r.sourceHashes)){
  const actual=createHash('sha256').update(fs.readFileSync(new URL(p,base),'utf8').replace(/\r\n/g,'\n')).digest('hex');
  assert.equal(actual,h,p);sourceComparisons++;
 }
 if(r.cleanup)assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);
 assert.equal(r.externalFirebaseConnected,false);return r;
}
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',root))),generated());
const current=generated().rules.checks.$run,previous=prior().rules.checks.$run;
for(const key of Object.keys(previous))if(!['receipts','quarantine'].includes(key))assert.deepEqual(current[key],previous[key],key);
const reports={};
for(const [scope,count] of Object.entries({retention:8,registry:8,closing:17,collection:4})){
 const r=verify('artifacts/'+scope+'-summary.json');assert.equal(r.reports.length,count);
 assert.equal(r.executedRulesSource,'../GD91-113/database.rules.json');reports[scope]=r;
}
for(const id of ['R02','R04'])assert(reports.retention.reports.find(x=>x.id===id).writeResendCount===0);
for(const id of ['F15','F16']){
 const x=reports.closing.reports.find(x=>x.id===id);assert(x.realResponseSocketDrop&&x.encryptedExecutionJournalRestart&&x.committedStepNotResent&&x.totalsNotDuplicated);
}
const budget=verify('artifacts/budget-coverage-summary.json');
assert.equal(budget.results.length,2);assert(budget.results.every(x=>x.invalidGlobalDiagnosticSubtraction<0&&x.closing.normalResponseBodyBytes===null));
for(const people of [600,1000])verify('artifacts/capacity-'+people+'-summary.json',new URL('../GD91-111/',root));
const files=['audit.mjs','generate.mjs','run-local.mjs','collection-local.mjs','retention-suite.mjs','budget.mjs','../GD91-111/registry.mjs','../GD91-111/closing.mjs','../GD91-111/execute.mjs','../GD91-111/diagnose.mjs','../GD91-104/collection.mjs','../GD91-102/collection.mjs'];
const sourceHashes=Object.fromEntries(files.map(p=>[p,hash(p)]));
const result={sourceHashes,endSourceHashes:sourceHashes,sourceComparisons,allCurrentSourcesMatch:true,latestRetentionGroups:8,latestRegistryGroups:8,latestClosingGroups:17,collectionBoundaryGroups:4,totalFreshGroups:37,
 retainedHistoricalCapacityPeople:[600,1000],largeCapacityTestsRerun:false,
 nonReceiptRuleSubtreesUnchanged:true,condition2PoCReadyForReview:true,
 condition2Approved:false,wholeIssueComplete:false,fullBusinessFreeTierVerified:false,
 externalFirebaseConnected:false,productionImplementation:false,tested3000:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceComparisons,totalFreshGroups:37,condition2PoCReadyForReview:true,wholeIssueComplete:false,fullBusinessFreeTierVerified:false}));
