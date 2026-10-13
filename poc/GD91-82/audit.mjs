import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const read=f=>JSON.parse(fs.readFileSync(new URL('artifacts/'+f,import.meta.url),'utf8'));
const local=read('local-summary.json'),remote=read('remote-summary.json'),setup=read('setup-summary.json');let verified=0;
for(const report of[local,remote,setup]){
  for(const [file,expected]of Object.entries(report.sourceHashes)){
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),expected,file);verified++;
  }
  if(report.endSourceHashes)assert.deepEqual(report.sourceHashes,report.endSourceHashes);
  const walk=v=>{if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){
    assert(!/^(apiKey|projectId|projectNumber|appId|uid|humanUid|deviceUid|token|idToken|refreshToken|password|privateKey|email|authorization|databaseUrl)$/i.test(k));walk(x);
  }};walk(report);assert(!/AIza[\w-]+|crs-authcheck-20261013-[0-9a-f]{4}|Bearer\s|[\w.+-]+@[\w.-]+\.[a-z]+/i.test(JSON.stringify(report)));
}
for(const r of[local,remote]){
  assert.deepEqual(r.reports.map(x=>x.kind),['role','device','session','control']);assert(r.peakNodes<=30);
  for(const row of r.reports){
    assert(row.before.length===4&&row.before.every(x=>x.httpStatus===200&&x.records===1));
    assert(row.current.length===4&&row.current.every(x=>x.httpStatus===401&&x.records===0));
    assert(row.modifierBefore.length===4&&row.modifierBefore.every(x=>x.httpStatus===200));
    assert(row.modifiers.length===4&&row.modifiers.every(x=>x.httpStatus===401&&x.records===0));
    assert.equal(row.selfRestoreStatus,401);assert(row.stoppedWithoutEvent);
    assert(row.sdkAfterStop.error&&row.restStreamAfterStop.error==='cancel');
    assert.equal(row.sdkAfterStop.records,1);assert.equal(row.restStreamAfterStop.records,1);assert(row.freshSdkError);
    assert.equal(row.otherActivePrincipal.httpStatus,200);assert.equal(row.otherActivePrincipal.records,2);
    assert(!row.humanIdentityVerified&&!row.sessionIssuanceVerified);
  }
  assert(r.cleanup.rulesClosed&&r.cleanup.rootsEmpty&&!r.cleanup.error);assert.equal(r.productionFreeTierVerified,false);assert.equal(r.tested3000,false);
  assert.equal(r.historicalApiEquivalenceClaimed,false);assert.equal(r.fullApplicationAuthorizationVerified,false);
}
assert(remote.cleanup.authRestored&&remote.cleanup.billingAccountUnlinked);assert.equal(remote.cleanup.usersDeleted,2);assert.equal(remote.cleanup.authUsersRemaining,0);
assert.equal(remote.cleanup.rootsDeleted,8);assert(remote.applicationRequests<=200);assert.equal(remote.productionAdoptionApproved,false);
assert(setup.rulesInitiallyClosed&&setup.databaseInitiallyEmpty&&setup.billingAccountUnlinked);
assert.equal(local.sourceHashes['database.rules.json'],remote.sourceHashes['database.rules.json']);
assert.equal(local.sourceHashes['test-cases.mjs'],remote.sourceHashes['test-cases.mjs']);
console.log(JSON.stringify({localCases:4,externalCases:4,currentMethodsRejectedPerEnvironment:16,modifiedRequestsRejectedPerEnvironment:16,
  sourceHashesVerified:verified,peakNodes:remote.peakNodes,applicationRequests:remote.applicationRequests,cleanupReadBackVerified:true,
  fullApplicationAuthorizationVerified:false,productionFreeTierVerified:false,productionAdoptionApproved:false,issue167Complete:false}));
