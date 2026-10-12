import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const summary=JSON.parse(read('artifacts/watch-summary.json')),boundary=JSON.parse(read('artifacts/boundary-summary.json'));
const lifecycle=JSON.parse(read('artifacts/lifecycle-summary.json'));
const budget=JSON.parse(read('artifacts/budget-estimate.json'));let verified=0;
for(const r of[summary,boundary,budget,lifecycle]){
  for(const[p,hash]of Object.entries(r.sourceHashes)){assert.equal(createHash('sha256').update(read(p)).digest('hex'),hash,p);verified++;}
  if(r.endSourceHashes)assert.deepEqual(r.sourceHashes,r.endSourceHashes);
  assert.equal(r.tested3000,false);
}
assert.equal(summary.reports.length,3);assert.equal(summary.reports.filter(r=>r.status==='passed').length,2);
assert.equal(summary.suitePassed,false);assert.equal(summary.unexecutedLifecycleCases.length,7);
assert.equal(boundary.reports.length,5);assert(boundary.reports.every(r=>r.status==='passed'));
assert.equal(lifecycle.reports.length,3);assert.equal(lifecycle.reports.filter(r=>r.status==='passed').length,2);
assert.equal(lifecycle.reports.find(r=>r.id==='S-dependent-role-revocation').status,'failed');
assert.equal(lifecycle.suitePassed,false);assert.equal(lifecycle.unexecutedCases.length,4);assert.equal(lifecycle.fixturePeople,10);
for(const n of[600,1000]){
  const r=summary.reports.find(r=>r.people===n);
  if(n===600){assert.equal(r.status,'passed');assert.equal(r.receiptWrites,n);assert.equal(r.independentHumans,6);assert.equal(r.independentDevices,6);
    assert.deepEqual(r.receivedByEach,[n,n,n,n,n,n]);assert.equal(r.idleApplicationQueries,0);
    assert(r.stats.every(s=>s.starts===1&&s.stops===0&&s.maximumSnapshotSize===n));}
  else{assert.equal(r.status,'failed');assert(r.receivedByEach.some(x=>x!==n));assert.equal(r.rootCauseConfirmed,false);}
}
assert.equal(summary.durableJournalVerified,false);assert.equal(summary.productionFreeTierVerified,false);
assert.equal(summary.sharingLatencyRequirementVerified,false);assert.equal(summary.sdkAuthRefreshVerified,false);
assert.equal(summary.historicalDirectApiSecurityVerified,false);
const marker='allow list: if deltaRead(p) && limited();';
assert.equal(read('node_modules/.cache/firestore.rules'),read('../GD91-77/node_modules/.cache/firestore.rules')
  .replace(marker,'allow list: if deltaRead(p) && request.query.limit > 0 && request.query.limit <= 2048;'));
assert.deepEqual(budget.estimate.map(r=>r.oneResultUpdatePerEvent),[43572,72372]);
assert.deepEqual(budget.estimate.map(r=>r.oneResultUpdateWithOneFullReconnect),[50820,84420]);
assert.equal(budget.assumptions.callbackCountIsBillingMeasurement,false);
console.log(JSON.stringify({sdkPassed:2,sdkFailed:1,boundaryScenarios:5,lifecyclePassed:2,lifecycleFailed:1,sourceHashesVerified:verified,
  productionFreeTierVerified:false,historicalDirectApiSecurityVerified:false}));
