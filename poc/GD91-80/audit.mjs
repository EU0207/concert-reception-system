import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const read=f=>JSON.parse(fs.readFileSync(new URL('artifacts/'+f,import.meta.url),'utf8'));
const setup=read('setup-summary.json'),services=read('service-summary.json'),result=read('remote-summary.json'),cleanup=read('cleanup-summary.json');
let hashes=0;
for(const report of[setup,services,result,cleanup]){
  for(const [file,expected]of Object.entries(report.sourceHashes)){
    const actual=createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
    assert.equal(actual,expected,file);hashes++;
  }
  const walk=value=>{if(value&&typeof value==='object')for(const [key,next]of Object.entries(value)){
    assert(!/^(apiKey|projectId|projectNumber|appId|uid|humanUid|deviceUid|token|idToken|refreshToken|password|privateKey|email|authorization)$/i.test(key),key);walk(next);
  }};walk(report);
  assert(!/AIza[\w-]+|crs-authcheck-20261013-[0-9a-f]{4}|Bearer\s|[\w.+-]+@[\w.-]+\.[a-z]+/i.test(JSON.stringify(report)));
}
assert(setup.projectActive&&!setup.billingEnabled&&!setup.billingAccountLinked);
assert(services.authReady&&!services.externalVerificationExecuted);
assert.deepEqual(result.sourceHashes,result.endSourceHashes);
assert.deepEqual(result.reports.map(x=>x.kind),['minimal','role','device','session','control']);
for(const r of result.reports){
  for(const field of['baseline','historicalBefore','historical']){
    assert.equal(r[field].length,4);assert(r[field].every(x=>x.httpStatus===200&&x.documents===1));
  }
  assert.equal(r.current.length,4);assert(r.current.every(x=>x.httpStatus===403&&x.documents===0));
  assert(r.stoppedWithoutItemChange);assert.equal(r.afterItemChange.error,'permission-denied');assert.equal(r.afterItemChange.records,1);
  assert.equal(r.freshListenError,'permission-denied');
  assert.equal(r.readOnlyTransaction.httpStatus,200);assert.equal(r.readOnlyTransaction.documents,1);
  assert(r.ownerSeededMetadata&&!r.sessionIssuanceVerified);
}
assert(result.cleanup.rulesClosed&&result.cleanup.authRestored&&!result.cleanup.error&&!result.cleanup.localErrors);
assert.equal(result.cleanup.documentsDeleted,27);assert.equal(result.cleanup.usersDeleted,2);
assert(cleanup.rulesClosed&&cleanup.authSettingsRestored&&cleanup.billingAccountUnlinked);
assert.equal(cleanup.authUsersRemaining,0);assert.equal(cleanup.emptyFixtureCollectionGroups,6);
assert.equal(cleanup.combinedApplicationRequests,result.applicationRequests+cleanup.requests);assert(cleanup.combinedApplicationRequests<=200);
for(const field of['productionFreeTierVerified','fullApplicationAuthorizationVerified','realDevicesVerified','tested3000'])assert.equal(result[field],false);
console.log(JSON.stringify({externalCases:5,currentMethodsRejected:20,historicalMethodsStillReadable:20,
  historicalTransactionsStillReadable:5,existingListenersStopped:5,sourceHashesVerified:hashes,
  cleanupReadBackVerified:true,applicationRequests:cleanup.combinedApplicationRequests,
  serverAuthorizationComplete:false,productionFreeTierVerified:false,issue167Complete:false}));
