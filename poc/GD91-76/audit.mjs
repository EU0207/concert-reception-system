import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const r = JSON.parse(fs.readFileSync(new URL('artifacts/cache-summary.json', import.meta.url)));
const storage = JSON.parse(fs.readFileSync(new URL('artifacts/storage-summary.json', import.meta.url)));
assert.deepEqual(r.sourceHashes, r.endSourceHashes);
for (const [p, h] of Object.entries(r.sourceHashes)) assert.equal(createHash('sha256')
  .update(fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex'), h);
assert.equal(r.reports.length, 15); assert(r.reports.every(x => x.status === 'passed'));
assert.equal(r.productionFreeTierVerified, false); assert.equal(r.tested3000, false);
assert.equal(r.browserFirestoreRequests, 0);
assert.equal(r.offlineApplicationStartupVerified, false);
assert.deepEqual(storage.sourceHashes, storage.endSourceHashes);
for (const [p, h] of Object.entries(storage.sourceHashes)) assert.equal(createHash('sha256')
  .update(fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex'), h);
assert.equal(storage.reports.length, 4); assert(storage.reports.every(x => x.status === 'passed'));
assert.equal(storage.firestoreRequests, 0); assert.equal(storage.serverRulesVerified, false);
for (const n of [600, 1000]) {
  const p = r.reports.find(x => x.people === n), clients = p.sixAuthenticatedClients;
  assert.equal(p.normalRegistrationAndCommitVerified, false);
  assert.equal(clients.cold.length, 6); assert.equal(clients.afterRestart.length, 6);
  assert.equal(clients.distinctPeople, 6); assert.equal(clients.distinctDevices, 6);
  assert.equal(clients.browserStorageProfiles, 1);
  assert(clients.afterRestart.every(x => x.requestedDocuments === n + 6 && x.saves === 0));
  assert.equal(p.modeledSixDeviceReadsAfterRestart, n === 600 ? 13356 : 22176);
}
console.log(JSON.stringify({integrationScenarios: r.reports.length, storageOnlyScenarios: storage.reports.length,
  sourceHashesVerified: Object.keys(r.sourceHashes).length + Object.keys(storage.sourceHashes).length,
  authenticatedClientsPerScale: 6, storageProfiles: 1, physicalDevicesVerified: false, productionFreeTierVerified: false}));
