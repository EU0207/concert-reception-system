import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read = name => JSON.parse(fs.readFileSync(new URL('artifacts/' + name + '.json', import.meta.url)));
const measurement = read('read-summary'), unit = read('transport-summary');
let hashes = 0;
for (const evidence of [measurement, unit]) {
  assert.deepEqual(evidence.sourceHashes, evidence.endSourceHashes);
  for (const [p, h] of Object.entries(evidence.sourceHashes)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex'), h);
    hashes++;
  }
  assert(evidence.reports.every(r => r.status === 'passed'));
}
assert.equal(measurement.reports.length, 11); assert.equal(unit.reports.length, 10);
assert.deepEqual(measurement.reports.filter(r => r.people).map(r => r.people), [10, 500, 600, 1000]);
assert.equal(measurement.tested3000, false); assert.equal(measurement.productionFreeTierVerified, false);
assert.equal(measurement.registrationOver500StillBlockedByOldRules, true);
assert.equal(unit.rulesVerified, false);
assert.equal(measurement.costAssumptions.referenceBudgetWithoutCache.sectionDisplay.requestMaximum, 16);
assert.equal(measurement.costAssumptions.referenceBudgetWithoutCache.otherProjectionReads.requestMaximum, 18);
for (const n of [600, 1000]) {
  const r = measurement.reports.find(r => r.people === n);
  assert.equal(r.baseline.requests, 4 * n + 6);
  assert.equal(r.cold.requestedDocuments, r.baseline.requestedDocuments);
  assert.equal(r.warm.requestedDocuments, n + 4);
  assert.equal(r.normalRegistrationAndCommitVerified, false);
  assert.equal(r.modeledSixDeviceReads.warm, 6 * (r.warm.requestedDocuments + 5 * r.warm.requests + n));
}
console.log(JSON.stringify({emulatorScenarios: 11, mockTransportUnitScenarios: 10, sourceHashesVerified: hashes,
  tested3000: false, productionFreeTierVerified: false}));
