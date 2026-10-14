import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex'),read=f=>JSON.parse(fs.readFileSync(new URL(f,import.meta.url)));let checks=0;
const secret=/AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN|[\w.+-]+@[\w.-]+\.[a-z]+/i;
for(const[name,count]of[['clock-summary',7],['review-summary',16],['regression-quarantine-summary',13],['regression-sharing-summary',14],['regression-manager-summary',12],['regression-queue-summary',12],['regression-general-summary',4],['common-local-summary',6]]){
 const r=read('artifacts/'+name+'.json');assert(!r.failure);assert.equal(r.reports.length,count);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const[f,h]of Object.entries(r.sourceHashes)){assert.equal(hash(fs.readFileSync(new URL(f,import.meta.url),'utf8')),h,f);checks++;}
 assert.deepEqual(r.cleanup,{rulesClosed:true,trialRootEmpty:true});assert.equal(r.externalFirebaseConnected,false);assert.equal(r.productionFreeTierVerified,false);assert.equal(r.tested3000,false);assert(!secret.test(JSON.stringify(r)));
}
for(const[name,commit,count]of[['clock-failure-summary','e7d7b0e',2],['review-failure-summary','a13c68e',11]]){
 const r=read('artifacts/'+name+'.json');assert(r.failure);assert.equal(r.reports.length,count);assert.deepEqual(r.sourceHashes,r.endSourceHashes);assert.deepEqual(r.cleanup,{rulesClosed:true,trialRootEmpty:true});
 for(const[f,h]of Object.entries(r.sourceHashes)){assert.equal(hash(execFileSync('git',['show',commit+':'+path.posix.normalize('poc/GD91-99/'+f)],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024})),h,f);checks++;}assert(!secret.test(JSON.stringify(r)));
}
const review=read('artifacts/review-summary.json'),find=id=>review.reports.find(x=>x.id.startsWith(id));
assert(review.realIndexedDbVerified&&review.managerAdoptionVerified);assert.equal(review.exceptionCloseVerified,false);assert.equal(review.wholeBrowserApplicationTested,false);
assert(find('R07').realSocketCutAfterCommit&&find('R08').nonExtractableKey);assert.equal(find('R08').secondAdoptionWrites,0);assert(find('R13').localResultCopiesNotDuplicated&&find('R14').lostDeviceNotAssumedReceived&&find('R16').pendingPlanNotDiscarded);
const common=read('artifacts/common-local-summary.json');assert.equal(common.maxJsonNodes,318);assert.equal(common.maxRootJsonBytes,8619);assert(common.googleIdentityMocked);for(const k of['realIndexedDbVerifiedHere','physicalSocketDropTestedHere','exceptionCloseVerified','wholeBrowserApplicationTested','fullBusinessFreeTierVerified'])assert.equal(common[k],false);
const plan=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('remote-review.mjs',import.meta.url)),'--plan'],{encoding:'utf8',windowsHide:true}));
assert.equal(plan.externalRequestsExecuted,0);assert.equal(plan.decisionId,'TECH-DD91-091');assert.equal(plan.maxAuthUsers,5);assert.equal(plan.realGoogleLoginRequired,true);assert.equal(plan.maxApplicationCallsIncludingCleanup,200);assert.equal(plan.cleanupCallReserve,60);
assert(!fs.existsSync(new URL('artifacts/remote-review-summary.json',import.meta.url)),'external-result-not-expected-before-approval');
assert.equal(Buffer.byteLength(JSON.stringify(read('database.rules.json'))),810164);
console.log(JSON.stringify({sourceHashChecks:checks,clockGroups:7,reviewGroups:16,regressionGroups:55,commonGroups:6,initialFailuresPreserved:2,external091Executed:false,issue167Complete:false}));
