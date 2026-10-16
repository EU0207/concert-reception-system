import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {estimate} from './estimate.mjs';
const root=new URL('./',import.meta.url);
const audit=JSON.parse(fs.readFileSync(new URL('artifacts/audit-summary.json',root)));
const reports=[];
for(const r of audit.results.filter(x=>x.people>=600)){
 assert.equal(r.unboundedOtherTransportFailures,0);
 const input={baseResponseBytes:r.responseBodyComparisonIncludingFailedBulkModelBytes,restRequests:r.normalRestRequests,
  sdkGets:r.sdkReads,sdkEvents:r.sdkEvents,sdkReplayBodyBytes:r.logicalSdkResponseBodyBytes,sdkReplayMessages:r.sdkReads+r.sdkEvents};
 for(const [name,options] of [
  ['one-performance',{}],
  ['one-reacquisition',{extraRetrievalCopies:1}],
  ['four-performances-one-reacquisition-each',{extraRetrievalCopies:1,monthlyPerformances:4}]
 ])reports.push({people:r.people,name,input:{...input,...options},...estimate({...input,...options})});
}
// 保持世代の合算モデル。未解決参照を削除して容量を合わせる設計にはしない。
const maxLayout=JSON.parse(fs.readFileSync(new URL('artifacts/root-model-summary.json',root))).reports;
const storage=[];
for(const r of audit.results.filter(x=>x.people>=600))for(const model of maxLayout){
 const perPerformance=r.postClosingRootJsonBytes+2*model.generationJsonBytes;
 storage.push({people:r.people,layoutSerialization:model.name,extraRetainedLayoutGenerations:2,perPerformanceJsonBytes:perPerformance,
  fourPerformancesWithSafetyFactorTwoBytes:4*2*perPerformance,storageLimitComparisonBytes:1000000000,
  physicalStorageMeasured:false,unresolvedGenerationsMayExceedModel:true});
}
const paths=['scenarios.mjs','estimate.mjs','artifacts/audit-summary.json','artifacts/root-model-summary.json'];
const sourceHashes=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
fs.writeFileSync(new URL('artifacts/scenario-summary.json',root),JSON.stringify({sourceHashes,endSourceHashes:sourceHashes,reports,storage,
 assumptions:{overheadBytesPerLogicalMessage:8192,safetyFactor:2,reacquisition:'SDK initial snapshot and observed listener bodies replayed; REST preparation and closing are not replayed'},
 omitted:['HTTP/TLS/WebSocket actual wire overhead','additional seat and attendee changes','initialization and final cleanup business paths','backup and other projects usage','unbounded retention of unresolved references'],
 externalFirebaseConnected:false,operationalLimitsApproved:false,fullBusinessFreeTierVerified:false},null,2)+'\n');
console.log(JSON.stringify({reports:reports.map(r=>({people:r.people,name:r.name,monthlyBytes:r.monthlyBytes})),storageModels:storage.length,fullBusinessFreeTierVerified:false}));
