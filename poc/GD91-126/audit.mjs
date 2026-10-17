import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);let comparisons=0;
for(const file of ['compatibility-summary.json','local-summary.json']){
  const r=JSON.parse(fs.readFileSync(new URL('artifacts/'+file,root)));assert.deepEqual(r.sourceHashes,r.endSourceHashes);
  for(const[p,h]of Object.entries(r.sourceHashes)){
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;
  }
  if(file.startsWith('local')){assert(!r.failure);assert.equal(r.reports.length,7);assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);}
  else assert.equal(r.currentRulesCompatibleWithApprovedContract,false);
}
const result={sourceComparisons:comparisons,oldContractCounterexamples:2,correctedLocalGroups:7,changedRulesFormulas:2,
  earlierPartialRunsExcluded:true,externalFirebaseConnected:false,allBusinessRegressionVerified:false,realDatabaseMigrationVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
