import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {scope} from './scope.mjs';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/remote-summary.json',root)));
assert(!r.failure);assert.equal(r.decisionId,'TECH-DD91-119');assert.equal(r.recoveryOnly,false);assert.equal(r.rulesAccepted,true);
assert.deepEqual(r.sourceHashes,r.endSourceHashes);let comparisons=0;
for(const [path,expected] of Object.entries(r.sourceHashes)){
 const actual=createHash('sha256').update(fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');assert.equal(actual,expected,path);comparisons++;
}
assert.equal(r.reports.length,7);assert.equal(r.progress.length,7);assert(r.progress.every(x=>x.passed));
assert(r.appCheckGate.validAccepted&&r.appCheckGate.missingAndInvalidDenied&&r.appCheckGate.invalidAuthDenied);
assert.equal(r.appCheckGate.propagationRounds,1);assert.equal(r.authUsersCreated,4);
for(const flag of ['appCheckRestored','rulesClosed','rootsEmpty','authUsersEmpty','authSettingsRestored','billingUnlinked','complete'])assert.equal(r.cleanup[flag],true);
assert(Object.values(r.cleanup.appCheck).every(x=>x===true));assert.equal(r.cleanup.authUsersRemaining,0);
assert.equal(r.observed.requests,r.observed.oauthRequests+r.observed.serviceRequests);assert.equal(r.observed.oauthRequests,3);
assert.equal(r.callsIncludingManualReservation,r.observed.requests+scope.manualLoginApiCallReservation);assert(r.callsIncludingManualReservation<=600);
assert.equal(r.bodyBytesIncludingReservation,r.observed.requestBodyBytes+r.observed.responseBodyBytes+scope.externalSetupBodyReservationBytes);assert(r.bodyBytesIncludingReservation<=scope.maxObservedRequestAndResponseBodyBytes);
assert.equal(r.realBrowserRestart,false);assert.equal(r.allBusinessMigrationVerified,false);assert.equal(r.productionImplementation,false);
const result={decisionId:'TECH-DD91-119-A',trialCompleted:true,approvalConsumed:true,sourceComparisons:comparisons,
 representativeGroups:7,rulesAccepted:true,authUsersCreated:4,manualGoogleLoginCount:1,
 observedRequests:r.observed.requests,oauthRequests:r.observed.oauthRequests,serviceRequests:r.observed.serviceRequests,
 callsIncludingManualReservation:r.callsIncludingManualReservation,observedBodyBytes:r.observed.requestBodyBytes+r.observed.responseBodyBytes,
 bodyBytesIncludingReservation:r.bodyBytesIncludingReservation,appCheckGate:r.appCheckGate,cleanup:r.cleanup,
 allFormatsMigrationVerified:false,productionImplementation:false,productionFreeTierVerified:false};
fs.writeFileSync(new URL('artifacts/external-audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
