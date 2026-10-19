import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../GD91-128/conversion.mjs';
import {exportBundle as prior} from '../GD91-148/bundle.mjs';
import {exportBundle, flatten, unflatten} from './bundle.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root = new URL('./', import.meta.url), before = sourceHashes(root, ['model-check.mjs']);
const source = {control: {state: 'closed', businessSchemaVersion: 3, layoutSchemaVersion: 2},
  closing: {meta: {phase: 'closed', operationId: 'FAKE-close'}},
  closingResults: {'FAKE-close': {operationId: 'FAKE-close', peopleCount: 1, deviceCount: 1}},
  actuals: {P: {attendeeId: 'P', name: '架空', arrived: false, closeOperationId: 'FAKE-close'}},
  actualTotals: {part0: {total: 1, arrived: 0}}, event: {people: {P: {active: true}}, profiles: {P: {name: '架空'}}},
  deviceRoster: {meta: {count: 1}, byOrder: {n0: 'FAKE-original-device'}, byId: {'FAKE-original-device': 0}},
  generations: {G: {meta: {phase: 'committed'}, refs: {R: true, 'publication-FAKE': true}}},
  references: {R: {schemaVersion: 3, generation: 'G', baseLayoutRevision: 1, deviceUid: 'FAKE-original-device', active: true,
    revision: 1, pendingOperationId: '', expectedEventRevision: 0, sourceControlRevision: 0}}};
const originalHash = hash(source), initial = exportBundle(source);
assert.equal(initial.sourceHash, prior(source).sourceHash);
function migrated(bundle, id) {
  const lease = {revision: 1, issuedAt: 1000, expiresAt: 2000, ownerDevice: 'FAKE-new-device', ownerHuman: 'FAKE-human'};
  return {...structuredClone(bundle.areas), importHead: id, activeImport: id,
    roles: {'FAKE-human': {active: true}}, devices: {'FAKE-new-device': {active: true}}, sessions: {'FAKE-new-device': {active: true}},
    deviceRoster: {meta: {count: 2}, byOrder: {n0: 'FAKE-new-device', n1: 'FAKE-another-device'}, byId: {'FAKE-new-device': 0, 'FAKE-another-device': 1}},
    imports: {[id]: {manifest: {format: bundle.format, sourceHash: bundle.sourceHash, sourceEnvironment: 'FAKE-source',
      performanceId: 'FAKE-performance', sourceState: 'closed', totalChunks: 1, ownerDevice: 'FAKE-new-device', ownerHuman: 'FAKE-human'},
    meta: {phase: 'cleaned', uploaded: 1, copied: 1, cleaned: 1, verifiedSourceHash: bundle.sourceHash},
    lease, leaseEvents: {r1: structuredClone(lease)}, receipt: {exportId: id, sourceHash: bundle.sourceHash,
      ownerDevice: 'FAKE-new-device', ownerHuman: 'FAKE-human', committedAt: 1500}}}};
}
const first = migrated(initial, 'FAKE-import-1');
assert.throws(() => prior(first), /unmapped-native-root/);
const firstHash = hash(first), second = exportBundle(first), thirdSource = migrated(second, 'FAKE-import-2'), third = exportBundle(thirdSource);
assert.equal(hash(first), firstHash);
assert.equal(hash(source), originalHash);
assert.equal(third.provenance.priorImportCount, 2);
assert.equal(hash(third.areas.migrationOrigins.sourceDeviceRoster), hash(source.deviceRoster));
assert.equal(third.areas.references.R.active, false);
for (const key of ['roles', 'devices', 'sessions', 'imports', 'importHead', 'activeImport', 'deviceRoster']) assert(!Object.hasOwn(third.areas, key));
assert.equal(hash(unflatten(second.areas.migrationOrigins.importArchives['FAKE-import-1'])), hash(first.imports['FAKE-import-1']));
assert.equal(hash(third.areas.migrationOrigins.importArchives['FAKE-import-1']), hash(second.areas.migrationOrigins.importArchives['FAKE-import-1']));
const rejected = [];
for (const [label, mutate] of [
  ['unfinished-import', s => s.imports[s.activeImport].meta.phase = 'published'],
  ['wrong-verified-hash', s => s.imports[s.activeImport].meta.verifiedSourceHash = '0'.repeat(64)],
  ['missing-lease-event', s => delete s.imports[s.activeImport].leaseEvents.r1],
  ['receipt-other-human', s => s.imports[s.activeImport].receipt.ownerHuman = 'FAKE-other'],
  ['wrong-current-lease', s => s.imports[s.activeImport].lease.expiresAt++],
  ['wrong-cleaned-count', s => s.imports[s.activeImport].meta.cleaned = 0],
  ['duplicate-lineage', s => {s.activeImport = s.importHead = 'FAKE-import-1'; s.imports = {'FAKE-import-1': structuredClone(first.imports['FAKE-import-1'])};}],
  ['lost-archive-index', s => delete s.migrationOrigins.importArchiveHashes],
  ['changed-archive-hash', s => s.migrationOrigins.importArchiveHashes['FAKE-import-1'] = '0'.repeat(64)],
  ['tampered-archive', s => {const records = s.migrationOrigins.importArchives['FAKE-import-1']; records[Object.keys(records)[0]] = 'FAKE-change';}],
  ['unknown-origin-field', s => s.migrationOrigins.unmappedHistory = {value: 'FAKE'}],
  ['old-historical-roster-missing', s => delete s.migrationOrigins.sourceDeviceRoster],
  ['new-secret-field', s => s.imports[s.activeImport].lease.token = 'FAKE-never-a-token'],
  ['post-purge-root', s => s.retentionBoundary = {serverDeletionComplete: true}],
  ['post-purge-amendments', s => s.actualAmendments = {FAKE: {arrived: true}}]
]) {
  const wrong = structuredClone(thirdSource); mutate(wrong);
  assert.throws(() => exportBundle(wrong), label); rejected.push(label);
}
for (const [label, records] of [
  ['prototype-path', {[Buffer.from(JSON.stringify(['__proto__', 'polluted'])).toString('hex')]: true}],
  ['leaf-prefix-collision', {[Buffer.from(JSON.stringify(['a'])).toString('hex')]: true, [Buffer.from(JSON.stringify(['a', 'b'])).toString('hex')]: true}],
  ['invalid-encoding', {'not-hex': true}]
]) {assert.throws(() => unflatten(records), label); rejected.push(label);}
assert.equal({}.polluted, undefined);
assert.deepEqual(unflatten(flatten({reason: '架空・改行\nを保持', flags: {yes: true, no: false}, zero: 0})), {reason: '架空・改行\nを保持', flags: {yes: true, no: false}, zero: 0});
assert.deepEqual(before, sourceHashes(root, ['model-check.mjs']));
fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
fs.writeFileSync(new URL('artifacts/model-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before,
  initialV2Unchanged: true, repeatedExportModel: true, archives: 2, rejectedInputs: rejected,
  originalRosterKept: true, originalUnmodified: true, authorizationNotCopied: true,
  modelOnly: true, staleBackupReactivationPrevented: false, externalFirebaseConnected: false}, null, 2) + '\n');
console.log(JSON.stringify({modelPassed: true, rejectedInputs: rejected.length}));
