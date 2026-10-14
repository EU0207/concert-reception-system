import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex'),read=f=>JSON.parse(fs.readFileSync(new URL(f,import.meta.url)));let checks=0;
const secretPattern=/AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN|[\w.+-]+@[\w.-]+\.[a-z]+/i;
for(const[name,count]of[['validate-summary',13],['regression-sharing-summary',14],['regression-manager-summary',12],['regression-queue-summary',12],['regression-general-summary',4],['minimal-local-summary',6]]){
 const r=read('artifacts/'+name+'.json');assert(!r.failure);assert.equal(r.reports.length,count);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const[f,h]of Object.entries(r.sourceHashes)){assert.equal(hash(fs.readFileSync(new URL(f,import.meta.url),'utf8')),h,f);checks++;}
 assert.deepEqual(r.cleanup,{rulesClosed:true,trialRootEmpty:true});assert.equal(r.externalFirebaseConnected,false);assert.equal(r.productionFreeTierVerified,false);assert(!secretPattern.test(JSON.stringify(r)));
}
for(const[name,commit,count]of[['setup-failure-summary','efc5868',1],['setup-failure-second-summary','09c3661',8]]){
 const r=read('artifacts/'+name+'.json');assert(r.failure);assert.equal(r.reports.length,count);assert.deepEqual(r.sourceHashes,r.endSourceHashes);assert.deepEqual(r.cleanup,{rulesClosed:true,trialRootEmpty:true});
 for(const[f,h]of Object.entries(r.sourceHashes)){const source=execFileSync('git',['show',commit+':'+path.posix.normalize('poc/GD91-98/'+f)],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(hash(source),h,f);checks++;}assert(!secretPattern.test(JSON.stringify(r)));
}
const gap=read('artifacts/release-gap-summary.json');assert(gap.baselineOnly&&gap.serverReviewHoldMissing&&gap.recoveredDeviceReleasedReference);assert.deepEqual(gap.cleanup,{rulesClosed:true,trialRootEmpty:true});assert.deepEqual(gap.sourceHashes,gap.endSourceHashes);for(const[f,h]of Object.entries(gap.sourceHashes)){assert.equal(hash(execFileSync('git',['show','dcbe2f9:'+path.posix.normalize('poc/GD91-98/'+f)],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024})),h,f);checks++;}assert(!secretPattern.test(JSON.stringify(gap)));
const r=read('artifacts/validate-summary.json');assert(r.realIndexedDbVerified&&r.nonExtractableKey&&r.quarantineReceiptOnly);assert.equal(r.manualAdoptionVerified,false);assert.equal(r.lostDeviceForceReleaseAllowed,false);assert.equal(r.wholeBrowserApplicationTested,false);assert(r.reports.find(x=>x.id.startsWith('H12')).recoveredDeviceReleaseDenied);assert(r.reports.find(x=>x.id.startsWith('H13')).unrelatedReleaseStillAllowed);
const general=read('artifacts/regression-general-summary.json');assert.equal(general.applicationCallsExcludingBootstrapAndCleanup,77);
const minimal=read('artifacts/minimal-local-summary.json');assert.equal(minimal.realIndexedDbVerifiedHere,false);assert.equal(minimal.managerLoginAndReviewTestedHere,false);assert(minimal.maxJsonNodes<=2000);assert(minimal.maxRootJsonBytes<=1048576);assert(minimal.reports.find(x=>x.id==='M06').recoveredDevicePrematureReleaseDenied);
const plan=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('remote-quarantine.mjs',import.meta.url)),'--plan'],{encoding:'utf8',windowsHide:true}));assert.equal(plan.externalRequestsExecuted,0);assert.equal(plan.decisionId,'TECH-DD91-090');assert.equal(plan.maxAuthUsers,3);assert.equal(plan.realGoogleLoginRequired,false);assert.equal(plan.maxApplicationCallsIncludingCleanup,200);assert.equal(plan.cleanupCallReserve,60);
let external=false;
if(fs.existsSync(new URL('artifacts/remote-quarantine-summary.json',import.meta.url))){
 const remote=read('artifacts/remote-quarantine-summary.json');assert(!remote.failure);assert.equal(remote.decisionId,'TECH-DD91-090');assert.deepEqual(remote.reports,minimal.reports);assert.deepEqual(remote.sourceHashes,remote.endSourceHashes);
 for(const[f,h]of Object.entries(remote.sourceHashes)){assert.equal(hash(fs.readFileSync(new URL(f,import.meta.url),'utf8')),h,f);checks++;}
 assert.equal(remote.authUsersCreated,3);assert.equal(remote.realPersonalProfileUsed,false);assert.equal(remote.googleAccountUsed,false);assert.equal(remote.externalFirebaseConnected,true);
 assert(remote.maxJsonNodes<=plan.maxJsonNodes);assert(remote.maxRootJsonBytes<=plan.maxRootJsonBytes);assert(remote.applicationCalls<=plan.maxApplicationCallsIncludingCleanup);assert(remote.observedApplicationBodyBytes<=plan.maxObservedApplicationBodyBytes);
 assert.equal(remote.applicationCalls,remote.ownerAndManagementCalls+remote.normalCalls);
 for(const k of['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(remote.cleanup[k],true);
 assert.equal(remote.cleanup.usersDeleted,3);assert.equal(remote.cleanup.authUsersRemaining,0);
 for(const k of['realIndexedDbVerifiedHere','managerLoginAndReviewTestedHere','fullBusinessFreeTierVerified','productionFreeTierVerified','tested3000','sseAndSdkWireOverheadMeasured'])assert.equal(remote[k],false);
 assert(!secretPattern.test(JSON.stringify(remote)));external=true;
}
console.log(JSON.stringify({sourceHashChecks:checks,recoveryGroups:13,regressionGroups:42,commonMinimalGroups:6,setupFailuresPreserved:2,unsafeReleaseBaselinePreserved:true,external090Executed:external,issue167Complete:false}));
