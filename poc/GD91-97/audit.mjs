import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const r=JSON.parse(fs.readFileSync(new URL('artifacts/common-local-summary.json',import.meta.url)));assert(!r.failure);assert.equal(r.reports.length,4);assert.deepEqual(r.sourceHashes,r.endSourceHashes);for(const[f,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,f);assert.deepEqual(r.cleanup,{rulesClosed:true,trialRootEmpty:true});assert.equal(r.maxJsonNodes,536);assert.equal(r.applicationCallsExcludingBootstrapAndCleanup,76);assert.equal(r.normalRegistrationPeople,2);assert.equal(r.actualGeneralReceptionDevices,2);assert.equal(r.externalFirebaseConnected,false);assert.equal(r.productionFreeTierVerified,false);assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url))),JSON.parse(fs.readFileSync(new URL('../GD91-96/database.rules.json',import.meta.url))));
const plan=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('remote-leases.mjs',import.meta.url)),'--plan'],{encoding:'utf8',windowsHide:true}));assert.equal(plan.externalRequestsExecuted,0);assert.equal(plan.decisionId,'TECH-DD91-089');assert.equal(plan.maxAuthUsers,5);assert.equal(plan.maxApplicationCallsIncludingCleanup,200);assert.equal(plan.cleanupCallReserve,60);assert.equal(plan.maxJsonNodes,2000);
const secretPattern=/AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN|[\w.+-]+@[\w.-]+\.[a-z]+/i;
assert(!secretPattern.test(JSON.stringify(r)));
let checks=Object.keys(r.sourceHashes).length,external=false;
const remoteFile=new URL('artifacts/remote-leases-summary.json',import.meta.url);
if(fs.existsSync(remoteFile)){
 const remote=JSON.parse(fs.readFileSync(remoteFile));
 assert(!remote.failure);assert.equal(remote.decisionId,'TECH-DD91-089');
 assert.deepEqual(remote.sourceHashes,remote.endSourceHashes);
 for(const[f,h]of Object.entries(remote.sourceHashes)){
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,f);checks++;
 }
 assert.deepEqual(remote.reports.map(x=>x.id),r.reports.map(x=>x.id));
 for(const id of['L01','L02','L04'])assert.deepEqual(remote.reports.find(x=>x.id===id),r.reports.find(x=>x.id===id));
 const expiry=remote.reports.find(x=>x.id==='L03');
 assert(expiry.expiredMetadataRestAndSdkDenied);assert.deepEqual(expiry.expiredSdkNewValues,[0,0]);assert.deepEqual(expiry.validSdkNewValues,[1,1]);
 assert.equal(expiry.restStreamCancelled,true);assert.equal(expiry.restStreamNewData,0);assert.equal(expiry.roleExpiryTested,false);assert.equal(expiry.clockOnlyDisconnectClaimed,false);
 assert.equal(remote.authUsersCreated,5);assert(remote.googleAccountUsed);assert(remote.realPersonalProfileUsed);assert(remote.externalFirebaseConnected);
 assert(remote.maxJsonNodes<=plan.maxJsonNodes);assert(remote.maxRootJsonBytes<=plan.maxRootJsonBytes);
 assert(remote.applicationCalls<=plan.maxApplicationCallsIncludingCleanup);assert(remote.observedApplicationBodyBytes<=plan.maxObservedApplicationBodyBytes);
 assert.equal(remote.applicationCalls,remote.ownerAndManagementCalls+remote.normalCalls+remote.sdkApplicationCalls);
 for(const k of['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(remote.cleanup[k],true);
 assert.equal(remote.cleanup.usersDeleted,5);assert.equal(remote.cleanup.authUsersRemaining,0);
 for(const k of['sdkInternalWireRequestsMeasured','sseAndSdkWireOverheadMeasured','productionFreeTierVerified','fullBusinessFreeTierVerified','realIndexedDbVerifiedHere','tested3000'])assert.equal(remote[k],false);
 assert(!secretPattern.test(JSON.stringify(remote)));external=true;
}
console.log(JSON.stringify({sourceHashChecks:checks,commonGroups:4,maxNodes:536,normalRequestsExcludingBootstrapAndCleanup:76,sameRulesAs:'GD91-96',external089Executed:external,issue167Complete:false}));
