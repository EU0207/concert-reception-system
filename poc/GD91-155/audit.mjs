import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generated} from './rules.mjs';
import {scope} from './scope.mjs';
const root=new URL('./',import.meta.url);
let comparisons=0;
function record(name,sourceRoot=root){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/'+name+'.json',root)));
 assert(!r.failure,name);assert(r.sourceHashes,name+':source-hashes-required');
 if(r.endSourceHashes)assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const [path,expected] of Object.entries(r.sourceHashes)){
  const actual=createHash('sha256').update(fs.readFileSync(new URL(path,sourceRoot),'utf8').replace(/\r\n/g,'\n')).digest('hex');
  assert.equal(actual,expected,name+':'+path);comparisons++;
 }
 return r;
}
const r=record('local-summary'),g=record('guard-summary');
assert.equal(r.reports.length,7);assert(r.reports.every((x,n)=>x.id.startsWith('E0'+(n+1))));
assert(r.normalImportAndPostPublicationWrites);assert(r.sourceFixtureOwnerSeeded);assert.equal(r.sourcePeople,4);assert.equal(r.imageSlots,5);
assert.equal(r.amendments,2);assert.equal(r.candidates,3);assert.equal(r.realBrowserRestart,false);assert.equal(r.encryptedIndexedDbVerified,false);assert.equal(r.allBusinessMigrationVerified,false);
for(const q of [r,g]){assert(q.cleanup.rulesClosed&&q.cleanup.rootsEmpty&&q.cleanup.authEmpty);assert.equal(q.cleanup.authUsersRemaining,0);assert.equal(q.externalFirebaseConnected,false);}
assert.equal(g.reports.length,1);const f=g.reports[0];assert.equal(f.legacyBeginStatus,401);assert.equal(f.legacyImageStatus,401);
for(const k of ['missingHeadAllowed','malformedHeadDenied','checkingAndVerifiedDenied','mixedBeginDeniedAtomically','currentBeginAccepted'])assert.equal(f[k],true);
const meter=record('meter-check-summary'),restore=record('restore-check-summary'),plan=record('preflight-check-summary');
assert.equal(meter.checks,9);assert.equal(restore.checks,10);assert.equal(plan.checks,5);assert.equal(plan.externalRequestsExecuted,0);
record('source-fixture-summary');record('source-capacity-4-summary',new URL('../GD91-127/',root));
const reservations=scope.externalSetupManagementCallReservation+scope.propagationRoundsAtMost*3+1+scope.manualLoginApiCallReservation+scope.cleanupCallReserve;
assert.equal(r.externalPlanning.plannedCallsIncludingReservations,r.beforeCleanup.requests+reservations);
assert(r.externalPlanning.within600Calls&&r.externalPlanning.within64MiB);assert.equal(r.beforeCleanup.requests,455);
const bytes=Buffer.byteLength(JSON.stringify(generated()));assert(bytes<10485760);
const result={sourceComparisons:comparisons,rulesBytes:bytes,observedEmulatorLimit:10485760,remainingRulesBytes:10485760-bytes,
 representativeGroups:7,guardComparisonGroups:1,meterChecks:meter.checks,restoreChecks:restore.checks,preflightChecks:plan.checks,
 observedRequests:r.observedLocal.requests,plannedCallsIncludingReservations:r.externalPlanning.plannedCallsIncludingReservations,
 plannedBodyBytesIncludingReservations:r.externalPlanning.plannedBodyBytesIncludingReservations,
 approvalPending:true,externalFirebaseConnected:false,allFormatsMigrationVerified:false,cleanup:r.cleanup};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
