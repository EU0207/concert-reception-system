import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actor, session} from '../GD91-84/transport.mjs';
import {generated, namespace} from '../GD91-155/rules.mjs';
import {meter} from '../GD91-155/meter.mjs';
import {importer} from '../GD91-155/importer.mjs';
import {hash} from '../GD91-128/conversion.mjs';
import {exportBundle as prior} from '../GD91-148/bundle.mjs';
import {exportBundle, unflatten} from './bundle.mjs';
import {replay} from '../GD91-149/replay.mjs';
import {correctionRequest} from '../GD91-100/model.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';

const root = new URL('./', import.meta.url);
const files = ['local.mjs', 'bundle.mjs', 'run-local.mjs'];
const before = sourceHashes(root, files);
const fixture = JSON.parse(fs.readFileSync(new URL('../GD91-155/node_modules/.cache/source-fixture.json', root)));
const fixtureSummary = JSON.parse(fs.readFileSync(new URL('../GD91-155/artifacts/source-fixture-summary.json', root)));
assert.equal(hash(fixture), fixtureSummary.fixtureHash);
assert(fixtureSummary.createdByNormalEmulatorOperations);
const performanceId = fixtureSummary.performanceId, runId = randomUUID();
const environments = Array.from({length: 4}, (_, i) => 'gd157-' + runId + '-' + i);
const roots = environments.map(environment => 'environments/' + environment + '/performances/' + performanceId);
const originalFetch = globalThis.fetch;
// ローカル専用。600回・64MiBの外部試行予算を拡張するものではない。
const b = meter({fetcher: originalFetch, maxCalls: 3000, normalCallLimit: 2950,
  maxBodyBytes: 256 * 1024 * 1024, allow: u => u.protocol === 'http:' && u.hostname === '127.0.0.1' && ['9000', '9191'].includes(u.port)});
globalThis.fetch = b.fetch;
const denyRules = {rules: {'.read': false, '.write': false}}, users = [], hops = [], rejectedInputs = [];
let failure, cleanup, rulesBytes;
async function raw(path, token, method = 'GET', body) {
  assert(path === '.settings/rules' || path === '' || roots.some(p => path === p || path.startsWith(p + '/')));
  const url = new URL('http://127.0.0.1:9000/' + path + '.json');
  url.searchParams.set('ns', namespace);
  if (token !== 'owner') url.searchParams.set('auth', token);
  if (method !== 'GET') url.searchParams.set('print', 'silent');
  if (path === '') url.searchParams.set('shallow', 'true');
  const r = await fetch(url, {method, headers: {'content-type': 'application/json', ...(token === 'owner' ? {authorization: 'Bearer owner'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000)});
  const text = await r.text();
  return {status: r.status, body: text ? JSON.parse(text) : null};
}
const accepted = r => assert([200, 204].includes(r.status), 'request-status:' + r.status);
const denied = r => assert([401, 403].includes(r.status), 'expected-denial:' + r.status);
async function own(path, method = 'GET', body) {const r = await raw(path, 'owner', method, body); accepted(r); return r.body;}
async function admin(path, body) {
  const r = await fetch('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1' + path,
    {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer owner'}, body: JSON.stringify(body)});
  assert.equal(r.status, 200); return r.json();
}
try {
  assert.equal(await own(''), null);
  assert.equal(((await admin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0);
  const rules = generated(); rulesBytes = Buffer.byteLength(JSON.stringify(rules));
  await own('.settings/rules', 'PUT', rules);
  const human = await actor('google.com'); users.push(human.uid);
  await own(roots[0], 'PUT', fixture);
  let source = fixture, precedingActor;
  for (let hop = 1; hop <= 3; hop++) {
    const sourceHash = hash(source), bundle = exportBundle(source);
    assert.equal(hash(source), sourceHash, 'source-mutated-by-export');
    assert.equal(bundle.provenance.priorImportCount ?? 0, hop - 1);
    const device = await actor(); users.push(device.uid);
    const current = {human, device}, target = roots[hop];
    const io = {performanceId, owner: (which, path = '', method = 'GET', body) => own(target + (path ? '/' + path : ''), method, body),
      normal: (who, which, path = '', method = 'GET', body) => raw(target + (path ? '/' + path : ''), who.device.token, method, body)};
    await own(target, 'PUT', {control: {state: 'preparing', revision: 1, layoutSchemaVersion: 2, businessSchemaVersion: 3, layoutAuditVersion: 1, layoutEditVersion: 1, closingSchemaVersion: 1},
      roles: {[human.uid]: {active: true, role: 'owner', revision: 1, receptionBaselineRevision: 0, startsAt: 0, endsAt: Date.now() + 86400000}},
      devices: {[device.uid]: {schemaVersion: 2, performanceId, deviceUid: device.uid, humanUid: human.uid, active: true, preparedRoleRevision: 1}}});
    accepted(await raw(target + '/sessions/' + device.uid, human.token, 'PUT', session(current, 1, {performanceId})));
    if (precedingActor) denied(await io.normal(precedingActor, 'target', 'actuals/' + Object.keys(bundle.areas.actuals)[0]));
    const options = {exportId: randomUUID(), sourceEnvironment: environments[hop - 1]};
    let client = await importer(io, bundle, current, options);
    await client.begin(); await client.recover();
    while (client.metadata().uploaded < client.p.chunks.length) await client.upload();
    await client.seal();
    if (hop === 2) {
      await assert.rejects(() => client.copy(true), /simulated-response-discard/);
      client = await importer(io, bundle, current, options); await client.recover();
      assert.equal(client.metadata().copied, 1);
    }
    while (client.metadata().copied < client.p.chunks.length) await client.copy();
    await client.verify(); await client.publish(); await client.clean();
    let readback = await own(target);
    const activeJob = readback.imports[readback.activeImport];
    assert.equal(activeJob.meta.phase, 'cleaned');
    assert(!activeJob.chunks && !activeJob.copiedPaths);
    const incoming = Object.fromEntries(Object.keys(bundle.areas).map(key => [key, readback[key]]));
    assert.equal(hash(incoming), bundle.sourceHash, 'normal-import-readback');
    assert.equal(hash(readback.migrationOrigins.sourceDeviceRoster), hash(fixture.deviceRoster));
    if (hop === 1) {
      // 新規環境での通常訂正を、次の移行が消さないことを確認する。
      const [ref, progress] = Object.entries(readback.quarantineReviewState).find(([, p]) => p.receivedCount > p.reviewedCount);
      const uid = readback.references[ref].deviceUid, key = progress.lastReceiveKey;
      const event = readback.quarantine[uid].events[key], fact = readback.actuals[event.attendeeId];
      const request = correctionRequest(current, uid, key, event, progress, fact, readback.actualTotals[fact.partition], readback.control.revision);
      accepted(await io.normal(current, 'target', '', 'PATCH', request.body));
      readback = await own(target);
    }
    const replayed = replay(readback, {performanceId});
    assert.equal(replayed.corrections, 1);
    if (hop > 1) {
      assert.throws(() => prior(readback), /unmapped-native-root/);
      for (const [id, records] of Object.entries(readback.migrationOrigins.importArchives)) {
        assert.equal(hash(unflatten(records)), readback.migrationOrigins.importArchiveHashes[id]);
      }
    }
    for (const [label, mutate] of [
      ['unfinished-import', s => s.imports[s.activeImport].meta.phase = 'copying'],
      ['missing-receipt', s => delete s.imports[s.activeImport].receipt],
      ['unknown-root', s => s.unmappedBusinessData = {value: 'FAKE-preserve'}],
      ['staging-copy', s => s.imports[s.activeImport].chunks = {c0: {value: 'FAKE-pending'}}],
      ['missing-origin', s => delete s.migrationOrigins],
      ['wrong-active-import', s => s.activeImport = 'FAKE-missing'],
      ['post-purge-not-supported', s => s.retentionBoundary = {serverDeletionComplete: true}],
      ['new-amendments-not-supported', s => s.actualAmendments = {FAKE: {arrived: true}}],
      ['secret-in-record', s => s.imports[s.activeImport].receipt.token = 'FAKE-never-a-token']
    ]) {
      const wrong = structuredClone(readback); mutate(wrong);
      assert.throws(() => exportBundle(wrong), label);
      rejectedInputs.push('hop' + hop + ':' + label);
    }
    const next = exportBundle(readback);
    assert.equal(next.provenance.priorImportCount, hop);
    // 同一端末が別環境へ転用できるように、旧認可を移すことはしない。
    await own(target + '/roles/' + human.uid + '/active', 'PUT', false);
    denied(await io.normal(current, 'target', 'actuals/' + Object.keys(readback.actuals)[0]));
    assert.equal(exportBundle(await own(target)).sourceHash, next.sourceHash);
    source = await own(target); precedingActor = current;
    hops.push({hop, chunks: client.p.chunks.length, importedPriorArchives: hop - 1, nextExportArchives: hop,
      correctionsReplayed: replayed.corrections, sourceUnmodified: true, oldAuthorizationNotCopied: true, stoppedReadDenied: true});
    console.log(JSON.stringify({hop, passed: true, requests: b.state.requests}));
  }
  assert.equal(hash(await own(roots[0])), hash(fixture), 'original-source-not-preserved');
} catch (e) {
  failure = {name: e.name, message: String(e.message).slice(0, 240)};
  process.exitCode = 1;
} finally {
  b.cleanup(); cleanup = {};
  for (const [label, fn] of [
    ['rulesClosed', async () => {await own('.settings/rules', 'PUT', denyRules); assert.deepEqual(await own('.settings/rules'), denyRules);}],
    ['rootsEmpty', async () => {for (const path of roots) {await own(path, 'DELETE'); assert.equal(await own(path), null);} assert.equal(await own(''), null);}],
    ['authEmpty', async () => {for (const uid of users) await admin('/accounts:delete?key=demo-api-key', {localId: uid}); assert.equal(((await admin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0);}]
  ]) {try {await fn(); cleanup[label] = true;} catch {cleanup[label] = false; process.exitCode = 1;}}
  globalThis.fetch = originalFetch;
  assert.deepEqual(before, sourceHashes(root, files));
  fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
  fs.writeFileSync(new URL('artifacts/local-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before,
    hops, rejectedInputs, rulesBytes, ...(failure ? {failure} : {}), observedLocal: b.snapshot(), cleanup,
    sourceFixtureOwnerSeeded: true, normalClientImportVerified: true, realGoogleLogin: false,
    postPurgeRemigrationVerified: false, staleBackupReactivationPrevented: false, allBusinessMigrationVerified: false,
    externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
  console.log(JSON.stringify({hops: hops.length, rejectedInputs: rejectedInputs.length, cleanup, failure: failure ?? null}));
}
