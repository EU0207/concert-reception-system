import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/remote-summary.json',root)));
assert(!r.failure);assert.equal(r.decisionId,'TECH-DD91-114');assert.equal(r.reports.length,13);assert.equal(r.progress.length,13);
assert.equal(new Set(r.reports.map(x=>x.id)).size,13);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
let comparisons=0;for(const[p,h]of Object.entries(r.sourceHashes)){
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;
}
assert.equal(r.applicationCalls,161);assert(r.applicationCalls<=600);assert(r.observedApplicationBodyBytes<=20971520);
assert.equal(r.authUsersCreated,4);assert.equal(r.cleanup.usersDeleted,4);assert.equal(r.cleanup.authUsersRemaining,0);
for(const k of ['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(r.cleanup[k],true);
for(const k of ['enforcementRestored','debugTokensRemoved','apiStateRestored'])assert.equal(r.cleanup.appCheck[k],true);
assert(r.appCheckEnforcementVerified&&r.debugProviderOnly);assert.equal(r.productionAttestationVerified,false);
const gate=r.reports.find(x=>x.id==='A01-app-check-rest-gate');assert(gate.validAccepted&&gate.missingAndInvalidDenied);
assert(r.reports.find(x=>x.id==='A02-valid-app-check-does-not-grant-auth').invalidAuthDenied);
assert(r.reports.find(x=>x.id==='A03-enforced-fresh-sdk-image').freshSdkImageVerified);
const result={sourceComparisons:comparisons,externalGroups:13,applicationCalls:r.applicationCalls,
  observedApplicationBodyBytes:r.observedApplicationBodyBytes,authUsersCreated:4,authUsersRemaining:0,
  appCheckEnforcementVerified:true,debugProviderOnly:true,productionAttestationVerified:false,
  cleanupVerified:true,fullBusinessFreeTierVerified:false,realDatabaseMigrationVerified:false};
fs.writeFileSync(new URL('artifacts/remote-audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
