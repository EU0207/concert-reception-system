import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=new URL('./',import.meta.url),files=['budget.mjs','../GD91-111/capacity.mjs','../GD91-101/capacity.mjs','../GD91-111/emulator-maintenance.mjs','../GD91-111/sdk-client.mjs','../GD91-113/generate.mjs'];
const hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const results=[];
for(const people of [600,1000]){
 const path='../GD91-111/artifacts/capacity-'+people+'-summary.json';files.push(path);
 const r=JSON.parse(fs.readFileSync(new URL(path,root)));assert(!r.failure);assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);
 const x=r.reports[0];assert.equal(x.people,people);assert.equal(x.actualSdkEnvironments,6);assert.equal(x.closing.registeredDevices,8);
 const stages=Object.values(x.stages);assert(stages.every(s=>s.ownerRequests===0));
 const sum=(xs,k)=>xs.reduce((n,v)=>n+v[k],0);
 const classifiedPreparation={requests:sum(stages,'requests'),requestBodyBytes:sum(stages,'requestBodyBytes'),responseBodyBytes:sum(stages,'responseBodyBytes')};
 assert.equal(classifiedPreparation.requests,x.normalOperationRequests);
 const snapshots={sdkGets:sum(x.snapshotStats,'sdkGetOperations'),geometrySdkGets:sum(x.snapshotStats,'geometrySdkGets'),responseBodyBytes:sum(x.snapshotStats,'responseBodyBytes')+sum(x.snapshotStats,'geometryBodyBytes')};
 const reception={restRequests:x.reception.userRequests,restResponseBodyBytes:x.reception.responseBodyBytes,listenerResponseBodyBytes:x.reception.responseBodyBytesPerEnvironment.reduce((a,b)=>a+b,0)};
 const classifiedResponseBodySubtotal=classifiedPreparation.responseBodyBytes+snapshots.responseBodyBytes+reception.restResponseBodyBytes+reception.listenerResponseBodyBytes;
 const closing={normalRequests:x.closing.requests.userRequests,ownerRequests:x.closing.requests.ownerRequests,mixedResponseBodyBytes:x.closing.requests.responseBodyBytes,normalResponseBodyBytes:null};
 const invalidGlobalDiagnosticSubtraction=x.preparationRequestsIncludingLayoutAndDiagnostics.responseBodyBytes+closing.mixedResponseBodyBytes-r.emulatorMaintenance.metrics.responseBodyBytes;
 assert(invalidGlobalDiagnosticSubtraction<0,'historical-window-mismatch-not-detected');
 results.push({people,classifiedPreparation,snapshots,reception,classifiedResponseBodySubtotal,closing,
  preClosingRootJsonBytes:x.rootJsonBytes,postClosingStorageBytes:null,
  emulatorDiagnostics:r.emulatorMaintenance.metrics,invalidGlobalDiagnosticSubtraction,
  fullPreparationAndClosingBytesKnown:false,wireOverheadMeasured:false,fullBusinessFreeTierVerified:false});
}
const sourceHashes=Object.fromEntries(files.map(p=>[p,hash(p)]));
const report={sourceHashes,endSourceHashes:sourceHashes,officialCheckedOn:'2026-10-17',
 quota:{plan:'Spark',storageBytesConservativeDecimal:1000000000,downloadBytesPerMonthConservativeDecimal:10000000000,simultaneousConnections:100,dailyFirestoreWriteQuotaApplicable:false},
 officialSources:['https://firebase.google.com/pricing','https://firebase.google.com/docs/database/usage/billing','https://firebase.google.com/docs/database/usage/limits'],
 results,excludedFromEstimate:['Firestore historical daily operation counts','Emulator diagnostic traffic','unmeasured SDK protocol and TLS overhead'],
 noWholeBusinessTotalCalculated:true,monthlyResetNotDaily:true,safetyFactorForFutureDayOfBudget:2,
 externalFirebaseConnected:false,productionImplementation:false,tested3000:false};
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
fs.writeFileSync(new URL('artifacts/budget-coverage-summary.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({people:results.map(x=>x.people),classifiedResponseBodySubtotals:results.map(x=>x.classifiedResponseBodySubtotal),missingClosingByteBreakdown:true,globalDiagnosticSubtractionRejected:true,fullBusinessFreeTierVerified:false}));
