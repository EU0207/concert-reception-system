import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);let comparisons=0;
const hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
function read(path){
 const r=JSON.parse(fs.readFileSync(new URL(path,root)));assert(!r.failure,path);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const [p,h] of Object.entries(r.sourceHashes)){assert.equal(hash(p),h,p);comparisons++;}
 if(r.cleanup)assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);
 assert.equal(r.externalFirebaseConnected,false);return r;
}
const ruleHash=createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync(new URL('../GD91-113/database.rules.json',root))))).digest('hex');
const results=[];
for(const people of [4,600,1000]){
 const r=read('artifacts/capacity-'+people+'-summary.json'),x=r.reports[0];
 assert.equal(x.people,people);assert.equal(x.actualSdkEnvironments,6);assert.equal(x.closing.registeredDevices,8);
 assert(x.normalRegistrationToIssuedQr&&x.closing.closedAndActualsNotSeeded&&x.closing.allNamesAndArrivalsPreserved);
 assert.equal(r.executedRulesSource,'../GD91-113/database.rules.json');assert.equal(r.emulatorMaintenance.rulesHash,ruleHash);
 for(const stage of ['register','bulkAssign','qrCreate','ticketCheck']){
  const b=r.restMeter[stage+':normal'];assert.equal(b.requests,x.stages[stage].userRequests);assert.equal(b.responseBodyBytes,x.stages[stage].responseBodyBytes);
 }
 assert.equal(r.restMeter['reception:normal'].requests,x.reception.userRequests);
 // 締め開始直前のcontrol GETも新しい工程計測には含む。
 assert.equal(r.restMeter['closing:normal'].requests,x.closing.requests.userRequests+1);
 const normal=Object.entries(r.restMeter).filter(([k])=>k.endsWith(':normal'));
 const sum=key=>normal.reduce((n,[,v])=>n+v[key],0);
 const failedBulkRequests=r.restMeter['bulkAssign:normal'].transportErrors;
 const otherTransportFailures=sum('transportErrors')-failedBulkRequests;
 // bulkのPATCH応答と結果GETは、送信案またはその操作結果が本文となる。
 // 失われた本文は実測へ加算せず、最大送信案を使った比較モデルを別記する。
 const failedBulkBodyModelBytes=failedBulkRequests*x.maxRequestBytes;
 const sdkBody=x.snapshotStats.reduce((n,s)=>n+s.responseBodyBytes+s.geometryBodyBytes,0)+x.reception.responseBodyBytesPerEnvironment.reduce((a,b)=>a+b,0);
 results.push({people,normalRestRequests:sum('requests'),normalRestResponseBodyBytes:sum('responseBodyBytes'),normalRestRequestBodyBytes:sum('requestBodyBytes'),
  logicalSdkResponseBodyBytes:sdkBody,totalMeasuredResponseBodyBytes:sum('responseBodyBytes')+sdkBody,
  closingNormalRequests:r.restMeter['closing:normal'].requests,closingNormalResponseBodyBytes:r.restMeter['closing:normal'].responseBodyBytes,
  deniedNormalResponses:sum('failedResponses'),postClosingRootJsonBytes:r.postClosingRootJsonBytes,
  transportFailures:sum('transportErrors'),failedBulkRequests,failedBulkBodyModelBytes,unboundedOtherTransportFailures:otherTransportFailures,
  responseBodyComparisonIncludingFailedBulkModelBytes:sum('responseBodyBytes')+sdkBody+failedBulkBodyModelBytes,
  sdkReads:x.snapshotStats.reduce((n,s)=>n+s.sdkGetOperations+s.geometrySdkGets,0),sdkEvents:x.reception.eventsPerEnvironment.reduce((a,b)=>a+b,0),
  realIndexedDbVerifiedHere:false,wireOverheadMeasured:false,fullBusinessFreeTierVerified:false});
}
const unit=read('artifacts/meter-test-summary.json');assert.equal(unit.reports.length,6);
const input=read('artifacts/input-review-summary.json');assert.equal(input.proposalApproved,false);
const collection=read('artifacts/collection-budget-summary.json');assert.deepEqual(collection.reports.map(x=>x.requests),[582,16902]);
const serialization=read('artifacts/serialization-summary.json');assert(serialization.reports.every(x=>x.maxBodyBytes<1048576));
const rootModel=read('artifacts/root-model-summary.json');assert(rootModel.reports.every(x=>x.sections===16&&x.cells===4096&&x.attendeeRecords===0&&x.maxRequestBytes<1048576));
const paths=['audit.mjs','estimate.mjs','estimate-test.mjs','run-capacity.mjs'];const sourceHashes=Object.fromEntries(paths.map(p=>[p,hash(p)]));
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify({sourceHashes,endSourceHashes:sourceHashes,sourceComparisons:comparisons,allCurrentSourcesMatch:true,
 results,meterCases:6,collectionModels:2,serializationModels:2,combinedLayoutModels:2,latestRulesUnchanged:true,measurementPredatesLimitApplication:true,productLimitsApproved:false,
 condition1Complete:false,condition4Complete:false,wholeIssueComplete:false,externalFirebaseConnected:false,productionImplementation:false,tested3000:false},null,2)+'\n');
console.log(JSON.stringify({sourceComparisons:comparisons,measuredPeople:results.map(x=>x.people),bodyBytes:results.map(x=>x.totalMeasuredResponseBodyBytes),wholeIssueComplete:false}));
