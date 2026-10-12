// 記録の整合性検査。未達の診断を機能合格へ変換しない。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const hash=p=>createHash('sha256').update(read(p)).digest('hex');let verified=0;
function result(name,sourceSnapshot){
  const r=JSON.parse(read('artifacts/'+name+'.json'));
  for(const [p,h] of Object.entries(r.sourceHashes)){
    assert.equal(hash(p==='diagnose.mjs'&&sourceSnapshot?sourceSnapshot:p),h,name+':'+p);verified++;
  }
  assert.deepEqual(r.sourceHashes,r.endSourceHashes);assert.equal(r.tested3000,false);assert(!r.error);return r;
}
const preliminary=result('preliminary-1000-mixed','artifacts/preliminary-diagnose.mjs');
const separate=result('1000-separate','artifacts/intermediate-diagnose.mjs');
const mixed=result('1000-mixed');
assert.equal(preliminary.writes,1000);assert.equal(preliminary.convergedBeforeExplicitRead,false);
for(const r of[separate,mixed]){assert.equal(r.writes,1000);assert.equal(r.restCurrentReadSize,1000);assert.equal(r.restExactEventIds,true);assert.equal(r.convergedBeforeExplicitRead,false);}
assert.equal(mixed.orderedRestExactEventIds,true);assert.equal(mixed.freshSdkReadSize,1000);assert.equal(mixed.freshSdkReadHasPendingWrites,false);
const browsers=[result('browser-600-default'),result('browser-1000-default'),result('browser-1000-longpoll')];
for(const r of browsers){assert.equal(r.converged,true);assert.equal(r.independentIdentities,6);assert.equal(r.browserContexts,6);
  assert(r.states.every(s=>s.confirmed===r.people&&!s.error&&!s.pending));assert.equal(r.realDevices,false);assert.equal(r.sharingLatencyVerified,false);assert.equal(r.productionFreeTierVerified,false);}
const nodes=[result('node-rest-default'),result('node-rest-longpoll')];
for(const r of nodes){assert.equal(r.sender,'REST');assert.equal(r.receiptWrites,1000);assert.equal(r.converged,false);assert(r.states.every(s=>!s.pending&&!s.error));}
const authorization=result('authorization');assert.equal(authorization.reports.length,4);
for(const r of authorization.reports){assert.equal(r.stoppedWithoutEvent,false);assert.equal(r.currentReadStatus,403);assert.equal(r.historicalReadStatus,200);
  assert.equal(r.historicalDocuments,1);assert.equal(r.afterNewEvent.failure.code,'permission-denied');assert.equal(r.afterNewEvent.records,1);assert.equal(r.freshListenError,'permission-denied');}
const regression=result('regression');assert.equal(regression.reports.length,3);assert(regression.reports.every(r=>r.status==='passed'));
const minimal=result('minimal-authorization');assert.equal(minimal.permissionDependencies,1);assert.equal(minimal.applicationSeatRulesUsed,false);
assert.equal(minimal.stoppedWithoutItemChange,false);assert.equal(minimal.currentStatus,403);assert.equal(minimal.historicalStatus,200);assert.equal(minimal.historicalDocuments,1);
assert.equal(minimal.afterItemChange.size,1);assert.equal(minimal.afterItemChange.error,'permission-denied');assert.equal(minimal.freshError,'permission-denied');
assert.equal(minimal.productionReproduced,false);assert.equal(minimal.serverAuthorizationVerified,false);
const summary={browserConvergenceCases:3,nodeRestUnresolvedCases:2,authorizationScopes:4,minimalAuthorizationReproduced:true,
  ramRegressionCases:3,sourceHashesVerified:verified,sourceSnapshotsUsedForHistoricalRuns:2,
  productionRootCauseConfirmed:false,serverAuthorizationVerified:false,productionFreeTierVerified:false,realDevicesVerified:false,
  issue167Complete:false,tested3000:false};
console.log(JSON.stringify(summary));
