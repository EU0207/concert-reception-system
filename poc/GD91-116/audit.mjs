import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generated} from './generate.mjs';
const root=new URL('./',import.meta.url);
const hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const r=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',root)));
assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
for(const [p,h] of Object.entries(r.sourceHashes))assert.equal(hash(p),h,p);
assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);assert.equal(r.reports.length,10);
for(const x of r.reports.slice(0,3))assert(x.normalSavePublishAndRead);
assert(r.reports[3].direct17SectionDeclarationRejected);
for(const x of r.reports.slice(4,6))assert(x.direct257LineCreationRejected&&x.failedCandidateCollected&&x.headPreserved);
for(const x of r.reports.slice(6)){
 assert(x.oldRulesAcceptedSamePublication||x.oldRulesAcceptedSameSharedSave);
 assert(x.newRulesRejectedSamePublication||x.newRulesRejectedSameSharedSave);
 assert(x.unresolvedPinRetained&&x.unreferencedLegacyCandidateCollected&&x.ownerFixtureResetNotBusinessRelease);
}
const old=JSON.parse(fs.readFileSync(new URL('../GD91-113/database.rules.json',root))),next=generated(),changed=[];
function compare(a,b,path=''){
 if(typeof a==='object'&&a!==null&&typeof b==='object'&&b!==null){
  assert.deepEqual(Object.keys(a),Object.keys(b),path);for(const k of Object.keys(a))compare(a[k],b[k],path+'/'+k);
 }else if(a!==b){assert.equal(typeof a,'string');assert(b.startsWith(a),path);changed.push(path);}
}
compare(old,next);assert.deepEqual(changed.sort(),[
 '/rules/checks/$run/.validate',
 '/rules/checks/$run/generations/$generation/.validate',
 '/rules/checks/$run/generations/$generation/sections/$section/.validate'
].sort());
const policy=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('policy-test.mjs',root))],{encoding:'utf8'}));
assert.equal(policy.policyCases,10);
const paths=['audit.mjs','policy-test.mjs'],sourceHashes=Object.fromEntries(paths.map(p=>[p,hash(p)]));
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify({sourceHashes,endSourceHashes:sourceHashes,localSourceComparisons:Object.keys(r.sourceHashes).length,
 localGroups:10,policyCases:10,changedRulesPaths:changed,authorizationRulesOtherwiseUnchanged:true,policyApproval:r.policyApproval,
 cleanup:r.cleanup,externalFirebaseConnected:false,fullBusinessFreeTierVerified:false,productionImplementation:false},null,2)+'\n');
console.log(JSON.stringify({localGroups:10,policyCases:10,changedRulesPaths:changed.length,cleanup:r.cleanup}));
