import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {buildRules} from './generate.mjs';import {referenceBudget} from './reference-budget.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),r=read('artifacts/local-summary.json'),hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(hash(fs.readFileSync(new URL(p,root),'utf8')),h,p);
assert.equal(hash(buildRules()),r.rulesHash);assert.equal(r.reports.length,30);assert.deepEqual(r.profiles.map(x=>x.people),[4,600,1000]);
assert(r.isolatedEmulatorPerProfile);assert.equal(r.javaHeapLimitGiB,8);
for(const n of [4,600,1000]){const p=read('artifacts/profile-'+n+'.json');assert(!p.failure);assert.deepEqual(p.sourceHashes,r.sourceHashes);assert.deepEqual(p.endSourceHashes,p.sourceHashes);assert(p.cleanup.trialDocumentsEmpty&&p.cleanup.rulesClosed&&p.cleanup.authUsersRemaining===0);}
for(const n of [4,600,1000]){
 // R03のpeopleは追加前に通常登録した件数N-1。他の群とprofilesは最終人数N。
 const cases=r.reports.filter(x=>x.id.startsWith('R03')?x.people===n-1:x.people===n);assert.equal(cases.length,10);
 assert.equal(cases.find(x=>x.id.startsWith('F01')).peopleOwnerSeeds,0);
 const registration=cases.find(x=>x.id.startsWith('R03'));assert.equal(registration.normalWrites,4*(n-1));
 const sdk=cases.find(x=>x.id.startsWith('S01'));assert.equal(sdk.receivedPerClient.length,6);assert(sdk.receivedPerClient.every(x=>x===n-1));assert(sdk.privateBuyerFieldsExcluded);
 const late=cases.find(x=>x.id.startsWith('R04'));assert.equal(late.finalPeople,n);assert.equal(late.assignedPeople,n===4?n-1:n);
 const negative=cases.find(x=>x.id.startsWith('X01'));assert(negative.restReadDenied&&negative.newConnectionRejectedExpiredSession&&negative.freshGateRejectsBeforeReturningData&&negative.causeUnresolved&&!negative.rawSdkAloneExpiryBoundaryVerified);
 assert(cases.find(x=>x.id.startsWith('A02')).otherPerformanceUnaffected);
}
assert(r.cleanup.sdkClientsClosed&&r.cleanup.rulesClosed&&r.cleanup.trialDocumentsEmpty&&r.cleanup.authUsersRemaining===0);
assert(r.accessGateCandidateVerified&&!r.rawSdkExpiryEnforcementVerified&&!r.allBusinessRegressionVerified&&!r.fullBusinessFreeTierVerified);
assert(r.profiles.every(x=>x.allPersonAndLabelWritesNormal&&x.headDocumentModelBytes<1048576));
const previous=read('artifacts/second-local-failure.json');assert.equal(previous.failure.phase,'4/session-expiry-sdk-head');assert.equal(previous.cleanup.authUsersRemaining,0);
const heapFailure=read('artifacts/heap-failure.json');assert.equal(heapFailure.failure.phase,'1000/normal-registration');assert(heapFailure.cleanup.error.includes('409'));assert.equal(heapFailure.reports.length,23);
const result={sourceComparisons:Object.keys(r.sourceHashes).length,groups:30,profiles:[4,600,1000],realSdkContextsPerProfile:6,normalRegistrationVerified:true,referenceBudget:referenceBudget(),rawSdkExpiryEnforcementVerified:false,accessGateCandidateVerified:true,fullBusinessFreeTierVerified:false,externalFirebaseConnected:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
