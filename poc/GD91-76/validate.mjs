import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from '../POC-001/node_modules/playwright/index.mjs';
import {fixture, pub, seedMany, getOwner} from '../GD91-75/fixtures.mjs';
import {readerClient} from '../GD91-75/read-client.mjs';
import {assemble} from '../GD91-75/projection.mjs';
import {cachedReader} from './cached-reader.mjs';
import {reader} from '../GD91-73/tests/support.mjs';

const sourcePaths = ['cache-store.mjs', 'cached-reader.mjs', 'browser.html', 'vite.config.mjs', 'validate.mjs',
  '../GD91-75/fixtures.mjs', '../GD91-75/read-client.mjs', '../GD91-75/projection.mjs',
  '../GD91-73/tests/support.mjs', '../GD91-72/tests/support.mjs', '../GD91-60/tests/transport.mjs',
  '../GD91-73/node_modules/.cache/firestore.rules'];
const hashes = () => Object.fromEntries(sourcePaths.map(p => [p, createHash('sha256')
  .update(fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const sourceHashes = hashes(), reports = [];
const profile = fileURLToPath(new URL('node_modules/.cache/browser-' + randomUUID(), import.meta.url));
let context, page, browserFirestoreRequests = 0;
async function launch() {
  context = await chromium.launchPersistentContext(profile, {channel: 'msedge', headless: true});
  context.on('request', r => { if (new URL(r.url()).port === '8181') browserFirestoreRequests++; });
  page = await context.newPage(); await page.goto('http://127.0.0.1:4180/poc/GD91-76/browser.html');
  await page.waitForFunction(() => window.cache);
}
const inspect = c => page.evaluate(c => window.cache.inspect(c), c);
const plain = c => page.evaluate(c => window.cache.load(c), c);
function storage({abort = false, trace = {loads: 0, saves: 0}} = {}) {
  return {
    load: async c => { trace.loads++; return page.evaluate(c => window.cache.load(c), c); },
    save: async (c, entries, options) => { trace.saves++; return page.evaluate(({c, entries, options}) => window.cache.save(c, entries, options),
      {c, entries, options: {...options, abortAfterPut: abort}}); },
  };
}
const options = f => ({performanceId: f.show, humanUid: f.reader.person.uid, deviceUid: f.reader.device.uid, token: f.reader.device.token});
const open = (f, store = storage(), changes = {}) => cachedReader(readerClient({...options(f), ...changes}), store);
const snapshot = c => ({requests: c.coreStats.requests, requestedDocuments: c.coreStats.requestedDocuments,
  cacheHits: c.stats.cacheHits, saves: c.stats.saves});
const add = (id, details = {}) => { reports.push({id, status: 'passed', ...details}); console.log(JSON.stringify(reports.at(-1))); };
try {
  await launch(); let small;
  for (const people of [600, 1000]) {
    const f = await fixture(people), c = open(f), result = await assemble(c), cold = snapshot(c), scope = c.context;
    assert.equal(result.counts.seats, people); assert.equal(result.counts.received, people / 2);
    const raw = await inspect(scope);
    assert.equal(raw.keyExtractable, false); assert.equal(raw.exportDenied, true); assert.equal(raw.metadataHasPlaintext, false);
    assert.deepEqual(raw.recordKeys, ['ciphertext', 'iv', 'version']); assert(raw.ciphertextBytes > 0);
    const restored = await plain(scope);
    assert(restored.entries.every(([k]) => !/receptionRecords|selfRoles|deviceStatus|token/i.test(k)));
    const peers = [f];
    for (let i = 1; i < 6; i++) peers.push({...f, reader: await reader(f)});
    const peerCold = [cold];
    for (const peer of peers.slice(1)) {
      const p = open(peer); assert.deepEqual(await assemble(p), result); peerCold.push(snapshot(p));
    }
    await context.close(); await launch();
    const clients = peers.map(peer => open(peer));
    const after = await Promise.all(clients.map(p => assemble(p))), peerWarm = clients.map(snapshot), warm = peerWarm[0];
    assert(after.every(p => JSON.stringify(p) === JSON.stringify(result)));
    assert(peerWarm.every(p => p.requestedDocuments === people + 6 && p.saves === 0));
    assert.equal(new Set(peers.map(p => p.reader.person.uid)).size, 6);
    assert.equal(new Set(peers.map(p => p.reader.device.uid)).size, 6);
    assert.equal((await inspect(scope)).version, raw.version);
    add('P-' + people, {people, cold, afterBrowserRestart: warm, encryptedBytes: raw.ciphertextBytes,
      nonExtractableKeyPersisted: true, localSaveFirestoreWrites: 0,
      seedMethod: 'owner-read-fixture-only', normalRegistrationAndCommitVerified: false,
      sixAuthenticatedClients: {distinctPeople: 6, distinctDevices: 6, cold: peerCold, afterRestart: peerWarm,
        parallelWarmAssembly: true, browserStorageProfiles: 1},
      modeledSixDeviceReadsAfterRestart: peerWarm.reduce((sum, p) => sum + p.requestedDocuments + 5 * p.requests + people, 0)});
    if (people === 600) small = {f, result, scope, raw};
  }
  const {f, scope} = small;
  assert.equal(await plain({...scope, humanUid: 'FAKE-other'}), null);
  assert.equal(await plain({...scope, performanceId: 'FAKE-other'}), null);
  assert.equal(await plain({...scope, deviceUid: 'FAKE-other'}), null);
  add('P-scope-isolation', {differentUserPerformanceAndDeviceNotLoaded: true});
  for (const field of ['humanUid', 'deviceUid']) {
    const trace = {loads: 0, saves: 0}, c = open(f, storage({trace}), {[field]: 'FAKE-impostor'});
    await assert.rejects(() => assemble(c), e => e.code === 'permission-denied');
    assert.equal(trace.loads, 0); add('P-impostor-' + field, {rulesDeniesBeforeLocalLoad: true});
  }
  const previous = await inspect(scope), c = open(f);
  await assert.rejects(() => assemble(c, {afterIndex: async () => {
    f.index.versions.commit++; await seedMany([[pub(f, 'publicIndex/current'), f.index]]);
  }}), e => e.code === 'stale-projection');
  assert.equal((await inspect(scope)).version, previous.version); assert.equal(c.cacheSize(), 0);
  add('P-stale-index', {previousEncryptedCachePreserved: true});
  f.index.versions.attendee++; f.index.versions.commit++;
  await seedMany([[pub(f, 'attendeeLabels/' + f.attendees[0]), {seatDisplayName: '架空訂正名'}], [pub(f, 'publicIndex/current'), f.index]]);
  await assert.rejects(() => assemble(open(f, storage({abort: true}))), /injected-cache-abort/);
  assert.equal((await inspect(scope)).version, previous.version);
  add('P-save-abort', {atomicRollbackKeepsPrevious: true, physicalDiskFullNotTested: true});
  const refreshed = await assemble(open(f)), current = await inspect(scope);
  assert.equal(refreshed.sections[0].cells[0].seatDisplayName, '架空訂正名'); assert.equal(current.version, previous.version + 1);
  assert.notDeepEqual(current.iv, previous.iv);
  add('P-label-revision', {newVersionFetchedAndEncrypted: true, newIv: true});
  await page.evaluate(async c => {
    await new Promise((resolve, reject) => {
      const r = indexedDB.open('concert-gd91-76-isolated-read-cache', 1);
      r.onsuccess = () => { const db = r.result, tx = db.transaction('cache', 'readwrite'), store = tx.objectStore('cache');
        const id = JSON.stringify(['FAKE-environment', c.performanceId, c.humanUid, c.deviceUid, 1]), get = store.get(id);
        get.onsuccess = () => { window.originalCacheRecord = get.result; const changed = structuredClone(get.result);
          new Uint8Array(changed.ciphertext)[0] ^= 1; store.put(changed, id); };
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
    });
  }, scope);
  await assert.rejects(() => plain(scope)); add('P-ciphertext-tamper', {aesGcmRejectsAlteration: true});
  await page.evaluate(async c => {
    await new Promise((resolve, reject) => { const r = indexedDB.open('concert-gd91-76-isolated-read-cache', 1);
      r.onsuccess = () => { const db = r.result, tx = db.transaction('cache', 'readwrite');
        tx.objectStore('cache').put(window.originalCacheRecord, JSON.stringify(['FAKE-environment', c.performanceId, c.humanUid, c.deviceUid, 1]));
        tx.oncomplete = () => { db.close(); delete window.originalCacheRecord; resolve(); }; tx.onabort = () => reject(tx.error); };
    });
  }, scope);
  const beforeCas = await inspect(scope), entries = (await plain(scope)).entries;
  await assert.rejects(() => page.evaluate(({scope, entries}) => window.cache.save(scope, entries, {expectedVersion: 0}), {scope, entries}), /stale-cache-version/);
  assert.deepEqual(await inspect(scope), beforeCas);
  add('P-stale-local-save', {staleWriterCannotOverwrite: true});
  const raceScope = {...scope, performanceId: 'FAKE-cache-race-' + randomUUID()};
  const raced = await Promise.allSettled([1, 2].map(value => page.evaluate(({raceScope, value}) =>
    window.cache.save(raceScope, [['FAKE-entry', {value}]], {expectedVersion: 0}), {raceScope, value})));
  assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(raced.filter(r => r.status === 'rejected').length, 1);
  assert.equal((await plain(raceScope)).version, 1); assert.deepEqual(await inspect(scope), beforeCas);
  add('P-local-save-race', {oneWriterOnly: true, independentCacheUnchanged: true});
  const trace = {loads: 0, saves: 0};
  await assert.rejects(() => assemble(open(f, storage({trace}), {transport: async () => { throw new TypeError('FAKE-offline'); }})), /FAKE-offline/);
  assert.equal(trace.loads, 0); assert.equal((await inspect(scope)).version, current.version);
  add('P-online-authority-unavailable', {noLocalReleaseOrAutomaticRetry: true, encryptedCachePreserved: true});
  const control = await getOwner(pub(f, 'control/current')), closedTrace = {loads: 0, saves: 0};
  await seedMany([[pub(f, 'control/current'), {...control, state: 'closed'}]]);
  await assert.rejects(() => assemble(open(f, storage({trace: closedTrace}))), e => e.code === 'permission-denied');
  assert.equal(closedTrace.loads, 0); assert.deepEqual(await inspect(scope), current);
  await seedMany([[pub(f, 'control/current'), control]]);
  add('P-closed-performance', {generalReaderLockedBeforeDecryption: true, encryptedCachePreserved: true});
  const role = await getOwner(pub(f, 'roles/' + f.reader.person.uid));
  const revokedTrace = {loads: 0, saves: 0}, revoked = open(f, storage({trace: revokedTrace}));
  await assemble(revoked); assert(revoked.cacheSize() > 0); const loadsBeforeRevocation = revokedTrace.loads;
  await seedMany([[pub(f, 'roles/' + f.reader.person.uid), {...role, active: false}]]);
  await assert.rejects(() => assemble(revoked), e => e.code === 'permission-denied');
  assert.equal(revokedTrace.loads, loadsBeforeRevocation); assert.equal(revoked.cacheSize(), 0);
  assert.deepEqual(await inspect(scope), current);
  add('P-revoked', {lockedBeforeDecryption: true, keyAndEncryptedCachePreserved: true});
  await seedMany([[pub(f, 'roles/' + f.reader.person.uid), role]]);
  assert.deepEqual(await assemble(open(f)), refreshed);
  add('P-reactivated', {originalKeyAndCacheReusableAfterServerAuthorization: true});
  assert.equal(browserFirestoreRequests, 0); assert.deepEqual(hashes(), sourceHashes);
  fs.mkdirSync(new URL('artifacts/', import.meta.url), {recursive: true});
  fs.writeFileSync(new URL('artifacts/cache-summary.json', import.meta.url), JSON.stringify({scope: 'browser-storage-and-node-rest-read-integration',
    browser: 'installed Microsoft Edge, headless, isolated persistent profile', sourceHashes, endSourceHashes: hashes(), reports,
    browserFirestoreRequests, tested3000: false, productionFreeTierVerified: false, offlineApplicationStartupVerified: false,
    authorityChecks: 'Rules selfRoles/humanUid and deviceStatus/deviceUid before decrypt; publicIndex before and after reuse'}, null, 2) + '\n');
} catch (error) {
  fs.mkdirSync(new URL('artifacts/', import.meta.url), {recursive: true});
  fs.writeFileSync(new URL('artifacts/failed-' + Date.now() + '.json', import.meta.url), JSON.stringify({sourceHashes,
    reports, error: {code: error.code ?? null, message: String(error.message).slice(0, 300)}}, null, 2) + '\n');
  throw error;
} finally { await context?.close(); }
