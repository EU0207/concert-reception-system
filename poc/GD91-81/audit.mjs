import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const read=f=>JSON.parse(fs.readFileSync(new URL('artifacts/'+f,import.meta.url),'utf8'));
const r=read('remote-summary.json'),w=read('lease-window.json'),c=read('cleanup-summary.json'),wc=read('window-cleanup-summary.json');
let verified=0;
for(const report of[r,w,c,wc]){
  for(const [file,expected]of Object.entries(report.sourceHashes)){
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),expected,file);verified++;
  }
  if(report.endSourceHashes)assert.deepEqual(report.sourceHashes,report.endSourceHashes);
  const walk=v=>{if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){
    assert(!/^(apiKey|projectId|projectNumber|appId|uid|humanUid|deviceUid|token|idToken|refreshToken|password|privateKey|email|authorization)$/i.test(k));walk(x);
  }};walk(report);assert(!/AIza[\w-]+|crs-authcheck-20261013-[0-9a-f]{4}|Bearer\s|[\w.+-]+@[\w.-]+\.[a-z]+/i.test(JSON.stringify(report)));
}
assert.deepEqual(r.reports.map(x=>x.kind),['baseline','after','guard','lease']);
for(const row of r.reports){
  for(const field of['before','historicalBefore'])assert(row[field].length===4&&row[field].every(x=>x.httpStatus===200&&x.documents===1));
  assert(row.current.length===4&&row.current.every(x=>x.httpStatus===403&&x.documents===0));
  const expiry=row.kind==='lease';
  assert(row.historical.length===4&&row.historical.every(x=>x.httpStatus===(expiry?403:200)&&x.documents===(expiry?0:1)));
  assert.equal(row.readOnlyTransaction.httpStatus,expiry?403:200);assert.equal(row.historicalReadBlocked,expiry);
  assert.equal(row.otherActivePrincipal.httpStatus,200);assert.equal(row.otherActivePrincipal.documents,2);
  assert.equal(row.historicalAfterNew.httpStatus,expiry?403:200);assert.equal(row.historicalAfterNew.documents,expiry?0:1);
}
assert.equal(w.results.leaseDurationMs,20000);
assert(w.results.beforeExpiry.every(x=>x.current.httpStatus===403&&x.historical.httpStatus===200&&x.historical.documents===1));
assert(w.results.afterExpiry.every(x=>x.current.httpStatus===403&&x.historical.httpStatus===403));
assert.equal(w.results.immediateHistoricalRevocationVerified,false);assert.equal(w.results.otherActivePrincipal.httpStatus,200);
for(const [trial,check,docs]of[[r,c,16],[w,wc,3]]){
  assert(trial.cleanup.rulesClosed&&trial.cleanup.authRestored&&!trial.cleanup.error&&!trial.cleanup.localAppDeletionFailed);
  assert.equal(trial.cleanup.documentsDeleted,docs);assert.equal(trial.cleanup.usersDeleted,2);
  assert(check.rulesClosed&&check.authSettingsRestored&&check.billingAccountUnlinked);assert.equal(check.authUsersRemaining,0);
  assert.equal(check.combinedApplicationRequests,trial.applicationRequests+check.requests);assert(check.combinedApplicationRequests<=200);
  assert.equal(trial.productionFreeTierVerified,false);
}
console.log(JSON.stringify({candidateCases:4,windowMethods:2,sourceHashesVerified:verified,
  applicationRequests:[c.combinedApplicationRequests,wc.combinedApplicationRequests],
  immediateHistoricalRevocationVerified:false,serverAuthorizationVerified:false,productionFreeTierVerified:false,issue167Complete:false}));
