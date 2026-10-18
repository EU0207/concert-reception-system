import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {rules} from './rules.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL('artifacts/'+p,root))),hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex'),results=['center','archive'].map(m=>read(m+'-summary.json'));
for(const r of results){assert(!r.failure);assert.equal(r.reports.length,6);assert.deepEqual(r.sourceHashes,r.endSourceHashes);for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(hash(fs.readFileSync(new URL(p,root),'utf8')),h,p);assert.equal(hash(rules(r.mode)),r.rulesHash);
 assert(r.cleanup.rulesClosed&&r.cleanup.trialDocumentsEmpty&&r.cleanup.authUsersRemaining===0);assert(!r.externalFirebaseConnected&&!r.productionBehaviorOfCurrentRulesVerified&&!r.allReadPathsRevocationVerified);
 const h=r.reports.filter(x=>x.id.startsWith('H-'));assert.equal(h.length,4);for(const x of h){assert(Object.values(x.current).every(v=>v.status===403&&v.documents===0));assert.equal(x.historicalBaseline.batchGet.status,200);assert(x.historical.batchGet.status===200&&x.historical.batchGet.expectedDataMatched);assert(x.historicalReadOnlyTransaction.status===200&&x.historicalReadOnlyTransaction.expectedDataMatched);assert(x.historicalGet400NotAnAuthorizationResult&&x.otherPerformanceContinues);}
}
assert.deepEqual(results[0].sourceHashes,results[1].sourceHashes);
const result={groups:12,sourceComparisonsPerCandidate:Object.keys(results[0].sourceHashes).length,candidates:['center','archive'],revocationConditionsPerCandidate:4,
 currentGetMaskedGetBatchGetDenied:24,historicalBatchGetAccepted:8,historicalReadOnlyTransactionAccepted:8,historicalGetUnsupportedBeforeRevocationNotCountedAsAuthorization:true,
 currentCandidateProductionTrialExecuted:false,cleanupVerified:true,externalFirebaseConnected:false,allReadPathsRevocationVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
