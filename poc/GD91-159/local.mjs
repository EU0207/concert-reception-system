import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actor, session} from '../GD91-84/transport.mjs';
import {exportBundle} from '../GD91-148/bundle.mjs';
import {hash} from '../GD91-128/conversion.mjs';
import {afterPublication} from '../GD91-155/post-publish.mjs';
import {meter} from '../GD91-155/meter.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {failureDiagnostic} from '../GD91-111/failure-diagnostic.mjs';
import {generated, namespace} from './rules.mjs';
import {authorityPath, performancePath, marker, revised, beginBody, freeze, guardedImporter, commitBoundary} from './protocol.mjs';

const root = new URL('./', import.meta.url), files = ['local.mjs', 'rules.mjs', 'protocol.mjs', 'variables.mjs', 'paths.mjs', 'run-local.mjs'];
const before = sourceHashes(root, files), fixture = JSON.parse(fs.readFileSync(new URL('../GD91-155/node_modules/.cache/source-fixture.json', root)));
const fixtureSummary = JSON.parse(fs.readFileSync(new URL('../GD91-155/artifacts/source-fixture-summary.json', root)));
assert.equal(hash(fixture), fixtureSummary.fixtureHash);
const performanceId = fixtureSummary.performanceId, id = randomUUID(), environments = ['gd159-source-', 'gd159-target-', 'gd159-old-'].map(prefix => prefix + id);
const roots = environments.map(environment => performancePath(environment, performanceId)), guardPath = authorityPath(performanceId);
const originalFetch = globalThis.fetch, b = meter({fetcher: originalFetch, maxCalls: 2000, normalCallLimit: 1950, maxBodyBytes: 256 * 1024 * 1024,
  allow: url => url.protocol === 'http:' && url.hostname === '127.0.0.1' && ['9000', '9191'].includes(url.port)});
globalThis.fetch = b.fetch;
const users = [], reports = [], denialCases = [], denyRules = {rules: {'.read': false, '.write': false}};
let failure, cleanup, rulesBytes, protectionCounts;
async function raw(path, token, method = 'GET', body) {
  assert(path === '' || path === '.settings/rules' || path === guardPath || roots.some(p => path === p || path.startsWith(p + '/')));
  if (path === '' && body) assert(method === 'PATCH' && Object.keys(body).every(p => p === guardPath || roots.some(r => p.startsWith(r + '/'))));
  const url = new URL('http://127.0.0.1:9000/' + path + '.json'); url.searchParams.set('ns', namespace);
  if (token !== 'owner') url.searchParams.set('auth', token);
  if (method !== 'GET') url.searchParams.set('print', 'silent');
  if (path === '' && method === 'GET') url.searchParams.set('shallow', 'true');
  const response = await fetch(url, {method, headers: {'content-type': 'application/json', ...(token === 'owner' ? {authorization: 'Bearer owner'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000)});
  const text = await response.text(); return {status: response.status, body: text ? JSON.parse(text) : null};
}
function accept(result, path = '') {if (![200, 204].includes(result.status)) {const e = Error('normal-request-failed'); e.httpStatus = result.status; e.relativePath = path; throw e;} return result.body;}
async function reject(label, request) {const response = await request; if (![401, 403].includes(response.status)) {const error = Error('expected-denial-not-observed'); error.httpStatus = response.status; error.denialCase = label; throw error;} denialCases.push(label);}
const own = async (path, method = 'GET', body) => accept(await raw(path, 'owner', method, body), path);
async function admin(path, body) {const r = await fetch('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1' + path,
  {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer owner'}, body: JSON.stringify(body)}); assert.equal(r.status, 200); return r.json();}
const normal = (who, path, method = 'GET', body) => raw(path, who.device.token, method, body);
const atomic = (who, body) => normal(who, '', 'PATCH', body);
const guard = async who => accept(await normal(who, guardPath), guardPath);
const report = (id, facts = {}) => {reports.push({id, ...facts}); b.phase(id); console.log(JSON.stringify({id, passed: true, requests: b.state.requests}));};
try {
  assert.equal(await own(''), null);
  assert.equal(((await admin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0);
  const rules = generated(); rulesBytes = Buffer.byteLength(JSON.stringify(rules)); protectionCounts = rules.__protectionCounts;
  await own('.settings/rules', 'PUT', rules);
  const human = await actor('google.com'); users.push(human.uid);
  const actors = [];
  for (let n = 0; n < 3; n++) {const device = await actor(); users.push(device.uid); actors.push({human, device});}
  const [sourceActor, targetActor, otherActor] = actors;
  const initial = {schemaVersion: 1, performanceId, ownerHumanUid: human.uid, environment: environments[0], mode: 'active', revision: 0,
    targetEnvironment: '', importId: '', deletionRevision: 0, deletionOperationId: '', deletionScope: 'none',
    actualsHash: '', totalsHash: '', closingResultsHash: '', updatedAt: Date.now(), humanUid: human.uid, managerDeviceUid: sourceActor.device.uid};
  await own(guardPath, 'PUT', initial);
  await own(roots[0], 'PUT', {...fixture, restoreBinding: {schemaVersion: 1, lineageId: performanceId}, restorePermit: marker('active', 0)});
  async function prepare(index, who) {
    const target = roots[index];
    if (index > 0 && !(await own(target))) await own(target, 'PUT', {control: {state: 'preparing', revision: 1, businessSchemaVersion: 3, layoutSchemaVersion: 2,
      layoutAuditVersion: 1, layoutEditVersion: 1, closingSchemaVersion: 1}, restoreBinding: {schemaVersion: 1, lineageId: performanceId}, restorePermit: marker('retired', 0)});
    await own(target, 'PATCH', {['roles/' + human.uid]: {active: true, role: 'owner', revision: 1, receptionBaselineRevision: 0, startsAt: 0, endsAt: Date.now() + 86400000},
      ['devices/' + who.device.uid]: {schemaVersion: 2, performanceId, deviceUid: who.device.uid, humanUid: human.uid, active: true, preparedRoleRevision: 1}});
    accept(await raw(target + '/sessions/' + who.device.uid, human.token, 'PUT', session(who, 1, {performanceId})), 'issue-session');
  }
  await prepare(0, sourceActor); await prepare(1, targetActor); await prepare(1, otherActor);
  const person = Object.keys(fixture.actuals)[0];
  await reject('binding-is-not-client-writable', normal(targetActor, roots[1] + '/restoreBinding/lineageId', 'PUT', 'FAKE-empty-lineage'));
  await reject('authority-deletion-denied', normal(targetActor, guardPath, 'DELETE'));
  await own(guardPath, 'DELETE');
  await reject('missing-authority-business-read-denied', normal(sourceActor, roots[0] + '/actuals/' + person));
  await reject('authority-is-not-client-creatable', normal(targetActor, guardPath, 'PUT', initial));
  await own(guardPath, 'PUT', initial);
  await reject('permit-cannot-open-a-nonauthoritative-target', normal(targetActor, roots[1] + '/restorePermit', 'PUT', marker('active', 0)));
  const frozenAttempt = revised(initial, {mode: 'frozen'}, sourceActor);
  await reject('freeze-and-business-mutation-atomic-rejected', atomic(sourceActor, {[guardPath]: frozenAttempt,
    [roots[0] + '/restorePermit']: marker('frozen', 1), [roots[0] + '/actuals/' + person + '/name']: '架空の不正変更'}));
  assert.equal((await guard(sourceActor)).mode, 'active');
  const io = {performanceId, targetEnvironment: environments[1], atomic, guard,
    owner: (which, path = '', method = 'GET', body) => own(roots[which === 'source' ? 0 : 1] + (path ? '/' + path : ''), method, body),
    normal: async (who, which, path = '', method = 'GET', body) => {
      if (which === 'target' && path === 'retentionBoundary' && method === 'PUT') {
        const alone = await normal(who, roots[1] + '/retentionBoundary', 'PUT', body);
        assert([401, 403].includes(alone.status), 'boundary-alone-must-be-denied');
        const joint = await commitBoundary(io, who, body);
        if ([200, 204].includes(joint.status)) denialCases.push('valid-purge-boundary-without-ledger-update-denied');
        return joint;
      }
      return normal(who, roots[which === 'source' ? 0 : 1] + (path ? '/' + path : ''), method, body);
    }};
  const frozen = await freeze(io, sourceActor, await guard(sourceActor));
  accept(await normal(sourceActor, roots[0] + '/actuals/' + person));
  await reject('frozen-source-business-write-denied', normal(sourceActor, roots[0] + '/actuals/' + person + '/name', 'PUT', '架空の不正変更'));
  // 凍結後も本人によるセッション更新を維持する。
  accept(await raw(roots[0] + '/sessions/' + sourceActor.device.uid, human.token, 'PUT', session(sourceActor, 2, {performanceId})), 'refresh-frozen-source-session');
  const source = await own(roots[0]); delete source.restoreBinding; delete source.restorePermit;
  const bundle = exportBundle(source);
  assert.equal(bundle.sourceHash, exportBundle(fixture).sourceHash);
  const options = {exportId: randomUUID(), sourceEnvironment: environments[0], authority: frozen};
  let client = await guardedImporter(io, bundle, targetActor, options);
  await reject('begin-without-authority-transition-denied', normal(targetActor, roots[1], 'PATCH', client.beginPayload()));
  const onlyGuard = beginBody(client.beginPayload(), frozen, targetActor, environments[1], performanceId);
  delete onlyGuard[roots[1] + '/restorePermit'];
  await reject('begin-without-protected-permit-denied', atomic(targetActor, onlyGuard));
  report('A01-binding-freeze-and-current-authorization');
  await assert.rejects(() => client.begin(true), /simulated-response-discard/);
  client = await guardedImporter(io, bundle, targetActor, options); await client.recover();
  const currentGuard = await guard(targetActor); assert.equal(currentGuard.mode, 'moving');
  await own(roots[0] + '/roles/' + human.uid + '/active', 'PUT', false);
  await reject('source-owner-revoked-staging-read-denied', client.raw('imports/' + options.exportId));
  await own(roots[0] + '/roles/' + human.uid + '/active', 'PUT', true);
  await own(roots[1] + '/devices/' + targetActor.device.uid + '/active', 'PUT', false);
  await reject('target-device-stopped-staging-read-denied', client.raw('imports/' + options.exportId));
  await own(roots[1] + '/devices/' + targetActor.device.uid + '/active', 'PUT', true);
  await own(roots[1] + '/roles/' + human.uid + '/active', 'PUT', false);
  await reject('target-human-revoked-staging-read-denied', client.raw('imports/' + options.exportId));
  await own(roots[1] + '/roles/' + human.uid + '/active', 'PUT', true);
  await assert.rejects(() => client.upload(true), /simulated-response-discard/);
  client = await guardedImporter(io, bundle, targetActor, options); await client.recover();
  assert.equal(client.metadata().uploaded, 1);
  while (client.metadata().uploaded < client.p.chunks.length) await client.upload();
  await client.seal();
  await own(roots[0] + '/roles/' + human.uid + '/revision', 'PUT', 0);
  await reject('source-owner-invalid-revision-read-denied', client.raw('imports/' + options.exportId));
  await reject('source-owner-invalid-revision-valid-copy-denied', client.raw('', 'PATCH', client.copyBody()));
  await own(roots[0] + '/roles/' + human.uid + '/revision', 'PUT', 1);
  await own(roots[0] + '/roles/' + human.uid + '/receptionBaselineRevision', 'PUT', 1);
  await reject('source-owner-invalid-baseline-read-denied', client.raw('imports/' + options.exportId));
  await own(roots[0] + '/roles/' + human.uid + '/receptionBaselineRevision', 'PUT', 0);
  await own(roots[0] + '/roles/' + human.uid + '/active', 'PUT', false);
  await reject('source-owner-revoked-valid-copy-denied', client.raw('', 'PATCH', client.copyBody()));
  await own(roots[0] + '/roles/' + human.uid + '/active', 'PUT', true);
  await assert.rejects(() => client.copy(true), /simulated-response-discard/);
  client = await guardedImporter(io, bundle, targetActor, options); await client.recover();
  assert.equal(client.metadata().copied, 1);
  while (client.metadata().copied < client.p.chunks.length) await client.copy();
  await client.verify();
  await reject('publication-without-authority-transfer-denied', normal(targetActor, roots[1], 'PATCH', {activeImport: options.exportId,
    ['imports/' + options.exportId + '/meta']: {...client.metadata(), phase: 'published'},
    ['imports/' + options.exportId + '/receipt']: {exportId: options.exportId, sourceHash: bundle.sourceHash,
      ownerDevice: targetActor.device.uid, ownerHuman: human.uid, committedAt: {'.sv': 'timestamp'}}}));
  // 対象側が公開されても元環境の許可が残る要求は、一体で拒否する。
  const readyGuard = await guard(targetActor), transfer = revised(readyGuard, {mode: 'active', environment: environments[1], targetEnvironment: '', importId: ''}, targetActor);
  const withoutRetirement = {[guardPath]: transfer, [roots[1] + '/restorePermit']: marker('active', transfer.revision),
    [roots[1] + '/activeImport']: options.exportId, [roots[1] + '/imports/' + options.exportId + '/meta']: {...client.metadata(), phase: 'published'},
    [roots[1] + '/imports/' + options.exportId + '/receipt']: {exportId: options.exportId, sourceHash: bundle.sourceHash,
      ownerDevice: targetActor.device.uid, ownerHuman: human.uid, committedAt: {'.sv': 'timestamp'}}};
  await reject('publication-without-source-retirement-denied', atomic(targetActor, withoutRetirement));
  await reject('authority-transfer-without-publication-denied', atomic(targetActor, {[guardPath]: transfer,
    [roots[1] + '/restorePermit']: marker('active', transfer.revision), [roots[0] + '/restorePermit']: marker('retired', transfer.revision)}));
  await assert.rejects(() => client.publish(true), /simulated-response-discard/); await client.recover();
  assert.equal((await guard(targetActor)).environment, environments[1]);
  await reject('retired-source-business-read-denied', normal(sourceActor, roots[0] + '/actuals/' + person));
  await reject('retired-source-write-denied', normal(sourceActor, roots[0] + '/actuals/' + person + '/name', 'PUT', '架空の不正変更'));
  await reject('retired-source-authority-read-denied', normal(sourceActor, guardPath));
  await client.clean();
  report('A02-atomic-import-authority-handoff-and-retirement', {chunks: client.p.chunks.length, responseLossRecovered: true});
  const business = await afterPublication(io, bundle, {primary: targetActor, other: otherActor}, report);
  const cutGuard = await guard(targetActor);
  assert.equal(cutGuard.deletionRevision, 1);
  const boundary = await own(roots[1] + '/retentionBoundary');
  assert.equal(cutGuard.deletionOperationId, boundary.operationId);
  assert.equal(cutGuard.actualsHash, boundary.actualsHash);
  report('A03-normal-purge-atomically-recorded', {retentionBoundaryMatched: true});
  await own(roots[1] + '/roles/' + human.uid + '/role', 'PUT', 'owner');
  await prepare(2, sourceActor);
  const nextIo = {...io, targetEnvironment: environments[2], normal: (who, which, path = '', method = 'GET', body) => normal(who, roots[2] + (path ? '/' + path : ''), method, body)};
  const afterCutFrozen = await freeze(nextIo, targetActor, await guard(targetActor));
  const oldClient = await guardedImporter(nextIo, bundle, sourceActor, {exportId: randomUUID(), sourceEnvironment: environments[1], authority: afterCutFrozen});
  await reject('old-backup-deletion-revision-rejected-by-server', oldClient.begin().then(() => ({status: 200})).catch(e => ({status: e.httpStatus})));
  assert.equal((await guard(targetActor)).mode, 'frozen');
  assert.equal(await own(roots[2] + '/importHead'), null);
  // 改造クライアントが削除版だけを偽装しても、削除済み本文を取り込めない。
  const forged = structuredClone(bundle);
  forged.areas = {control: {state: 'closed', businessSchemaVersion: 3, layoutSchemaVersion: 2},
    receipts: {'FAKE-deleted-device': {events: {'1000000001': {eventId: 'FAKE-deleted-event', attendeeId: 'FAKE-deleted-person'}}}}};
  forged.hashes = Object.fromEntries(Object.entries(forged.areas).map(([key, value]) => [key, hash(value)]));
  forged.sourceHash = hash(forged.areas); forged.provenance = {deletionRevision: 1, deletionOperationId: cutGuard.deletionOperationId};
  const forgedClient = await guardedImporter(nextIo, forged, sourceActor, {exportId: randomUUID(), sourceEnvironment: environments[1], authority: afterCutFrozen});
  await forgedClient.begin(); await forgedClient.recover();
  await reject('forged-current-revision-deleted-payload-denied', forgedClient.upload().then(() => ({status: 200})).catch(e => ({status: e.httpStatus})));
  assert.equal(await own(roots[2] + '/imports/' + forgedClient.p.exportId + '/chunks/c0'), null);
  assert.equal(await own(roots[2] + '/receipts'), null);
  report('A04-stale-backup-and-forged-deletion-revision-denied');
  assert.equal(business.amendments, 2);
} catch (error) {
  failure = {name: error.name, ...failureDiagnostic(error), ...(error.httpStatus ? {httpStatus: error.httpStatus} : {}),
    ...(error.denialCase ? {denialCase: error.denialCase} : {}),
    ...(error.relativePath ? {relativePath: error.relativePath.replaceAll(id, '<trial>')} : {})};
  process.exitCode = 1;
} finally {
  b.cleanup(); cleanup = {};
  for (const [label, fn] of [
    ['rulesClosed', async () => {await own('.settings/rules', 'PUT', denyRules); assert.deepEqual(await own('.settings/rules'), denyRules);}],
    ['rootsEmpty', async () => {for (const path of [...roots, guardPath]) {await own(path, 'DELETE'); assert.equal(await own(path), null);} assert.equal(await own(''), null);}],
    ['authEmpty', async () => {for (const uid of users) await admin('/accounts:delete?key=demo-api-key', {localId: uid}); assert.equal(((await admin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0);}]
  ]) {try {await fn(); cleanup[label] = true;} catch {cleanup[label] = false; process.exitCode = 1;}}
  globalThis.fetch = originalFetch;
  assert.deepEqual(before, sourceHashes(root, files));
  fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
  fs.writeFileSync(new URL('artifacts/local-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before, rulesBytes, protectionCounts,
    reports, denialCases, ...(failure ? {failure} : {}), observedLocal: b.snapshot(), cleanup,
    bootstrapAuthorityAndBindingsOwnerSeeded: true, wholeProjectLossRecoveryVerified: false,
    crossDatabaseAuthorityVerified: false, postPurgeRemigrationVerified: false, normalAbortCleanupVerified: false,
    allBusinessMigrationVerified: false, externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
  console.log(JSON.stringify({reports: reports.length, denialCases: denialCases.length, cleanup, failure: failure ?? null}));
}
