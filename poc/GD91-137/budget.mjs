import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
const baseline=read('../GD91-134/artifacts/budget-summary.json'),images=read('../GD91-123/artifacts/local-summary.json');
const imageBankBytes=images.reports.find(x=>x.id.startsWith('I02')).stageWriteJsonBytes;
const constants={rtdbStoredLimit:1e9,rtdbMonthlyDownloadLimit:1e10,firestoreStoredLimit:2**30,firestoreMonthlyTransferLimit:10*2**30,
 firestoreDailyReads:50000,firestoreDailyWrites:20000,firestoreDailyDeletes:20000,hostingDailyTransferLimit:360000000,
 safetyFactor:2,chunkPayloadBytes:65536,documentAndIndexReserveBytes:1024,ruleDependenciesPerOperation:4,requestAllowanceBytes:8192,
 historicalEventReserveBytes:512,archiveReadbackCopies:2,viewers:6,viewCopies:2,hostingBundleReserveBytes:5*2**20,hostingClients:8,hostingCacheMissesPerDay:4};
const reports=[];
for(const people of [600,1000])for(const monthlyPerformances of [1,4])for(const pastPerformances of [0,1,12,60,120,600])for(const eventsPerPerson of [5,50,500])for(const readStrategy of ['single-record','page32'])for(const viewDays of [1,30]){
 const b=baseline.reports.find(x=>x.people===people&&x.id===(monthlyPerformances===1?'one-performance':'four-performances'));
 assert(b);const i=b.input,c=constants;
 // 既存の保護中世代・画像を両案に同じ量だけ残す。過去分を消して容量を合わせない。
 const historyReserve=people*eventsPerPerson*c.historicalEventReserveBytes;
 const archivePayloadBytes=i.closingRootJsonBytes+i.retainedExtraGenerations*i.generationJsonBytes+10*imageBankBytes+historyReserve;
 const archiveDocuments=people+people*eventsPerPerson+Math.ceil(archivePayloadBytes/c.chunkPayloadBytes)+100;
 const archiveStorageWithOverhead=archivePayloadBytes+archiveDocuments*c.documentAndIndexReserveBytes;
 const activeRtdbStored=b.retainedJsonComparisonBytes;
 const viewedPastPerformances=Math.min(pastPerformances,12),visits=viewedPastPerformances*c.viewers*c.viewCopies;
 const pastReadPayload=visits*archivePayloadBytes;
 const archiveSourceExport=monthlyPerformances*(2*archivePayloadBytes+Math.ceil(archivePayloadBytes/c.chunkPayloadBytes)*c.requestAllowanceBytes);
 const readSets=visits+c.archiveReadbackCopies*monthlyPerformances;
 const readRequests=readSets*(readStrategy==='single-record'?archiveDocuments:Math.ceil(archiveDocuments/32));
 // 依存文書は同じ要求内で1回だけ課金。単件と32件ページを比較し、本文書の読取りは減らさない。
 const firestoreReads=readSets*archiveDocuments+c.ruleDependenciesPerOperation*readRequests;
 const readsPerSet=archiveDocuments+c.ruleDependenciesPerOperation*(readStrategy==='single-record'?archiveDocuments:Math.ceil(archiveDocuments/32));
 const dailyReads=Math.ceil(visits*readsPerSet/viewDays)+c.archiveReadbackCopies*monthlyPerformances*readsPerSet;
 const firestoreWrites=2*monthlyPerformances*(archiveDocuments+2); // 本文と進捗。再開では保存済み本文を再送しない。
 const dailyDeleteReserve=archiveDocuments; // 利用者が明示した1公演削除の集中日。実際に削除する指定ではない。
 const unified={rtdbStored:activeRtdbStored+c.safetyFactor*pastPerformances*archivePayloadBytes,
  rtdbMonthlyDownload:b.monthlyBytes+c.safetyFactor*pastReadPayload,firestoreStored:0,firestoreMonthlyTransfer:0,firestoreDailyReads:0,firestoreDailyWrites:0,firestoreDailyDeletes:0};
 const divided={rtdbStored:activeRtdbStored,peakRtdbDuringCopy:activeRtdbStored+c.safetyFactor*archivePayloadBytes,
  rtdbMonthlyDownload:b.monthlyBytes+c.safetyFactor*archiveSourceExport,
  firestoreStored:i.otherStoredBytes+c.safetyFactor*pastPerformances*archiveStorageWithOverhead,
  peakFirestoreDuringCopy:i.otherStoredBytes+c.safetyFactor*(pastPerformances+1)*archiveStorageWithOverhead,
  firestoreMonthlyTransfer:1e9+c.safetyFactor*(readSets*archivePayloadBytes+(readRequests+monthlyPerformances*archiveDocuments)*c.requestAllowanceBytes),
  firestoreMonthlyReads:firestoreReads,firestoreDailyReads:dailyReads,firestoreDailyWrites:firestoreWrites,firestoreDailyDeletes:dailyDeleteReserve};
 const fits=x=>({rtdbStorage:x.rtdbStored<=c.rtdbStoredLimit,rtdbTransfer:x.rtdbMonthlyDownload<=c.rtdbMonthlyDownloadLimit,
  firestoreStorage:Math.max(x.firestoreStored,x.peakFirestoreDuringCopy??0)<=c.firestoreStoredLimit,firestoreTransfer:x.firestoreMonthlyTransfer<=c.firestoreMonthlyTransferLimit,
  firestoreReads:x.firestoreDailyReads<=c.firestoreDailyReads,firestoreWrites:x.firestoreDailyWrites<=c.firestoreDailyWrites,firestoreDeletes:x.firestoreDailyDeletes<=c.firestoreDailyDeletes});
 const oneFits=fits(unified),splitFits=fits(divided);
 const firestoreCentered={sameArchiveVolumeReservation:true,
  prospectiveFirestoreStored:i.otherStoredBytes+c.safetyFactor*(pastPerformances+1)*archiveStorageWithOverhead,
  historicalFirestoreTransfer:divided.firestoreMonthlyTransfer,
  activeBusinessReads:null,activeBusinessWrites:null,activeBusinessTransfer:null,activeBusinessStoredBytes:null,
  current16Section4096Cell600And1000PersonScenarioMeasured:false,allFit:null,
  oldTwoSectionArithmeticReference:{sameDayWrites:25.5*people+49,fullDownloadGetsPerClient:4*people+6,notCurrentProfileOrFreeTierProof:true},
  presenceIsNotAuthorizationTruth:true};
 reports.push({people,monthlyPerformances,pastPerformances,eventsPerPerson,readStrategy,viewDays,readRequests,viewedPastPerformances,archivePayloadBytes,archiveDocuments,firestoreCentered,unified:{...unified,fits:oneFits},divided:{...divided,fits:splitFits},
  unifiedAllFit:Object.values(oneFits).every(Boolean),dividedAllFit:Object.values(splitFits).every(Boolean)});
}
assert.equal(reports.length,288);
for(const people of [600,1000]){
 // 閲覧頻度・履歴件数は未測定。小さい条件が無料枠内になると先に仮定しない。
 assert.equal(reports.filter(x=>x.people===people&&x.readStrategy==='page32'&&x.viewDays===30).length,36);
 assert(reports.filter(x=>x.people===people&&x.pastPerformances===600).every(x=>!x.unifiedAllFit&&!x.dividedAllFit));
 assert(reports.filter(x=>x.people===people&&x.eventsPerPerson===500).every(x=>!x.divided.fits.firestoreWrites));
}
const hostingDailyReserveBytes=constants.safetyFactor*constants.hostingBundleReserveBytes*constants.hostingClients*constants.hostingCacheMissesPerDay;
const hashes=sourceHashes(root,['budget.mjs','../GD91-134/artifacts/budget-summary.json','../GD91-123/artifacts/local-summary.json','../GD91-74/artifacts/capacity-estimate.json']);
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});fs.writeFileSync(new URL('artifacts/budget-summary.json',root),JSON.stringify({sourceHashes:hashes,endSourceHashes:hashes,constants,reports,
 hosting:{sameForAllThreeCandidates:true,dailyReserveBytes:hostingDailyReserveBytes,fits:hostingDailyReserveBytes<=constants.hostingDailyTransferLimit,measuredBundle:false},
 retainedUntilExplicitDeletion:true,archiveDocumentsAndIndexesAreReservations:true,writeBurstAssumesAllMonthlyOperationsOnOneDay:true,viewDistributionIsUnverifiedScenario:true,successfulSourceRemovalIsUnverifiedPrecondition:true,
 sourceRootUsedAsSizeReservationOnly:true,authAndTerminalSecretsMustNotBeArchived:true,providerBillingMeasured:false,operationalLimitsApproved:false,externalFirebaseConnected:false},null,2)+'\n');
console.log(JSON.stringify({comparisons:reports.length,hostingDailyReserveBytes,samples:reports.filter(x=>x.monthlyPerformances===1&&[1,12,60].includes(x.pastPerformances)&&x.eventsPerPerson===5&&x.readStrategy==='page32'&&x.viewDays===30).map(x=>({people:x.people,past:x.pastPerformances,unifiedStored:x.unified.rtdbStored,dividedStored:x.divided.firestoreStored,dividedReads:x.divided.firestoreDailyReads,dividedTransfer:x.divided.firestoreMonthlyTransfer,dividedAllFit:x.dividedAllFit,firestoreCenteredAllFit:x.firestoreCentered.allFit}))}));
