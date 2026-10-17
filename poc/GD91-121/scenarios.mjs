import fs from 'node:fs';import assert from 'node:assert/strict';import {budget} from './budget-model.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),audit=read('artifacts/audit-summary.json'),reports=[];
for(const measured of audit.reports.filter(x=>x.people>=600)){
 const people=measured.people,stress=read('../GD91-120/artifacts/sdk-'+people+'-summary.json'),layout=read('../GD91-117/artifacts/maximum-'+people+'-summary.json').result;
 assert(!stress.failure);assert.equal(layout.sections,16);assert.equal(layout.cells,4096);
 // 公式の下り枠との比較に、保守的に上りも加える。請求メーターとの同一性は主張しない。
 const input={normalTlsBytes:measured.tlsDownloadBytes+measured.tlsUploadBytes,extraSdkCopyBytes:stress.reports[0].wire.tlsDownloadBytes+stress.reports[0].wire.tlsUploadBytes,
  restRequests:measured.normalRestRequests,generationJsonBytes:layout.generationJsonBytes,closingRootJsonBytes:measured.rootJsonBytes,
  fullLayoutSaveRestRequests:layout.normalRequests,fullLayoutSnapshotBodyBytes:layout.snapshotResponseBodyBytes,
  extraFullLayoutSaves:10,extraSnapshotCopies:2,backupCopies:2,retainedExtraGenerations:2,retainedPerformances:1,monthlyPerformances:1,
  unmeasuredRequestAllowanceBytes:8192,extraBusinessOperations:50,extraBusinessBytesPerOperation:4*1048576,bootstrapAndEndReserveBytes:4*measured.rootJsonBytes,
  otherMonthlyBytes:1000000000,otherStoredBytes:100000000};
 for(const [id,options] of [['one-performance',{}],['four-performances',{monthlyPerformances:4,retainedPerformances:4}],
  ['twice-the-layout-saves',{extraFullLayoutSaves:20}],['request-allowance-times-eight',{unmeasuredRequestAllowanceBytes:65536}],
  ['twenty-protected-generations',{retainedExtraGenerations:20}],['four-performances-twenty-protected-each',{retainedExtraGenerations:20,monthlyPerformances:4,retainedPerformances:4}]]){
  const chosen={...input,...options};reports.push({people,id,input:chosen,...budget(chosen)});
 }
}
const paths=['scenarios.mjs','artifacts/audit-summary.json','../GD91-120/artifacts/sdk-600-summary.json','../GD91-120/artifacts/sdk-1000-summary.json',
 '../GD91-117/artifacts/maximum-600-summary.json','../GD91-117/artifacts/maximum-1000-summary.json'];
const hashes=sourceHashes(root,paths);fs.writeFileSync(new URL('artifacts/scenario-summary.json',root),JSON.stringify({sourceHashes:hashes,endSourceHashes:hashes,reports,
 modelOnly:true,externalFirebaseConnected:false,operationalLimitsApproved:false,fullBusinessFreeTierVerified:false,
 unverifiedReservations:['extra layout save request overhead','additional business operation size and frequency','initialization and ended-control business paths','physical storage and provider billing overhead'],
 unresolvedReferencesNeverDeletedToFitBudget:true},null,2)+'\n');
console.log(JSON.stringify(reports.map(r=>({people:r.people,id:r.id,monthlyBytes:r.monthlyBytes,storageBytes:r.retainedJsonComparisonBytes,fits:r.fitsIllustrativeDownloadBudget}))));
