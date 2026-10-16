import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// 承認後の1試行の結果だけを監査する。外部接続やログインは行わない。
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/remote-closing-summary.json',root)));
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
assert.deepEqual(r.sourceHashes,r.endSourceHashes);
let sourceComparisons=0;
for(const[path,value]of Object.entries(r.sourceHashes)){
 assert.equal(hash(fs.readFileSync(new URL(path,root),'utf8')),value,path);sourceComparisons++;
}
assert(!r.failure);assert.equal(r.decisionId,'TECH-DD91-103');assert.equal(r.reports.length,4);assert.equal(r.progress.length,10);
assert.equal(r.existingCapacityGroups,6);assert.equal(r.authUsersCreated,5);assert.equal(r.googleAccountUsed,true);
assert.equal(r.closedAndActualsNotSeeded,true);assert.equal(r.externalFirebaseConnected,true);
assert(r.applicationCalls<=600);assert(r.maxJsonNodes<=4000);assert(r.maxRootJsonBytes<=1048576);assert(r.observedApplicationBodyBytes<=20971520);
for(const key of ['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(r.cleanup[key],true);
assert.equal(r.cleanup.usersDeleted,5);assert.equal(r.cleanup.authUsersRemaining,0);
assert.equal(r.sdkInternalWireRequestsMeasured,false);assert.equal(r.productionFreeTierVerified,false);assert.equal(r.tested3000,false);
const result={decisionId:'TECH-DD91-103-A',externalTrials:1,closingGroups:4,existingCapacityGroups:6,sourceComparisons,allCurrentSourcesMatch:true,applicationCalls:r.applicationCalls,maxJsonNodes:r.maxJsonNodes,maxRootJsonBytes:r.maxRootJsonBytes,authUsersCreated:5,authUsersRemaining:0,cleanupVerified:true,fullBusinessFreeTierVerified:false,productionImplementation:false};
fs.writeFileSync(new URL('artifacts/remote-audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
