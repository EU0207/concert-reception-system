import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/remote-receipt-diagnostic-summary.json',root)));
assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);let sourceComparisons=0;
for(const [path,expected] of Object.entries(r.sourceHashes)){
 const text=fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n');
 assert.equal(createHash('sha256').update(text).digest('hex'),expected);sourceComparisons++;
}
assert.equal(r.decisionId,'TECH-DD91-105');assert.equal(r.reports.length,3);
assert.deepEqual(r.reports.map(x=>x.httpStatus),[200,401,200]);assert.deepEqual(r.reports.map(x=>x.receiptStored),[true,false,true]);
assert(r.reports.every(x=>Number.isFinite(x.serverOffsetMs)&&x.bootstrapBusinessDataSeeded));
assert.equal(r.authUsersCreated,2);assert.equal(r.googleAccountUsed,false);assert.equal(r.realPersonalProfileUsed,false);
assert(r.applicationCalls<=200&&r.maxJsonNodes<=4000&&r.maxRootJsonBytes<=1048576&&r.observedApplicationBodyBytes<=20971520);
for(const key of ['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(r.cleanup[key],true);
assert.equal(r.cleanup.usersDeleted,2);assert.equal(r.cleanup.authUsersRemaining,0);assert.equal(r.externalFailureCauseConfirmed,false);
const result={decisionId:'TECH-DD91-105-A',externalTrials:1,diagnosticConditions:3,sourceComparisons,currentSourcesMatch:true,applicationCalls:r.applicationCalls,maxJsonNodes:r.maxJsonNodes,maxRootJsonBytes:r.maxRootJsonBytes,cleanupVerified:true,googleLoginUsed:false,externalFailureCauseConfirmed:false,fullBusinessFreeTierVerified:false};
fs.writeFileSync(new URL('artifacts/remote-receipt-diagnostic-audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
