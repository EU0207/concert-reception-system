import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assemble as legacy} from '../GD91-73/projection.mjs';
import {assemble} from './projection.mjs';
import {readerClient} from './read-client.mjs';
import {fixture, pub, seedMany, getOwner} from './fixtures.mjs';
const sourcePaths = ['read-client.mjs', 'projection.mjs', 'fixtures.mjs', 'validate.mjs',
  '../GD91-73/projection.mjs', '../GD91-73/tests/support.mjs', '../GD91-72/tests/support.mjs',
  '../GD91-60/tests/transport.mjs', '../GD91-73/node_modules/.cache/firestore.rules'];
const hashes = () => Object.fromEntries(sourcePaths.map(p => [p, createHash('sha256').update(fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const sourceHashes = hashes(), reports = [];
const client = (f, groupSize = 3) => readerClient({performanceId: f.show, humanUid: f.reader.person.uid,
  deviceUid: f.reader.device.uid, token: f.reader.device.token, groupSize});
const add = (id, detail = {}) => { reports.push({id, status: 'passed', ...detail}); console.log(JSON.stringify(reports.at(-1))); };
const snapshot = c => ({requests: c.stats.requests, requestedDocuments: c.stats.requestedDocuments,
  cacheHits: c.stats.cacheHits, maximumBatch: Math.max(0, ...c.stats.batchSizes)});
try {
  let small;
  for (const people of [10, 500, 600, 1000]) {
    const f = await fixture(people); if (people === 10) small = f;
    const serial = client(f, 1);
    const expected = await serial.session(async many => legacy(async (kind, path, options) =>
      (await many([{kind, path, ...options}]))[0]));
    const grouped = client(f), result = await assemble(grouped), cold = snapshot(grouped);
    assert.deepEqual(result, expected); assert.equal(result.counts.seats, people);
    assert.equal(result.counts.received, people / 2); assert.equal(cold.requestedDocuments, serial.stats.requestedDocuments);
    assert(cold.requests < serial.stats.requests); assert(cold.maximumBatch <= 3);
    const warmBefore = snapshot(grouped), warmResult = await assemble(grouped), after = snapshot(grouped);
    assert.deepEqual(warmResult, result);
    const warm = {requests: after.requests - warmBefore.requests,
      requestedDocuments: after.requestedDocuments - warmBefore.requestedDocuments,
      cacheHits: after.cacheHits - warmBefore.cacheHits};
    assert.equal(warm.requestedDocuments, people + 4); assert(warm.cacheHits >= people * 3);
    const conservativeReadModel = stats => stats.requestedDocuments + 5 * stats.requests + people;
    add('R-' + people, {people, seedMethod: 'owner-read-fixture-only', normalRegistrationAndCommitVerified: false,
      fixtureDocuments: f.seededDocuments, baseline: snapshot(serial), cold, warm,
      modeledSixDeviceReads: {cold: 6 * conservativeReadModel(cold), warm: 6 * conservativeReadModel(warm)},
      costModelNotBillingMeasurement: true});
  }
  const f = small, c = client(f);
  await assemble(c); const before = c.stats.requestedDocuments;
  await seedMany([[pub(f, 'receptionRecords/' + f.attendees[1]), {status: 'received'}]]);
  assert.equal((await assemble(c)).counts.received, 6);
  assert.equal(c.stats.requestedDocuments - before, 14);
  add('D-arrival-refresh', {cachedGeometryDoesNotHideNewArrival: true});
  f.index.versions.attendee++; f.index.versions.commit++;
  await seedMany([[pub(f, 'attendeeLabels/' + f.attendees[0]), {seatDisplayName: '架空の訂正名'}],
    [pub(f, 'publicIndex/current'), f.index]]);
  const renamed = await assemble(c); assert.equal(renamed.sections[0].cells[0].seatDisplayName, '架空の訂正名');
  add('D-label-revision', {mutableNameNotReusedAcrossVersions: true});
  const raced = client(f);
  await assert.rejects(() => assemble(raced, {afterIndex: async () => {
    f.index.versions.commit++; await seedMany([[pub(f, 'publicIndex/current'), f.index]]);
  }}), e => e.code === 'stale-projection');
  assert.equal(raced.cacheSize(), 0); add('D-stale-index', {unconfirmedCacheDiscarded: true});
  const denied = client(f);
  await assert.rejects(() => denied.session(many => many([
    {kind: 'publication', path: 'attendeeLabels/' + f.attendees[0]},
    {kind: 'publication', path: 'roles/' + f.reader.person.uid},
  ])), e => e.code === 'permission-denied' || e.code === 'batch-item-error');
  assert.equal(denied.cacheSize(), 0); add('D-private-in-batch', {mixedPrivateDocumentRejected: true});
  const isolated = client(f); assert.equal(isolated.cacheSize(), 0); add('D-reader-cache-isolation');
  const wrong = client(f);
  await assert.rejects(() => wrong.session(many => many([
    {kind: 'source', path: f.sections[0] + '/generations/00000000-0000-4000-8000-000000000000/chunks/0-0'},
  ])), e => e.code === 'permission-denied' || e.code === 'batch-item-error');
  add('D-unpublished-generation');
  const role = await getOwner(pub(f, 'roles/' + f.reader.person.uid));
  await seedMany([[pub(f, 'roles/' + f.reader.person.uid), {...role, active: false, revision: role.revision + 1}]]);
  await assert.rejects(() => assemble(c), e => e.code === 'permission-denied' || e.code === 'batch-item-error');
  assert.equal(c.cacheSize(), 0); add('D-revoked-with-cache', {serverAuthorizationBeforeReuse: true});
  assert.deepEqual(hashes(), sourceHashes);
  fs.mkdirSync(new URL('artifacts/', import.meta.url), {recursive: true});
  fs.writeFileSync(new URL('artifacts/read-summary.json', import.meta.url), JSON.stringify({scope: 'read-path-only',
    sourceHashes, endSourceHashes: hashes(), reports, productionFreeTierVerified: false,
    costAssumptions: {dependentDocumentsPerBatchMaximum: 5, extraReceptionExistsPerPerson: 1,
      separateHttpRequestsDoNotShareRuleReads: true, sameBatchDependencyChargedOnce: true,
      referenceBudgetWithoutCache: {scope: 'operating-receptionist-read-path-only',
        sectionDisplay: {perDocumentMaximum: 8, documentsPerRequest: 2, requestMaximum: 16},
        otherProjectionReads: {perDocumentMaximum: 6, documentsPerRequest: 3, requestMaximum: 18}}},
    registrationOver500StillBlockedByOldRules: true, tested3000: false}, null, 2) + '\n');
} catch (error) {
  fs.mkdirSync(new URL('artifacts/', import.meta.url), {recursive: true});
  fs.writeFileSync(new URL('artifacts/failed-' + Date.now() + '.json', import.meta.url), JSON.stringify({sourceHashes,
    reports, error: {code: error.code ?? null, message: String(error.message).slice(0, 300)}}, null, 2) + '\n');
  throw error;
}
