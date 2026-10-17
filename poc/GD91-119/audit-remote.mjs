import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {generated} from '../GD91-116/generate.mjs';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/remote-summary.json',root)));
assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);let sourceComparisons=0;
for(const [path,h] of Object.entries(r.sourceHashes)){
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,path);sourceComparisons++;
}
assert.equal(r.decisionId,'TECH-DD91-109');assert.equal(r.reports.length,14);assert.equal(r.progress.length,14);
assert.deepEqual(r.reports.map(x=>x.id),r.progress.map(x=>x.id));assert.equal(r.existingCapacityGroups,6);assert(r.closedAndActualsNotSeeded);
assert.equal(r.googleAccountUsed,true);assert.equal(r.authUsersCreated,5);assert.equal(r.externalFirebaseConnected,true);
assert(r.applicationCalls<=600);assert.equal(r.applicationCalls,r.ownerAndManagementCalls+r.normalCalls+r.sdkApplicationCalls);
assert(r.maxJsonNodes<=20000&&r.maxRootJsonBytes<=1048576&&r.observedApplicationBodyBytes<=20971520);
for(const k of ['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(r.cleanup[k],true);
assert.equal(r.cleanup.usersDeleted,5);assert.equal(r.cleanup.authUsersRemaining,0);assert.equal(r.sdkInternalWireRequestsMeasured,false);assert.equal(r.fullBusinessFreeTierVerified,false);assert.equal(r.tested3000,false);
const files=['audit-remote.mjs'],sourceHashes=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const result={sourceHashes,endSourceHashes:sourceHashes,decisionId:'TECH-DD91-109-A',externalTrials:1,groups:14,sourceComparisons,
 executedRulesHash:createHash('sha256').update(JSON.stringify(generated())).digest('hex'),applicationCalls:r.applicationCalls,
 maxJsonNodes:r.maxJsonNodes,maxRootJsonBytes:r.maxRootJsonBytes,observedApplicationBodyBytes:r.observedApplicationBodyBytes,
 authUsersCreated:5,authUsersRemaining:0,cleanupVerified:true,fullBusinessFreeTierVerified:false,productionImplementation:false};
fs.writeFileSync(new URL('artifacts/remote-audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
