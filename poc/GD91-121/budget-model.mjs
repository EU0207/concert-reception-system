import assert from 'node:assert/strict';
// 利用条件の感度比較。未測定の項目は明示的な予約量として受け取り、0扱いで合格にしない。
export function budget(input){
 const fields=['normalTlsBytes','extraSdkCopyBytes','restRequests','generationJsonBytes','closingRootJsonBytes','fullLayoutSaveRestRequests','fullLayoutSnapshotBodyBytes',
  'extraFullLayoutSaves','extraSnapshotCopies','backupCopies','retainedExtraGenerations','retainedPerformances',
  'monthlyPerformances','unmeasuredRequestAllowanceBytes','extraBusinessOperations','extraBusinessBytesPerOperation','bootstrapAndEndReserveBytes','otherMonthlyBytes','otherStoredBytes'];
 for(const name of fields)assert(Number.isSafeInteger(input[name])&&input[name]>=0,'invalid-or-missing:'+name);
 for(const name of ['extraBusinessOperations','extraBusinessBytesPerOperation','bootstrapAndEndReserveBytes','unmeasuredRequestAllowanceBytes'])assert(input[name]>0,'unverified-category-needs-reserve:'+name);
 assert(input.monthlyPerformances>0&&input.retainedPerformances>0);
 const extras={
  repeatedSnapshots:input.extraSnapshotCopies*input.extraSdkCopyBytes,
  fullLayoutSaves:input.extraFullLayoutSaves*(2*input.generationJsonBytes+input.fullLayoutSnapshotBodyBytes+input.extraSdkCopyBytes+input.fullLayoutSaveRestRequests*input.unmeasuredRequestAllowanceBytes),
  backups:input.backupCopies*input.closingRootJsonBytes,
  requestAllowance:input.restRequests*input.unmeasuredRequestAllowanceBytes,
  extraBusiness:input.extraBusinessOperations*input.extraBusinessBytesPerOperation,
  bootstrapAndEnd:input.bootstrapAndEndReserveBytes
 };
 const perPerformanceBytes=2*(input.normalTlsBytes+Object.values(extras).reduce((a,b)=>a+b,0));
 const monthlyBytes=input.monthlyPerformances*perPerformanceBytes+input.otherMonthlyBytes;
 const retainedJsonComparisonBytes=2*input.retainedPerformances*(input.closingRootJsonBytes+input.retainedExtraGenerations*input.generationJsonBytes)+input.otherStoredBytes;
 assert([perPerformanceBytes,monthlyBytes,retainedJsonComparisonBytes].every(Number.isSafeInteger),'budget-overflow');
 return{extras,perPerformanceBytes,monthlyBytes,retainedJsonComparisonBytes,monthlyLimitComparisonBytes:10000000000,storageLimitComparisonBytes:1000000000,
  fitsIllustrativeDownloadBudget:monthlyBytes<=10000000000,fitsIllustrativeStorageBudget:retainedJsonComparisonBytes<=1000000000,
  reservationsVerified:false,providerBillingMeasured:false,operationalLimitsApproved:false,fullBusinessFreeTierVerified:false};
}
