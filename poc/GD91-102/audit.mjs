import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(new URL(f,import.meta.url),'utf8'));
const secret=/AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN|[\w.+-]+@[\w.-]+\.[a-z]+/i;
let sourceHashChecks=0;
function checkSources(r,commit){
  assert.deepEqual(r.sourceHashes,r.endSourceHashes);
  for(const[f,h]of Object.entries(r.sourceHashes)){
    const source=commit?execFileSync('git',['show',commit+':'+path.posix.normalize('poc/GD91-102/'+f)],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}):fs.readFileSync(new URL(f,import.meta.url),'utf8');
    assert.equal(hash(source),h,f);sourceHashChecks++;
  }
  assert.deepEqual(r.cleanup,{rulesClosed:true,trialRootEmpty:true});assert(!secret.test(JSON.stringify(r)));
}
function verify(name,count){const r=read('artifacts/'+name+'-summary.json');assert(!r.failure,name);assert.equal(r.reports.length,count,name);checkSources(r);for(const k of['externalFirebaseConnected','productionFreeTierVerified','tested3000'])assert.equal(r[k],false,name);return r;}
const main=verify('validate',21),common=verify('common-local',8);
assert(main.assignedSeatPublicationProtectionVerified);assert.equal(main.publicationProtectionVerified,false);assert.equal(main.groupContractVerified,false);assert.equal(main.completeLayoutBusinessWorkflowVerified,false);
assert.equal(main.reports.find(x=>x.id.startsWith('P07')).publishedParts,66);
assert(main.reports.find(x=>x.id.startsWith('P06')).qrUnchanged);
assert(main.reports.find(x=>x.id.startsWith('P10')).explicitCancellationNotBlockedByNewAssignment);
assert(common.realSdkReadUsed&&common.googleIdentityMocked);assert(common.maxJsonNodes<=2000&&common.maxRootJsonBytes<=1048576);assert.equal(common.realIndexedDbVerifiedHere,false);
let regressions=0;
for(const[name,count]of[['closed',20],['closed-common',12],['quarantine',13],['sharing',14],['manager',12],['queue',12],['general',4],['clock',7],['review',16],['common',6]]){
  const r=verify('regression-'+name,count);assert.equal(r.executedRulesSource,'database.rules.json');regressions+=count;
}
assert.equal(regressions,116);
for(const[commit,count,failure]of[['8cc1f36',7,false],['a985d03',7,true],['ba207ce',7,true],['524cb23',12,true]]){
  const r=JSON.parse(execFileSync('git',['show',commit+':poc/GD91-102/artifacts/validate-summary.json'],{encoding:'utf8',windowsHide:true}));
  assert.equal(r.reports.length,count);assert.equal(!!r.failure,failure);checkSources(r,commit);
}
const bound=read('artifacts/part-bound.json');for(const[f,h]of Object.entries(bound.sourceHashes)){assert.equal(hash(fs.readFileSync(new URL(f,import.meta.url),'utf8')),h,f);sourceHashChecks++;}assert.equal(bound.slotsPerPart,16);assert.equal(bound.conservativePartJsonBytes,58767);assert(bound.conservativePartJsonBytes<=bound.limitBytes);
const generation=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('check-generation.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true}));assert(generation.generatedRulesMatchSource);
const plan=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('remote-layout.mjs',import.meta.url)),'--plan'],{encoding:'utf8',windowsHide:true}));assert.equal(plan.externalRequestsExecuted,0);assert.equal(plan.decisionId,'TECH-DD91-094');assert.equal(plan.maxAuthUsers,4);assert.equal(plan.maxJsonNodes,2000);assert.equal(plan.maxApplicationCallsIncludingCleanup,300);assert.equal(plan.cleanupCallReserve,60);assert(plan.realGoogleLoginRequired);
assert(!fs.existsSync(new URL('artifacts/remote-layout-summary.json',import.meta.url)),'external-result-not-yet-approved');
console.log(JSON.stringify({sourceHashChecks,layoutGroups:21,commonSdkGroups:8,legacyRegressionGroups:regressions,historicalFailuresPreserved:3,rulesBytes:generation.rulesBytes,externalRequestsExecuted:0,issue167Complete:false}));
