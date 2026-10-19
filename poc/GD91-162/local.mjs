import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actor, session as actorSession} from '../GD91-84/transport.mjs';
import {hash} from '../GD91-128/conversion.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {failureDiagnostic} from '../GD91-111/failure-diagnostic.mjs';
import {meter} from '../GD91-155/meter.mjs';
import {generated} from '../GD91-159/rules.mjs';
import {authorityPath, performancePath, marker, freeze} from '../GD91-159/protocol.mjs';
import {business} from '../GD91-161/recovery.mjs';
import {planRecovery, retainedProof} from '../GD91-163/recovery.mjs';
import {amend} from '../GD91-163/amend.mjs';
import {createCatalog, openCatalog} from './catalog.mjs';

const root = new URL('./', import.meta.url), files = ['local.mjs', 'catalog.mjs', 'run-local.mjs'], before = sourceHashes(root, files);
const id = randomUUID().slice(0, 8), namespaces = ['demo-concert-seat-gd91-84-seal-a-' + id, 'demo-concert-seat-gd91-84-seal-b-' + id];
const performanceId = 'FAKE-performance-' + id, environments = ['FAKE-source', 'FAKE-target'];
const paths = environments.map(env => performancePath(env, performanceId)), authority = authorityPath(performanceId);
const cache = new URL('node_modules/.cache/', root); fs.mkdirSync(cache, {recursive: true});
const originalFetch = globalThis.fetch, b = meter({fetcher: originalFetch, maxCalls: 1000, normalCallLimit: 950, maxBodyBytes: 128 * 1024 * 1024,
  allow: url => url.protocol === 'http:' && url.hostname === '127.0.0.1' && ['9000', '9191'].includes(url.port)});
globalThis.fetch = b.fetch;
const users = [], reports = [], denyRules = {rules: {'.read': false, '.write': false}};
let failure, cleanup, openBook;
async function raw(ns, location, token, method = 'GET', body, extraHeaders = {}) {
  assert(namespaces.includes(ns));
  assert(['', '.settings/rules', authority].includes(location) || paths.some(p => location === p || location.startsWith(p + '/')));
  if (location === '' && method === 'PATCH') assert(Object.keys(body).every(p => p === authority || paths.some(r => p.startsWith(r + '/'))));
  const url = new URL('http://127.0.0.1:9000/' + location + '.json'); url.searchParams.set('ns', ns);
  if (token !== 'owner') url.searchParams.set('auth', token);
  if (location === '' && method === 'GET') url.searchParams.set('shallow', 'true');
  const r = await fetch(url, {method, headers: {'content-type': 'application/json', ...(token === 'owner' ? {authorization: 'Bearer owner'} : {}), ...extraHeaders},
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000)});
  const text = await r.text(); return {status: r.status, body: text ? JSON.parse(text) : null, etag: r.headers.get('etag')};
}
function accepted(r) {if (![200, 204].includes(r.status)) {const e = Error('request-status'); e.httpStatus = r.status; throw e;} return r.body;}
const own = async (ns, p, method = 'GET', body) => accepted(await raw(ns, p, 'owner', method, body));
const denied = r => assert([401, 403].includes(r.status), 'expected-denial:' + r.status);
async function authAdmin(p, body) {const r = await fetch('http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1' + p,
  {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer owner'}, body: JSON.stringify(body)}); assert.equal(r.status, 200); return r.json();}
async function cas(ns, p, expected, next) {
  assert(p === authority || paths.some(base => ['restoreBinding', 'restorePermit'].some(k => p === base + '/' + k)), 'metadata-only');
  const read = await raw(ns, p, 'owner', 'GET', undefined, {'X-Firebase-ETag': 'true'}); accepted(read); assert(read.etag);
  if (hash(read.body) === hash(next)) return;
  assert.equal(hash(read.body), hash(expected), 'unexpected-metadata');
  accepted(await raw(ns, p, 'owner', 'PUT', next, {'if-match': read.etag})); assert.equal(hash(await own(ns, p)), hash(next));
}
try {
  assert.equal(((await authAdmin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0);
  const rules = generated(); for (const ns of namespaces) {assert.equal(await own(ns, ''), null); await own(ns, '.settings/rules', 'PUT', rules);}
  const human = await actor('google.com'), device = await actor(), who = {human, device}; users.push(human.uid, device.uid);
  const actuals = {['FAKE-person']: {attendeeId: 'FAKE-person', name: '架空の保全実績', performanceId, partition: 'part0', arrived: true, revision: 1, lastCorrectionId: 'FAKE-close', closeOperationId: 'FAKE-close', currentCycle: 1, activeAtClose: true}};
  const actualTotals = {part0: {total: 1, arrived: 1, revision: 1, lastCorrectionId: 'FAKE-close', closeOperationId: 'FAKE-close'}}, closingResults = {['FAKE-close']: {operationId: 'FAKE-close', peopleCount: 1}};
  const initial = {schemaVersion: 1, performanceId, ownerHumanUid: human.uid, environment: environments[0], mode: 'active', revision: 1,
    targetEnvironment: '', importId: '', deletionRevision: 1, deletionOperationId: 'FAKE-cut', deletionScope: 'reception-details', actualsHash: hash(actuals), totalsHash: hash(actualTotals), closingResultsHash: hash(closingResults),
    updatedAt: Date.now(), humanUid: human.uid, managerDeviceUid: device.uid};
  const data = {control: {state: 'closed', revision: 4, businessSchemaVersion: 3, layoutSchemaVersion: 2, layoutAuditVersion: 1, layoutEditVersion: 1, closingSchemaVersion: 1}, actuals, actualTotals, closingResults,
    retentionBoundary: {operationId: initial.deletionOperationId, scope: 'reception-details', serverDeletionComplete: true, externalCopiesPending: true, deletedAt: Date.now(), humanUid: human.uid, managerDeviceUid: device.uid,
      actualsHash: initial.actualsHash, totalsHash: initial.totalsHash, closingResultsHash: initial.closingResultsHash},
    roles: {[human.uid]: {active: true, role: 'owner', revision: 1, receptionBaselineRevision: 0, startsAt: 0, endsAt: Date.now() + 86400000}},
    devices: {[device.uid]: {schemaVersion: 2, performanceId, deviceUid: device.uid, humanUid: human.uid, active: true, preparedRoleRevision: 1}}, sessions: {[device.uid]: actorSession(who, 1, {performanceId})}};
  for (const stop of ['normal', 'before-intent', 'after-intent', 'after-authority', 'after-permit']) {
    b.phase(stop);
    await own(namespaces[0], authority, 'PUT', initial);
    await own(namespaces[0], paths[0], 'PUT', {...data, restoreBinding: {schemaVersion: 1, lineageId: performanceId}, restorePermit: marker('active', 1)});
    await own(namespaces[1], authority, 'DELETE'); await own(namespaces[1], paths[1], 'PUT', data);
    const sourceOk = async (p = '', method = 'GET', body) => accepted(await raw(namespaces[0], paths[0] + (p ? '/' + p : ''), device.token, method, body));
    await amend(sourceOk, who, false); await amend(sourceOk, who, true);
    const backupBusiness = business(await own(namespaces[0], paths[0]));
    assert.equal(retainedProof(backupBusiness, initial).result.amendments, 2);
    const restoreData = {...backupBusiness, roles: data.roles, devices: data.devices, sessions: data.sessions};
    await own(namespaces[1], paths[1], 'PUT', restoreData);
    const io = {performanceId, atomic: (a, body) => raw(namespaces[0], '', a.device.token, 'PATCH', body), guard: async a => accepted(await raw(namespaces[0], authority, a.device.token))};
    const frozen = await freeze(io, who, initial);
    const plan = planRecovery({source: {namespace: namespaces[0], environment: environments[0], performanceId}, target: {namespace: namespaces[1], environment: environments[1], performanceId},
      frozen, sourceData: await own(namespaces[0], paths[0]), targetData: await own(namespaces[1], paths[1]), operationId: 'FAKE-seal-' + id});
    for (const step of plan.steps.slice(0, 2)) await cas(step.namespace, step.path, step.before, step.after);
    denied(await raw(namespaces[0], paths[0] + '/actuals/FAKE-person', device.token));
    const dir = new URL('local-' + randomUUID() + '/', cache); fs.mkdirSync(dir); createCatalog(dir);
    let inject = false;
    openBook = openCatalog(dir, {custody: {independentCurrentStore: true},
      beforeAppend: kind => {if (inject && stop === 'before-intent' && kind === 'activation-intent') throw Error('injected-stop');},
      afterAppend: kind => {if (inject && stop === 'after-intent' && kind === 'activation-intent') throw Error('injected-stop');}});
    const certificate = await openBook.seal(plan, async () => ({authority: await own(namespaces[0], authority), data: await own(namespaces[0], paths[0]), targetAuthority: await own(namespaces[1], authority)}));
    // 2つの業務DBの喪失を故障注入する。独立台帳とAuth Emulatorは残す。
    for (let n = 0; n < 2; n++) {await own(namespaces[n], paths[n], 'DELETE'); await own(namespaces[n], authority, 'DELETE'); assert.equal(await own(namespaces[n], ''), null);}
    openBook.close(); openBook = openCatalog(dir, {custody: {independentCurrentStore: true}});
    // 故障注入設定を再起動後の台帳へ設定する。証明書で台帳を再作成しない。
    openBook.close(); openBook = openCatalog(dir, {custody: {independentCurrentStore: true},
      beforeAppend: kind => {if (inject && stop === 'before-intent' && kind === 'activation-intent') throw Error('injected-stop');},
      afterAppend: kind => {if (inject && stop === 'after-intent' && kind === 'activation-intent') throw Error('injected-stop');}});
    assert(openBook.eligible(certificate, {businessHash: hash(backupBusiness), target: plan.target}));
    // 本文・現在認可は最小モデルの前提投入。正式ブラウザー取込の合格にしない。
    await own(namespaces[1], paths[1], 'PUT', restoreData);
    const staged = {...plan.active, mode: 'recovering', importId: plan.locked.importId};
    await cas(namespaces[1], paths[1] + '/restorePermit', null, marker('retired', staged.revision));
    await cas(namespaces[1], paths[1] + '/restoreBinding', null, {schemaVersion: 1, lineageId: performanceId});
    await cas(namespaces[1], authority, null, staged);
    denied(await raw(namespaces[1], paths[1] + '/restorePermit', device.token, 'PUT', marker('active', staged.revision)));
    denied(await raw(namespaces[1], paths[1] + '/actuals/FAKE-person', device.token));
    const activate = () => openBook.activate(certificate, {businessHash: hash(backupBusiness), target: plan.target,
      authorize: async () => {accepted(await raw(namespaces[1], paths[1] + '/restoreBinding', device.token)); return true;},
      publish: async () => {
        assert.equal(openBook.state(certificate), 'activation-intent');
        await cas(namespaces[1], authority, staged, plan.active);
        if (inject && stop === 'after-authority') throw Error('injected-stop');
        await cas(namespaces[1], paths[1] + '/restorePermit', marker('retired', staged.revision), marker('active', staged.revision));
        if (inject && stop === 'after-permit') throw Error('injected-stop');
      }});
    inject = stop !== 'normal';
    if (inject) {
      await assert.rejects(activate(), /injected-stop/); inject = false;
      if (stop === 'before-intent') {assert(openBook.eligible(certificate, {businessHash: plan.businessHash, target: plan.target})); await activate();}
      else assert.throws(() => openBook.eligible(certificate, {businessHash: plan.businessHash, target: plan.target}), /consumed/);
    } else await activate();
    const canRead = ['normal', 'before-intent', 'after-permit'].includes(stop);
    const read = await raw(namespaces[1], paths[1] + '/actuals/FAKE-person', device.token);
    if (canRead) {
      assert.equal(read.status, 200); assert.equal(read.body.name, '架空の保全実績'); assert.equal(read.body.revision, 3);
      const targetOk = async (p = '', method = 'GET', body) => accepted(await raw(namespaces[1], paths[1] + (p ? '/' + p : ''), device.token, method, body));
      await amend(targetOk, who, false);
      const after = await own(namespaces[1], paths[1]); assert.equal(retainedProof(after, plan.active).result.amendments, 3);
      assert.equal(after.actuals['FAKE-person'].arrived, false);
    }
    else denied(read);
    assert.equal(await own(namespaces[0], ''), null); assert.equal(await own(namespaces[1], paths[1] + '/receipts'), null);
    assert.throws(() => openBook.eligible(certificate, {businessHash: plan.businessHash, target: plan.target}), /consumed/);
    await own(namespaces[1], paths[1] + '/devices/' + device.uid + '/active', 'PUT', false);
    denied(await raw(namespaces[1], paths[1] + '/actuals/FAKE-person', device.token));
    reports.push({stop, bothBusinessDatabasesLost: true, independentCatalogSurvived: true, normalEarlyActivationDenied: true,
      catalogConsumedBeforeActivation: true, oldCertificateReuseDenied: true, sourceDatabaseEmpty: true, deletedReceiptAbsent: true,
      sourceNormalAmendments: 2, restoredNormalAmendments: canRead ? 3 : 2,
      targetWasReadableBeforeDeviceStop: canRead, deviceStopEnforced: true});
    openBook.close(); openBook = null; console.log(JSON.stringify({stop, passed: true, requests: b.state.requests}));
  }
} catch (error) {failure = {name: error.name, ...failureDiagnostic(error), ...(error.httpStatus ? {httpStatus: error.httpStatus} : {})}; process.exitCode = 1;}
finally {
  openBook?.close(); b.cleanup(); cleanup = {};
  for (let n = 0; n < namespaces.length; n++) try {
    await own(namespaces[n], '.settings/rules', 'PUT', denyRules); assert.deepEqual(await own(namespaces[n], '.settings/rules'), denyRules);
    for (const p of [paths[n], authority]) {await own(namespaces[n], p, 'DELETE'); assert.equal(await own(namespaces[n], p), null);} assert.equal(await own(namespaces[n], ''), null);
    cleanup[n === 0 ? 'source' : 'target'] = true;
  } catch {cleanup[n === 0 ? 'source' : 'target'] = false; process.exitCode = 1;}
  try {for (const uid of users) await authAdmin('/accounts:delete?key=demo-api-key', {localId: uid}); assert.equal(((await authAdmin('/projects/demo-concert-seat-gd91-84/accounts:query', {})).userInfo ?? []).length, 0); cleanup.auth = true;}
  catch {cleanup.auth = false; process.exitCode = 1;}
  globalThis.fetch = originalFetch; assert.deepEqual(before, sourceHashes(root, files));
  fs.mkdirSync(new URL('artifacts/', root), {recursive: true}); fs.writeFileSync(new URL('artifacts/local-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before,
    reports, ...(failure ? {failure} : {}), observedLocal: b.snapshot(), cleanup,
    ownerSeededMinimalBusinessAndAuthorization: true, singleAuthEmulatorProject: true, independentCurrentCatalogAssumed: true,
    wholeCatalogRollbackDetected: false, routineBackupRecoveryVerified: false, formalBrowserImportVerified: false,
    realCredentialLifecycleVerified: false, externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
  console.log(JSON.stringify({reports: reports.length, cleanup, failure: failure ?? null}));
}
