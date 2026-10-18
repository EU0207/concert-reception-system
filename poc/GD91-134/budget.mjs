import fs from 'node:fs';import assert from 'node:assert/strict';import {budget} from '../GD91-121/budget-model.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),normal=read('../GD91-127/artifacts/audit-summary.json'),previous=read('../GD91-121/artifacts/scenario-summary.json'),images=read('../GD91-123/artifacts/budget-summary.json');
const imageBankJsonBytes=read('../GD91-123/artifacts/local-summary.json').reports.find(x=>x.id.startsWith('I02')).stageWriteJsonBytes;assert(Number.isSafeInteger(imageBankJsonBytes));
assert(normal.allPeopleMeasured&&normal.allCurrentSourcesMatch);const reports=[];
for(const baseline of previous.reports){
 const measured=normal.reports.find(x=>x.people===baseline.people);assert(measured);
 const input={...baseline.input,normalTlsBytes:measured.tlsDownloadBytes+measured.tlsUploadBytes,restRequests:measured.normalRestRequests,
  closingRootJsonBytes:measured.rootJsonBytes,backupRequestAllowance:measured.normalRestRequests,bootstrapAndEndReserveBytes:4*measured.rootJsonBytes};
 const image=images.reports.find(x=>x.people===baseline.people&&x.id===baseline.id);assert(image);
 const current=budget(input),monthlyBytes=current.monthlyBytes+input.monthlyPerformances*image.extraPerPerformanceBytes,
  retainedJsonComparisonBytes=current.retainedJsonComparisonBytes+images.reservation.safetyFactor*input.retainedPerformances*images.reservation.imagesPerSet*images.reservation.banksRetainedPerSlot*imageBankJsonBytes;
 assert(Number.isSafeInteger(monthlyBytes)&&Number.isSafeInteger(retainedJsonComparisonBytes));
 reports.push({people:baseline.people,id:baseline.id,input,normalBaselineMonthlyBytes:current.monthlyBytes,imageExtraPerPerformanceBytes:image.extraPerPerformanceBytes,
  monthlyBytes,retainedJsonComparisonBytes,fitsIllustrativeDownloadBudget:monthlyBytes<=10000000000,fitsIllustrativeStorageBudget:retainedJsonComparisonBytes<=1000000000});
}
assert.equal(reports.length,12);for(const people of[600,1000]){assert(reports.find(x=>x.people===people&&x.id==='one-performance').fitsIllustrativeDownloadBudget);
 assert(!reports.find(x=>x.people===people&&x.id==='four-performances').fitsIllustrativeDownloadBudget);assert(!reports.find(x=>x.people===people&&x.id==='request-allowance-times-eight').fitsIllustrativeDownloadBudget);}
const hashes=sourceHashes(root,['budget.mjs','../GD91-127/artifacts/audit-summary.json','../GD91-121/artifacts/scenario-summary.json','../GD91-123/artifacts/budget-summary.json','../GD91-123/artifacts/local-summary.json']);
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});fs.writeFileSync(new URL('artifacts/budget-summary.json',root),JSON.stringify({sourceHashes:hashes,endSourceHashes:hashes,reports,
 qrContract:'BD-07-04 128-bit Base64url and independent 8-character code',imageReservation:images.reservation,providerBillingMeasured:false,
 reservationsUnchangedFrom121And123:true,fullBusinessFreeTierVerified:false,operationalLimitsApproved:false,externalFirebaseConnected:false},null,2)+'\n');
console.log(JSON.stringify(reports.map(x=>({people:x.people,id:x.id,monthlyBytes:x.monthlyBytes,storageBytes:x.retainedJsonComparisonBytes,fits:x.fitsIllustrativeDownloadBudget}))));
