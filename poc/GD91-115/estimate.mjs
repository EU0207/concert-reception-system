import assert from 'node:assert/strict';

// 入力した利用量の比較用。通信の上乗せは検証用仮定であり、公式上限ではない。
export function estimate({baseResponseBytes,restRequests,sdkGets,sdkEvents,extraResponseBytes=0,extraRequests=0,sdkReplayBodyBytes=0,sdkReplayMessages=0,extraRetrievalCopies=0,monthlyPerformances=1,otherMonthlyBytes=0,overheadBytesPerMessage=8192,safetyFactor=2}){
 for(const value of Object.values(arguments[0]))assert(Number.isSafeInteger(value)&&value>=0,'invalid-budget-input');
 assert(monthlyPerformances>=1&&safetyFactor>=1);
 const messages=restRequests+sdkGets+sdkEvents+extraRequests+extraRetrievalCopies*sdkReplayMessages;
 const perPerformance=safetyFactor*(baseResponseBytes+extraResponseBytes+extraRetrievalCopies*sdkReplayBodyBytes+messages*overheadBytesPerMessage);
 const monthly=monthlyPerformances*perPerformance+otherMonthlyBytes;
 assert(Number.isSafeInteger(monthly),'budget-overflow');
 return{perPerformanceBytes:perPerformance,monthlyBytes:monthly,monthlyLimitBytes:10000000000,remainingBytes:10000000000-monthly,withinIllustrativeLimit:monthly<=10000000000,
  wireOverheadAssumptionVerified:false,fullBusinessFreeTierVerified:false};
}
