import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const hash = f => createHash('sha256').update(fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const secret = /AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN|[\w.+-]+@[\w.-]+\.[a-z]+/i;
let sourceHashChecks = 0;
function verify(name, groups, cleanup = true) {
  const r = read('artifacts/' + name + '.json');
  assert(!r.failure, name);
  assert.equal(r.reports.length, groups, name);
  assert.deepEqual(r.sourceHashes, r.endSourceHashes);
  for (const [f, h] of Object.entries(r.sourceHashes)) {
    assert.equal(hash(f), h, f);
    sourceHashChecks++;
  }
  if (cleanup) assert.deepEqual(r.cleanup, {rulesClosed: true, trialRootEmpty: true});
  assert.equal(r.tested3000, false);
  assert(!secret.test(JSON.stringify(r)), name);
  return r;
}
for (const n of [4, 600, 1000]) {
  const r = verify('capacity-' + n + '-summary', 1), p = r.reports[0];
  assert.equal(r.executedRulesSource, '../GD91-100/database.rules.json');
  assert.equal(r.sourceHashes[r.executedRulesSource], hash(r.executedRulesSource));
  assert.equal(p.people, n);
  assert.equal(p.nonSeatCells, n);
  assert.equal(p.actualSdkEnvironments, 6);
  assert.equal(p.snapshotPassesPerEnvironment, 3);
  assert.equal(p.normalOperationRequests, 9 * n + 3);
  assert.equal(p.ownerPersonOrTicketWrites, 0);
  assert.deepEqual(p.reception.eventsPerEnvironment, Array(6).fill(n));
  assert.equal(p.reconnectEvents, 0);
  for (const k of ['externalFirebaseConnected', 'productionFreeTierVerified']) assert.equal(r[k], false);
  assert.equal(p.fullBusinessFreeTierVerified, false);
  assert.equal(p.realIndexedDbVerifiedHere, false);
}
const d = verify('contract-diagnostic-summary', 6);
assert(d.baselineDiagnosticOnly);
for (const k of ['fullSeatDomainVerified', 'externalFirebaseConnected', 'productionFreeTierVerified']) assert.equal(d[k], false);
assert.equal(d.reports[0].unsupportedPayloadGroups, 4);
assert(d.reports[3].afterFirstReceptionSwapWithoutReasonAccepted);
assert(d.reports[4].publishedWithoutAssignedSeat && d.reports[4].consumerRejectsInvalidProjection);
assert.equal(d.reports[5].partsAcceptedByProducer, 65);
assert.equal(d.reports[5].partsAllowedByConsumer, 64);
assert.equal(d.reports[5].readCallsBeforeReject, 2);
const b = verify('budget-estimate', 2, false);
assert.equal(b.fullBusinessFreeTierVerified, false);
assert.equal(b.observedWireBillingUsage, false);
assert.equal(b.unsupportedBusinessOperationsAssumedZero, false);
for (const r of b.reports) {
  assert.equal(r.illustrativeBytesPerPerformance, 2 * (r.measuredBodyBytes + r.freshTlsAllowanceBytes + r.notificationAllowanceBytes));
  assert.equal(r.moreThan1000FreeTierGuaranteed, false);
  assert.equal(r.quotaUpperBoundProven, false);
}
assert.equal(Buffer.byteLength(JSON.stringify(read('../GD91-100/database.rules.json'))), 893135);
console.log(JSON.stringify({sourceHashChecks, capacityScenarios: 3, baselineDiagnosticGroups: 6, budgetCases: 2, frozenRulesUnchanged: true, fullSeatDomainVerified: false, issue167Complete: false}));
