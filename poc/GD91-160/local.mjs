import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actor, session} from '../GD91-84/transport.mjs';
import {generated} from '../GD91-159/rules.mjs';
import {marker, authorityPath, performancePath} from '../GD91-159/protocol.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {meter} from '../GD91-155/meter.mjs';
import {hash} from '../GD91-128/conversion.mjs';
import {failureDiagnostic} from '../GD91-111/failure-diagnostic.mjs';

const root = new URL('./', import.meta.url), files = ['local.mjs', 'run-local.mjs'];
const before = sourceHashes(root, files), id = randomUUID();
const namespaces = ['demo-concert-seat-gd91-84-guard-a-' + id.slice(0, 8), 'demo-concert-seat-gd91-84-guard-b-' + id.slice(0, 8)];
assert(namespaces.every(ns => ns.length <= 63));
const performanceId = 'FAKE-performance-' + id, environment = 'FAKE-rebuilt', path = performancePath(environment, performanceId), authority = authorityPath(performanceId);
const denyRules = {rules: {'.read': false, '.write': false}}, users = [], results = {};
const originalFetch = globalThis.fetch, b = meter({fetcher: originalFetch, maxCalls: 150, normalCallLimit: 120,
  maxBodyBytes: 128 * 1024 * 1024, allow: url => url.protocol === 'http:' && url.hostname === '127.0.0.1' && ['9000', '9191'].includes(url.port)});
globalThis.fetch = b.fetch;
let cleanup, failure, rulesBytes;
async function request(ns, location, token, method = 'GET', body) {
  assert(namespaces.includes(ns));
  assert(['', '.settings/rules', authority].includes(location) || location === path || location.startsWith(path + '/'));
  const url = new URL('http://127.0.0.1:9000/' + location + '.json'); url.searchParams.set('ns', ns);
  if (token !== 'owner') url.searchParams.set('auth', token);
  if (method !== 'GET') url.searchParams.set('print', 'silent');
  if (location === '' && method === 'GET') url.searchParams.set('shallow', 'true');
  const r = await fetch(url, {method, headers: {'content-type': 'application/json', ...(token === 'owner' ? {authorization: 'Bearer owner'} : {})},
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000)});
  const text = await r.text(); return {status: r.status, body: text ? JSON.parse(text) : null};
}
function accept(r) {if (![200, 204].includes(r.status)) {const error = Error('request-status'); error.httpStatus = r.status; throw error;} return r.body;}
function denied(r) {assert([401, 403].includes(r.status), 'expected-denial:' + r.status);}
const own = async (ns, location, method = 'GET', body) => accept(await request(ns, location, 'owner', method, body));
async function admin(location, body) {const r = await fetch('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1' + location,
  {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer owner'}, body: JSON.stringify(body)}); assert.equal(r.status, 200); return r.json();}
try {
  assert.equal(((await admin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0);
  const rules = generated(); rulesBytes = Buffer.byteLength(JSON.stringify(rules));
  for (const ns of namespaces) {assert.equal(await own(ns, ''), null); await own(ns, '.settings/rules', 'PUT', rules);}
  const human = await actor('google.com'), device = await actor(), who = {human, device}; users.push(human.uid, device.uid);
  const close = {'FAKE-close': {operationId: 'FAKE-close', peopleCount: 1}};
  const past = {
    control: {state: 'closed', revision: 4, businessSchemaVersion: 3, layoutSchemaVersion: 2, layoutAuditVersion: 1, layoutEditVersion: 1, closingSchemaVersion: 1},
    restoreBinding: {schemaVersion: 1, lineageId: performanceId}, restorePermit: marker('active', 0),
    roles: {[human.uid]: {active: true, role: 'owner', revision: 1, receptionBaselineRevision: 0, startsAt: 0, endsAt: Date.now() + 86400000}},
    devices: {[device.uid]: {schemaVersion: 2, performanceId, deviceUid: device.uid, humanUid: human.uid, active: true, preparedRoleRevision: 1}},
    sessions: {[device.uid]: session(who, 1, {performanceId})},
    actuals: {'FAKE-person': {attendeeId: 'FAKE-person', name: '架空の旧バックアップ', performanceId, partition: 'part0', arrived: true, revision: 1,
      lastCorrectionId: 'FAKE-close', closeOperationId: 'FAKE-close'}},
    actualTotals: {part0: {total: 1, arrived: 1, revision: 1, lastCorrectionId: 'FAKE-close', closeOperationId: 'FAKE-close'}}, closingResults: close,
    receipts: {'FAKE-old-device': {events: {'1000000001': {eventId: 'FAKE-deleted-receipt', attendeeId: 'FAKE-person', performanceId,
      deviceUid: 'FAKE-old-device', sequence: 1, kind: 'firstReception'}}}}
  };
  const oldAuthority = {schemaVersion: 1, performanceId, ownerHumanUid: human.uid, environment, mode: 'active', revision: 0,
    targetEnvironment: '', importId: '', deletionRevision: 0, deletionOperationId: '', deletionScope: 'none', actualsHash: '', totalsHash: '', closingResultsHash: '',
    updatedAt: Date.now(), humanUid: human.uid, managerDeviceUid: device.uid};
  const latest = {...oldAuthority, revision: 1, deletionRevision: 1, deletionOperationId: 'FAKE-current-deletion', deletionScope: 'reception-details',
    actualsHash: hash(past.actuals), totalsHash: hash(past.actualTotals), closingResultsHash: hash(close)};
  const current = structuredClone(past); delete current.receipts;
  current.restorePermit = marker('active', 1);
  current.retentionBoundary = {operationId: latest.deletionOperationId, scope: 'reception-details', serverDeletionComplete: true,
    externalCopiesPending: true, deletedAt: Date.now(), humanUid: human.uid, managerDeviceUid: device.uid,
    actualsHash: latest.actualsHash, totalsHash: latest.totalsHash, closingResultsHash: latest.closingResultsHash};
  // 元DBに最新台帳があり、新DBには古い本文だけがある最小モデル。業務削除の合格は159を参照する。
  await own(namespaces[0], authority, 'PUT', latest); await own(namespaces[0], path, 'PUT', current);
  await own(namespaces[1], path, 'PUT', past);
  assert.equal(accept(await request(namespaces[0], authority, device.token)).deletionRevision, 1);
  denied(await request(namespaces[1], path + '/actuals/FAKE-person', device.token));
  results.missingAuthorityBusinessReadDenied = true;
  denied(await request(namespaces[1], authority, device.token, 'PUT', oldAuthority));
  results.normalClientCannotInitializeAuthority = true;
  assert.equal(await own(namespaces[1], authority), null);
  // 管理者による誤った初期化はRulesを迂回する。これを正常な復旧の合格へ加算しない。
  await own(namespaces[1], authority, 'PUT', oldAuthority);
  assert.equal(accept(await request(namespaces[1], authority, device.token)).deletionRevision, 0);
  const receipt = await request(namespaces[1], path + '/receipts/FAKE-old-device/events/1000000001', device.token);
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.eventId, 'FAKE-deleted-receipt');
  results.staleTrustedBootstrapRestoresDeletedReceipt = true;
  assert.equal(accept(await request(namespaces[0], authority, device.token)).deletionRevision, 1);
  results.sourceAuthorityStillRevisionOne = true;
  results.targetRootCannotObserveOtherDatabaseAuthority = true;
  await own(namespaces[1], path + '/devices/' + device.uid + '/active', 'PUT', false);
  denied(await request(namespaces[1], path + '/receipts/FAKE-old-device/events/1000000001', device.token));
  results.currentDeviceRevocationStillEnforced = true;
} catch (error) {
  failure = {name: error.name, ...failureDiagnostic(error), ...(error.httpStatus ? {httpStatus: error.httpStatus} : {}),
    ...(error.operator ? {operator: error.operator, actual: error.actual, expected: error.expected} : {})}; process.exitCode = 1;
} finally {
  b.cleanup(); cleanup = {};
  for (const ns of namespaces) {
    const key = ns === namespaces[0] ? 'source' : 'rebuilt';
    try {
      await own(ns, '.settings/rules', 'PUT', denyRules); assert.deepEqual(await own(ns, '.settings/rules'), denyRules);
      for (const location of [path, authority]) {await own(ns, location, 'DELETE'); assert.equal(await own(ns, location), null);}
      assert.equal(await own(ns, ''), null); cleanup[key] = true;
    } catch {cleanup[key] = false; process.exitCode = 1;}
  }
  try {for (const uid of users) await admin('/accounts:delete?key=demo-api-key', {localId: uid}); assert.equal(((await admin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0); cleanup.authEmpty = true;}
  catch {cleanup.authEmpty = false; process.exitCode = 1;}
  globalThis.fetch = originalFetch;
  assert.deepEqual(before, sourceHashes(root, files));
  fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
  fs.writeFileSync(new URL('artifacts/local-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before, rulesBytes,
    results, ...(failure ? {failure} : {}), observedLocal: b.snapshot(), cleanup,
    ownerSeededMinimalModel: true, separateDatabaseNamespacesOnly: true, singleAuthEmulatorProject: true,
    staleTrustedBootstrapIsLimitation: true, authoritativeBootstrapVerified: false,
    crossProjectAuthenticationVerified: false, wholeProjectLossRecoveryVerified: false,
    externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
  console.log(JSON.stringify({results, cleanup, failure: failure ?? null}));
}
