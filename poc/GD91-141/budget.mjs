import fs from 'node:fs';import assert from 'node:assert/strict';import {referenceBudget} from '../GD91-139/reference-budget.mjs';
const root=new URL('./',import.meta.url),reports=[],labelReferences=referenceBudget().staffReads.label;
for(const n of [600,1000])for(const pageSize of [1,2,32]){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/profile-'+n+'.json',root))),c=6,updates=50,pages=Math.ceil(n/pageSize);
 const initialBusinessDocumentReads=c*(n+3),renameBusinessDocumentReads=c*(n+4),assignmentBusinessDocumentReads=c*(n+3);
 const initialRequests=c*(pages+3),renameRequests=c*(pages+4),assignmentRequests=c*(pages+3);
 const measured=pageSize===32?Object.fromEntries(['initial','unchanged','rename','assignment'].map(k=>[k,r.metrics[k].reduce((sum,m)=>sum+m.responseBytes,0)])):null;
 const totalLowerBound=initialBusinessDocumentReads+updates*renameBusinessDocumentReads;
 const firstExcessVersion=Math.floor((50000-initialBusinessDocumentReads)/renameBusinessDocumentReads)+1;
 assert(totalLowerBound>50000);assert(firstExcessVersion>0);
 reports.push({people:n,readers:c,pageSize,cacheDiscountAssumed:false,referencesPerLabel:labelReferences,nonCacheBatchReferences:pageSize*labelReferences,
  staticReferenceGuarantee:pageSize*labelReferences<=(pageSize===1?10:20),initialBusinessDocumentReads,renameBusinessDocumentReads,assignmentBusinessDocumentReads,
  initialRequests,renameRequests,assignmentRequests,unchangedRequests:c,distinctChangedVersions:updates,
  initialPlus50RenameBusinessReadsLowerBound:totalLowerBound,firstRenameVersionExceedingDaily50000:firstExcessVersion,
  dependencyReadsIncluded:false,otherBusinessIncluded:false,measuredResponseBytesForSixReaders:measured,fullBusinessFreeTierVerified:false});
 const item=reports.at(-1);item.sameDay20MbLimitPerClient=20000000;
 item.renameResponseBytes50PerClient=measured?updates*measured.rename/c:null;
 item.initialFetchOmittedForLowerBoundOnly=true;
 item.fits20MbWith50Renames=measured?item.renameResponseBytes50PerClient<=item.sameDay20MbLimitPerClient:null;
 item.reservedInitialPlus50RenameResponseBytes=measured?2*(measured.initial+updates*measured.rename+8192*(initialRequests+updates*renameRequests)):null;
}
const result={reports,scope:'read-only-candidate',sameRequirementsPreserved:true,allBusinessTotals:null,productionBillingMeasured:false,onlineSharingTargetSeconds:5,onlineSharingMaximumSeconds:10,pollingPeriodAdopted:false};
fs.writeFileSync(new URL('artifacts/budget-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({cases:reports.length,readAmplificationBlocker:true,staticPage32Guarantee:false}));
