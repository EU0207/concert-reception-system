import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actor, session as actorSession} from '../GD91-84/transport.mjs';
import {generated} from '../GD91-159/rules.mjs';
import {marker, authorityPath, performancePath, freeze, revised} from '../GD91-159/protocol.mjs';
import {hash} from '../GD91-128/conversion.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {failureDiagnostic} from '../GD91-111/failure-diagnostic.mjs';
import {meter} from '../GD91-155/meter.mjs';
import {business, planRecovery, resumeRecovery, metadataSession, executeRecovery} from './recovery.mjs';

const root = new URL('./', import.meta.url), before = sourceHashes(root, ['local.mjs', 'recovery.mjs', 'run-local.mjs']);
const id = randomUUID().slice(0, 8), namespaces = ['demo-concert-seat-gd91-84-recover-a-' + id, 'demo-concert-seat-gd91-84-recover-b-' + id];
const performanceId = 'FAKE-recover-' + id, environments = ['FAKE-source', 'FAKE-target'];
const paths = environments.map(env => performancePath(env, performanceId)), authority = authorityPath(performanceId);
const originalFetch = globalThis.fetch, b = meter({fetcher: originalFetch, maxCalls: 1800, normalCallLimit: 1740, maxBodyBytes: 128 * 1024 * 1024,
  allow: url => url.protocol === 'http:' && url.hostname === '127.0.0.1' && ['9000', '9191'].includes(url.port)});
globalThis.fetch = b.fetch;
const denyRules = {rules: {'.read': false, '.write': false}}, users = [], reports = [], metadataWrites = [];
let cleanup, failure, rulesBytes;
async function raw(ns, location, token, method = 'GET', body, extraHeaders = {}) {
  assert(namespaces.includes(ns));
  assert(['', '.settings/rules', authority].includes(location) || paths.some(p => location === p || location.startsWith(p + '/')));
  if (location === '' && method === 'PATCH') assert(Object.keys(body).every(p => p === authority || paths.some(r => p.startsWith(r + '/'))));
  const url = new URL('http://127.0.0.1:9000/' + location + '.json'); url.searchParams.set('ns', ns);
  if (token !== 'owner') url.searchParams.set('auth', token);
  if (location === '' && method === 'GET') url.searchParams.set('shallow', 'true');
  const response = await fetch(url, {method, headers: {'content-type': 'application/json', ...(token === 'owner' ? {authorization: 'Bearer owner'} : {}), ...extraHeaders},
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000)});
  const text = await response.text(); return {status: response.status, body: text ? JSON.parse(text) : null, etag: response.headers.get('etag')};
}
function accepted(result) {if (![200, 204].includes(result.status)) {const e = Error('request-status'); e.httpStatus = result.status; throw e;} return result.body;}
const own = async (ns, path, method = 'GET', body) => accepted(await raw(ns, path, 'owner', method, body));
const denied = result => assert([401, 403].includes(result.status), 'expected-denial:' + result.status);
async function authAdmin(location, body) {
  const r = await fetch('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1' + location, {method: 'POST',
    headers: {'content-type': 'application/json', authorization: 'Bearer owner'}, body: JSON.stringify(body)});
  assert.equal(r.status, 200); return r.json();
}
try {
  assert.equal(((await authAdmin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0);
  const rules = generated(); rulesBytes = Buffer.byteLength(JSON.stringify(rules));
  for (const ns of namespaces) {assert.equal(await own(ns, ''), null); await own(ns, '.settings/rules', 'PUT', rules);}
  const human = await actor('google.com'), device = await actor(), who = {human, device}; users.push(human.uid, device.uid);
  const actuals = {['FAKE-person']: {attendeeId: 'FAKE-person', name: '架空の保持実績', performanceId, partition: 'part0', arrived: true, revision: 1, lastCorrectionId: 'FAKE-close', closeOperationId: 'FAKE-close'}};
  const actualTotals = {part0: {total: 1, arrived: 1, revision: 1, lastCorrectionId: 'FAKE-close', closeOperationId: 'FAKE-close'}};
  const closingResults = {['FAKE-close']: {operationId: 'FAKE-close', peopleCount: 1}};
  const initial = {schemaVersion: 1, performanceId, ownerHumanUid: human.uid, environment: environments[0], mode: 'active', revision: 1,
    targetEnvironment: '', importId: '', deletionRevision: 1, deletionOperationId: 'FAKE-deletion', deletionScope: 'reception-details',
    actualsHash: hash(actuals), totalsHash: hash(actualTotals), closingResultsHash: hash(closingResults), updatedAt: Date.now(), humanUid: human.uid, managerDeviceUid: device.uid};
  const data = {control: {state: 'closed', revision: 4, businessSchemaVersion: 3, layoutSchemaVersion: 2, layoutAuditVersion: 1, layoutEditVersion: 1, closingSchemaVersion: 1},
    actuals, actualTotals, closingResults,
    retentionBoundary: {operationId: initial.deletionOperationId, scope: 'reception-details', serverDeletionComplete: true, externalCopiesPending: true,
      deletedAt: Date.now(), humanUid: human.uid, managerDeviceUid: device.uid, actualsHash: initial.actualsHash, totalsHash: initial.totalsHash, closingResultsHash: initial.closingResultsHash},
    roles: {[human.uid]: {active: true, role: 'owner', revision: 1, receptionBaselineRevision: 0, startsAt: 0, endsAt: Date.now() + 86400000}},
    devices: {[device.uid]: {schemaVersion: 2, performanceId, deviceUid: device.uid, humanUid: human.uid, active: true, preparedRoleRevision: 1}},
    sessions: {[device.uid]: actorSession(who, 1, {performanceId})}};
  for (const lose of [-1, 0, 1, 2, 3, 4, 5]) {
    b.phase('recovery-' + lose);
    await own(namespaces[0], authority, 'PUT', initial);
    await own(namespaces[0], paths[0], 'PUT', {...data, restoreBinding: {schemaVersion: 1, lineageId: performanceId}, restorePermit: marker('active', 1)});
    await own(namespaces[1], authority, 'DELETE'); await own(namespaces[1], paths[1], 'PUT', data);
    const io = {performanceId, atomic: (actor, body) => raw(namespaces[0], '', actor.device.token, 'PATCH', body),
      guard: async actor => accepted(await raw(namespaces[0], authority, actor.device.token))};
    const frozen = await freeze(io, who, initial);
    let plan = planRecovery({source: {namespace: namespaces[0], environment: environments[0], performanceId}, target: {namespace: namespaces[1], environment: environments[1], performanceId},
      frozen, sourceData: await own(namespaces[0], paths[0]), targetData: await own(namespaces[1], paths[1]), operationId: 'FAKE-operation-' + id});
    let writes = 0, lossInjected = false, maxReadable = 0, inspections = 0;
    const transport = {
      read: async s => {const result = await raw(s.namespace, s.path, 'owner', 'GET', undefined, {'X-Firebase-ETag': 'true'}); accepted(result); assert(result.etag); return result;},
      put: async (s, etag) => {
        const r = await raw(s.namespace, s.path, 'owner', 'PUT', s.after, {'if-match': etag});
        if ([200, 204].includes(r.status)) metadataWrites.push({namespace: s.namespace, path: s.path});
        if (writes++ === lose && !lossInjected) {lossInjected = true; throw Error('injected-response-loss');}
        return r;
      }
    };
    const inspect = async p => {
      inspections++;
      const current = await own(namespaces[0], authority);
      assert([hash(p.frozen), hash(p.locked)].includes(hash(current)), 'live-source-authority-changed');
      const source = await own(namespaces[0], paths[0]), target = await own(namespaces[1], paths[1]);
      assert.equal(hash(business(source)), p.businessHash); assert.equal(hash(business(target)), p.businessHash);
      for (const [n, copy] of [[0, source], [1, target]]) {
        assert.equal(copy.roles[human.uid].role, 'owner'); assert.equal(copy.roles[human.uid].active, true);
        accepted(await raw(namespaces[n], paths[n] + '/restoreBinding', device.token));
      }
      // 各段階で通常クライアントの実データ取得を照合する。
      const reads = await Promise.all(namespaces.map((ns, n) => raw(ns, paths[n] + '/actuals/FAKE-person', device.token)));
      const readable = reads.filter(r => r.status === 200).length; maxReadable = Math.max(maxReadable, readable); assert(readable <= 1, 'both-databases-readable');
      for (const r of reads) if (r.status !== 200) denied(r);
      if (current.mode === 'recovering') {
        const reopen = revised(current, {mode: 'active', environment: environments[0], targetEnvironment: '', importId: ''}, who);
        denied(await raw(namespaces[0], '', device.token, 'PATCH', {[authority]: reopen, [paths[0] + '/restorePermit']: marker('active', reopen.revision)}));
      }
    };
    let session = metadataSession({plan, transport, expiresAt: Date.now() + 600000});
    if (lose >= 0) {
      await assert.rejects(executeRecovery(plan, session, inspect), /injected-response-loss/); session.close();
      plan = resumeRecovery(JSON.parse(JSON.stringify(plan)), {sourceAuthority: await own(namespaces[0], authority), sourceData: await own(namespaces[0], paths[0]),
        targetData: await own(namespaces[1], paths[1]), targetAuthority: await own(namespaces[1], authority)});
      session = metadataSession({plan, transport, expiresAt: Date.now() + 600000});
    }
    await executeRecovery(plan, session, inspect); session.close();
    denied(await raw(namespaces[0], paths[0] + '/actuals/FAKE-person', device.token));
    assert.equal(accepted(await raw(namespaces[1], paths[1] + '/actuals/FAKE-person', device.token)).name, '架空の保持実績');
    assert.equal((await own(namespaces[1], authority)).deletionRevision, 1);
    assert.equal(await own(namespaces[1], paths[1] + '/receipts'), null);
    const current = await transport.read(plan.steps[0]);
    const conflict = await transport.put(plan.steps[0], '"stale-etag"'); assert.equal(conflict.status, 412);
    assert.deepEqual((await transport.read(plan.steps[0])).body, current.body);
    await own(namespaces[1], paths[1] + '/devices/' + device.uid + '/active', 'PUT', false);
    denied(await raw(namespaces[1], paths[1] + '/actuals/FAKE-person', device.token));
    reports.push({responseLossAfterStep: lose, resumed: lose >= 0, inspections, maxReadableDatabases: maxReadable,
      sourceNormalReopenDenied: true, retainedActualsPreserved: true, deletedReceiptsAbsent: true, staleEtagRejected: true, targetDeviceStopEnforced: true});
    console.log(JSON.stringify({recoveryCase: lose, passed: true, requests: b.state.requests}));
  }
} catch (error) {
  failure = {name: error.name, ...failureDiagnostic(error), ...(error.httpStatus ? {httpStatus: error.httpStatus} : {})}; process.exitCode = 1;
} finally {
  b.cleanup(); cleanup = {};
  for (let n = 0; n < namespaces.length; n++) try {
    await own(namespaces[n], '.settings/rules', 'PUT', denyRules); assert.deepEqual(await own(namespaces[n], '.settings/rules'), denyRules);
    for (const p of [paths[n], authority]) {await own(namespaces[n], p, 'DELETE'); assert.equal(await own(namespaces[n], p), null);}
    assert.equal(await own(namespaces[n], ''), null); cleanup[n === 0 ? 'sourceEmptyAndDenied' : 'targetEmptyAndDenied'] = true;
  } catch {cleanup[n === 0 ? 'sourceEmptyAndDenied' : 'targetEmptyAndDenied'] = false; process.exitCode = 1;}
  try {for (const uid of users) await authAdmin('/accounts:delete?key=demo-api-key', {localId: uid});
    assert.equal(((await authAdmin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0); cleanup.authEmpty = true;
  } catch {cleanup.authEmpty = false; process.exitCode = 1;}
  globalThis.fetch = originalFetch;
  assert.deepEqual(before, sourceHashes(root, ['local.mjs', 'recovery.mjs', 'run-local.mjs']));
  fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
  fs.writeFileSync(new URL('artifacts/local-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before, rulesBytes, reports, metadataWrites,
    ...(failure ? {failure} : {}), observedLocal: b.snapshot(), cleanup, ownerSeededBusinessFixture: true, metadataOnlyWriter: true,
    realCredentialLifecycleVerified: false, wholeProjectLossRecoveryVerified: false, fullBrowserImportVerified: false,
    crossProjectAuthenticationVerified: false, externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
  console.log(JSON.stringify({reports: reports.length, cleanup, failure: failure ?? null}));
}
