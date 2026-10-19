import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scope} from './scope.mjs';
const root=new URL('./',import.meta.url);
execFileSync(process.execPath,[fileURLToPath(new URL('../GD91-155/audit.mjs',root))],{windowsHide:true,stdio:'pipe'});
let comparisons=0;
function record(file){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/'+file+'.json',root)));
 assert.deepEqual(r.sourceHashes,r.endSourceHashes);assert.equal(r.externalRequestsExecuted,0);
 for(const [path,expected] of Object.entries(r.sourceHashes)){
  const actual=createHash('sha256').update(fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
  assert.equal(actual,expected,path);comparisons++;
 }
 return r;
}
const transport=record('transport-check-summary'),meter=record('meter-check-summary'),preflight=record('preflight-check-summary');
assert.equal(transport.checks,12);assert.equal(meter.checks,9);assert.equal(preflight.checks,6);
for(const [file,expected] of Object.entries(transport.installedCliHashes)){
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../POC-004/node_modules/firebase-tools/lib/'+file,root))).digest('hex'),expected);comparisons++;
}
const stop=JSON.parse(fs.readFileSync(new URL('../GD91-155/artifacts/stop-audit-summary.json',root)));
assert.equal(stop.serviceApiRequestsIssued,0);assert.equal(stop.authUsersCreated,0);assert.equal(stop.serviceMutationAttempted,false);assert(stop.localTrialMetadataRestored);
assert.equal(stop.externalRequestsIssued,0);assert.equal(stop.externalTrialStarted,false);assert(stop.approvedExternalTrialRemaining);
const old=JSON.parse(fs.readFileSync(new URL('../GD91-155/artifacts/audit-summary.json',root)));
const calls=old.plannedCallsIncludingReservations+scope.maxOAuthCredentialRefreshCalls;
assert(calls<=scope.maxApplicationCallsIncludingCleanup);assert.equal(calls,599);
const result={sourceComparisons:comparisons,retainedPipelineSourceComparisons:old.sourceComparisons,retainedRepresentativeGroups:7,
 transportChecks:12,meterChecks:9,preflightChecks:6,installedCliFilesVerified:true,
 plannedCallsIncludingReservations:calls,plannedBodyBytesIncludingReservations:old.plannedBodyBytesIncludingReservations,
 normalOAuthRefreshLimit:3,cleanupOAuthRefreshReserve:3,cleanupReserveContainsRecoveryOAuth:true,
 approvalPending:true,externalRequestsExecuted:0,allFormatsMigrationVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
