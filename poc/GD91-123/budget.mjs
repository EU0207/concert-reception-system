import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
const local=read('artifacts/local-summary.json'),old=read('../GD91-121/artifacts/scenario-summary.json');
assert(!local.failure);assert.equal(local.reports.length,12);
const receive=local.reports.find(x=>x.id.startsWith('I04'));
assert.equal(receive.tls.connections,6);assert.equal(receive.payloadGets,30);
assert.equal(receive.tls.requests,60);
const write=local.reports.find(x=>x.id.startsWith('I02'));
assert.equal(write.rawBytesEach,1000000);
const imageBankJsonBytes=write.stageWriteJsonBytes;
const reservation={bankSetsWritten:2,imagesPerSet:5,additionalFullDownloadSets:2,
  backupCopies:2,banksRetainedPerSlot:2,writeRelatedRequestsPerImage:6,
  bootstrapAndEndReserveCopies:4,safetyFactor:2};
const reports=[];
for(const baseline of old.reports){
  const i=baseline.input;
  const retainedImageJsonBytes=reservation.imagesPerSet*reservation.banksRetainedPerSlot*imageBankJsonBytes;
  const imageWriteCount=reservation.bankSetsWritten*reservation.imagesPerSet;
  const extras={
    // 下り枠との比較にも上りを保守的に加える。請求メーターの値ではない。
    initialAndRepeatedReceives:(1+reservation.additionalFullDownloadSets)*(receive.tls.tlsDownloadBytes+receive.tls.tlsUploadBytes),
    // 本文アップロード、PUT応答、公開前の再取得を各1組として予約する。
    imageWritesAndVerification:3*imageWriteCount*imageBankJsonBytes,
    backups:reservation.backupCopies*retainedImageJsonBytes,
    bootstrapAndEnd:reservation.bootstrapAndEndReserveCopies*retainedImageJsonBytes,
    requestAllowance:((1+reservation.additionalFullDownloadSets)*receive.tls.requests+
      imageWriteCount*reservation.writeRelatedRequestsPerImage+
      reservation.backupCopies*reservation.imagesPerSet*reservation.banksRetainedPerSlot)*i.unmeasuredRequestAllowanceBytes
  };
  const extraPerPerformanceBytes=reservation.safetyFactor*Object.values(extras).reduce((a,b)=>a+b,0);
  const monthlyBytes=baseline.monthlyBytes+i.monthlyPerformances*extraPerPerformanceBytes;
  const retainedJsonComparisonBytes=baseline.retainedJsonComparisonBytes+
    reservation.safetyFactor*i.retainedPerformances*retainedImageJsonBytes;
  assert([extraPerPerformanceBytes,monthlyBytes,retainedJsonComparisonBytes].every(Number.isSafeInteger));
  reports.push({people:baseline.people,id:baseline.id,baselineMonthlyBytes:baseline.monthlyBytes,
    baselineStorageBytes:baseline.retainedJsonComparisonBytes,extras,extraPerPerformanceBytes,
    monthlyBytes,retainedJsonComparisonBytes,fitsIllustrativeDownloadBudget:monthlyBytes<=10000000000,
    fitsIllustrativeStorageBudget:retainedJsonComparisonBytes<=1000000000});
}
assert.equal(reports.length,12);
for(const people of [600,1000]){
  assert(reports.find(x=>x.people===people&&x.id==='one-performance').fitsIllustrativeDownloadBudget);
  assert(!reports.find(x=>x.people===people&&x.id==='four-performances').fitsIllustrativeDownloadBudget);
  assert(!reports.find(x=>x.people===people&&x.id==='request-allowance-times-eight').fitsIllustrativeDownloadBudget);
}
const hashes=sourceHashes(root,['budget.mjs','artifacts/local-summary.json','../GD91-121/artifacts/scenario-summary.json']);
fs.writeFileSync(new URL('artifacts/budget-summary.json',root),JSON.stringify({sourceHashes:hashes,endSourceHashes:hashes,
  reservation,reports,measuredOnly:'TLS reads of 5 maximal images by 6 separate Auth clients',
  imageWriteBackupAndBootstrapReservationsVerified:false,providerBillingMeasured:false,
  operationalLimitsApproved:false,fullBusinessFreeTierVerified:false,externalFirebaseConnected:false},null,2)+'\n');
console.log(JSON.stringify(reports.filter(x=>['one-performance','request-allowance-times-eight'].includes(x.id)).map(x=>({people:x.people,id:x.id,monthlyBytes:x.monthlyBytes,storageBytes:x.retainedJsonComparisonBytes,fits:x.fitsIllustrativeDownloadBudget}))));
