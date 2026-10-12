import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const main=JSON.parse(read('artifacts/receipt-summary.json'));
const diagnostic=JSON.parse(read('artifacts/read-time-diagnostic.json'));
const budget=JSON.parse(read('artifacts/budget-estimate.json'));
let verified=0;
for(const r of[main,diagnostic,budget])for(const[p,h]of Object.entries(r.sourceHashes)){
  assert.equal(createHash('sha256').update(read(p)).digest('hex'),h,p);verified++;
}
assert.deepEqual(main.sourceHashes,main.endSourceHashes);
assert.equal(main.reports.length,21);assert(main.reports.every(x=>x.status==='passed'));
for(const n of[600,1000]){
  const r=main.reports.find(x=>x.people===n);assert.equal(r.normalReceiptWrites,n);
  assert.equal(r.independentHumans,6);assert.equal(r.independentDevices,6);
  assert(r.receivedByEach.every(x=>x===n));assert.equal(r.warmGeometry.requests,4);assert.equal(r.warmGeometry.documents,6);
  assert(r.overlapReads.every(x=>x===0));assert.equal(r.legacyPersonStatusRequests,0);
}
const marker='    match /{document=**} { allow read,write: if false; }';
assert.equal(read('node_modules/.cache/firestore.rules'),read('../GD91-73/node_modules/.cache/firestore.rules').replace(marker,()=>read('receipt.rules')+'\n'+marker));
assert(read('receipt-client.mjs').includes('{structuredQuery:query});'));
assert.equal(main.historicalReadSelectorUsed,false);assert.equal(main.historicalDirectApiSecurityVerified,false);
assert.equal(diagnostic.reports.find(x=>x.id==='revoked-current').httpStatus,403);
assert.equal(diagnostic.reports.find(x=>x.id==='revoked-historical').httpStatus,200);
assert.equal(diagnostic.productionReproduced,false);assert.equal(diagnostic.safeToAdoptHistoricalRead,false);
assert.deepEqual(budget.estimate.map(x=>x.withSafetyFactor2),[40992,50832]);
assert.equal(main.productionFreeTierVerified,false);assert.equal(main.normalRegistrationVerified,false);
assert.equal(main.tested3000,false);
console.log(JSON.stringify({currentReadScenarios:21,sourceHashesVerified:verified,existingRulesPreserved:true,
  historicalReadSecurityFindingOpen:true,productionFreeTierVerified:false}));
