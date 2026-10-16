import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/remote-summary.json',root)));let sourceComparisons=0;
assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
for(const [path,h] of Object.entries(r.sourceHashes)){
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,path);sourceComparisons++;
}
assert.equal(r.decisionId,'TECH-DD91-107');assert.equal(r.reports.length,8);
assert.deepEqual(r.reports.map(x=>x.httpStatus),[200,401,401,200,401,200,401,401]);
assert.equal(r.authUsersCreated,2);assert.equal(r.googleAccountUsed,false);assert.equal(r.realPersonalProfileUsed,false);
assert(r.applicationCalls<=200&&r.maxJsonNodes<=4000&&r.maxRootJsonBytes<=1048576&&r.observedApplicationBodyBytes<=20971520);
for(const key of ['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(r.cleanup[key],true);
assert.equal(r.cleanup.usersDeleted,2);assert.equal(r.cleanup.authUsersRemaining,0);
const result={decisionId:'TECH-DD91-107-A',externalTrials:1,groups:8,sourceComparisons,allCurrentSourcesMatch:true,applicationCalls:r.applicationCalls,cleanupVerified:true,googleLoginUsed:false,normalManagerPermitCreationVerified:false,externalFailureCauseConfirmed:false,fullBusinessFreeTierVerified:false};
fs.writeFileSync(new URL('artifacts/remote-audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
