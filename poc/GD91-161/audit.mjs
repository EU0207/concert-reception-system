import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root = new URL('./', import.meta.url);
const model = JSON.parse(fs.readFileSync(new URL('artifacts/model-summary.json', root)));
const local = JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json', root)));
for (const result of [model, local]) {
  assert.deepEqual(sourceHashes(root, Object.keys(result.sourceHashes)), result.sourceHashes);
  assert.deepEqual(result.sourceHashes, result.endSourceHashes); assert(!result.failure);
  assert.equal(result.realCredentialLifecycleVerified, false); assert.equal(result.externalFirebaseConnected, false);
}
assert.equal(model.cases.length, 37); assert(model.results.archiveSignatureActuallyVerified);
assert.equal(local.reports.length, 7); assert.deepEqual(local.reports.map(r => r.responseLossAfterStep), [-1, 0, 1, 2, 3, 4, 5]);
assert(local.reports.every(r => r.maxReadableDatabases === 1 && r.sourceNormalReopenDenied && r.retainedActualsPreserved && r.deletedReceiptsAbsent && r.staleEtagRejected && r.targetDeviceStopEnforced));
assert.equal(local.metadataWrites.length, 42);
assert(local.metadataWrites.every(w => /^restoreAuthorities\/[^/]+$/.test(w.path) || /^environments\/[^/]+\/performances\/[^/]+\/(restorePermit|restoreBinding)$/.test(w.path)));
assert(Object.values(local.cleanup).every(Boolean)); assert.equal(local.wholeProjectLossRecoveryVerified, false);
fs.writeFileSync(new URL('artifacts/audit-summary.json', root), JSON.stringify({sourceComparisons: Object.keys(model.sourceHashes).length + Object.keys(local.sourceHashes).length,
  uniqueSourceFiles: new Set([...Object.keys(model.sourceHashes), ...Object.keys(local.sourceHashes)]).size,
  modelCases: 37, emulatorCases: 7, metadataWrites: 42, allSourcesMatch: true, cleanupComplete: true,
  rulesUnchangedFrom159: true, realCredentialLifecycleVerified: false, wholeProjectLossRecoveryVerified: false,
  fullBrowserImportVerified: false, crossProjectAuthenticationVerified: false, externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({modelCases: 37, emulatorCases: 7, metadataWrites: 42, cleanupComplete: true}));
