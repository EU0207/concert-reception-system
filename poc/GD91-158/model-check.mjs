import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../GD91-128/conversion.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
import {inspect, recheckBeforePublication} from './restore-check.mjs';
const root = new URL('./', import.meta.url), files = ['model-check.mjs', 'restore-check.mjs'];
const before = sourceHashes(root, files), results = [];
const close = {FAKE: {operationId: 'FAKE-close', peopleCount: 1}};
const deletion = {operationId: 'FAKE-delete-1', scope: 'reception-details', deletedRoots: ['receipts', 'quarantine', 'closingRuns'],
  actualsHash: hash({P: {arrived: true}}), totalsHash: hash({part0: {arrived: 1}}), closingResultsHash: hash(close)};
const current = {status: 'available', schemaVersion: 1, performanceId: 'FAKE-performance', revision: 1,
  forbiddenExportIds: ['FAKE-old-export'], deletions: [deletion]};
const backup = {performanceId: 'FAKE-performance', exportId: 'FAKE-new-export', deletionRevision: 1,
  areas: {closingResults: close, retentionBoundary: {serverDeletionComplete: true, operationId: deletion.operationId,
    actualsHash: deletion.actualsHash, totalsHash: deletion.totalsHash, closingResultsHash: deletion.closingResultsHash}}};
const checked = inspect(backup, current);
assert.equal(recheckBeforePublication(backup, structuredClone(current), checked).ledgerHash, checked.ledgerHash);
for (const [label, change] of [
  ['current-ledger-absent', x => x.current = undefined],
  ['current-ledger-unavailable', x => x.current.status = 'unavailable'],
  ['other-performance', x => x.backup.performanceId = 'FAKE-other'],
  ['explicitly-forbidden-generation', x => x.backup.exportId = 'FAKE-old-export'],
  ['missing-deletion-revision', x => delete x.backup.deletionRevision],
  ['before-deletion-backup', x => x.backup.deletionRevision = 0],
  ['client-claims-newer-revision', x => x.backup.deletionRevision = 2],
  ['missing-deletion-boundary', x => delete x.backup.areas.retentionBoundary],
  ['other-deletion-operation', x => x.backup.areas.retentionBoundary.operationId = 'FAKE-old-delete'],
  ['deleted-receipt-restored', x => x.backup.areas.receipts = {FAKE: {eventId: 'FAKE-deleted'}}],
  ['deleted-quarantine-restored', x => x.backup.areas.quarantine = {FAKE: {eventId: 'FAKE-deleted'}}],
  ['deleted-closing-history-restored', x => x.backup.areas.closingRuns = {FAKE: {ack: true}}],
  ['altered-retention-baseline', x => x.backup.areas.retentionBoundary.actualsHash = '0'.repeat(64)],
  ['altered-closing-result', x => x.backup.areas.closingResults.FAKE.peopleCount = 2],
  ['unknown-deletion-scope', x => x.current.deletions[0].scope = 'individual-person'],
  ['duplicate-deletion-operation', x => x.current.deletions.push(structuredClone(deletion))],
  ['false-zero-ledger', x => {x.current.revision = 0; x.backup.deletionRevision = 0;}]
]) {
  const x = structuredClone({backup, current}); change(x);
  assert.throws(() => inspect(x.backup, x.current), {message: new RegExp('.')}, 'case:' + label); results.push(label);
}
const changedLedger = structuredClone(current); changedLedger.forbiddenExportIds.push('FAKE-additional-generation');
assert.throws(() => recheckBeforePublication(backup, changedLedger, checked), /ledger-changed/);
results.push('same-revision-ledger-content-changed');
const changedBackup = structuredClone(backup); changedBackup.areas.newFact = {reason: 'FAKE-new-data'};
assert.throws(() => recheckBeforePublication(changedBackup, current, checked), /backup-changed/);
results.push('backup-changed-after-inspection');
const advanced = structuredClone(current); advanced.revision++;
assert.throws(() => recheckBeforePublication(backup, advanced, checked));
results.push('deletion-advanced-before-publication');
const clean = {status: 'available', schemaVersion: 1, performanceId: 'FAKE-performance', revision: 0, forbiddenExportIds: [], deletions: []};
inspect({performanceId: clean.performanceId, exportId: 'FAKE-before-first-deletion', deletionRevision: 0, areas: {}}, clean);
assert.deepEqual(before, sourceHashes(root, files));
fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
fs.writeFileSync(new URL('artifacts/model-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before,
  rejectedCases: results, currentLedgerUnavailableFailsClosed: true, publicationRecheckModeled: true,
  nativeMigrationTransportVerified: false, rulesEnforcementVerified: false, ledgerAuthorityVerified: false,
  allDeletionScopesSupported: false, wholeEnvironmentLossRecoveryVerified: false,
  externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({modelPassed: true, rejectedCases: results.length, rulesEnforcementVerified: false}));
