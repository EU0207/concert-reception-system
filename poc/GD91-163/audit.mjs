import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root = new URL('./', import.meta.url), summaries = ['model', 'local'].map(n => JSON.parse(fs.readFileSync(new URL('artifacts/' + n + '-summary.json', root))));
for (const result of summaries) {
  assert.deepEqual(sourceHashes(root, Object.keys(result.sourceHashes)), result.sourceHashes); assert.deepEqual(result.sourceHashes, result.endSourceHashes);
  assert(!result.failure); assert.equal(result.externalFirebaseConnected, false); assert.equal(result.productionImplementation, false);
}
const [model, local] = summaries; assert.equal(model.modelConditions, 33); assert.equal(local.reports.length, 7);
assert.deepEqual(local.reports.map(r => r.responseLossAfterStep), [-1, 0, 1, 2, 3, 4, 5]);
assert(local.reports.every(r => r.sourceAmendments === 2 && r.postRestoreAmendments === 3 && r.originalClosingAndDeletionBoundaryPreserved && r.maxReadableDatabases === 1 && r.sourceNormalReopenDenied && r.deletedReceiptsAbsent && r.targetDeviceStopEnforced));
assert.equal(local.metadataWrites.length, 42); assert(Object.values(local.cleanup).every(Boolean));
assert.equal(local.fullBrowserImportVerified, false); assert.equal(local.wholeProjectLossRecoveryVerified, false);
fs.writeFileSync(new URL('artifacts/audit-summary.json', root), JSON.stringify({sourceComparisons: summaries.reduce((n, s) => n + Object.keys(s.sourceHashes).length, 0),
  uniqueSourceFiles: new Set(summaries.flatMap(s => Object.keys(s.sourceHashes))).size, modelConditions: 33, emulatorCases: 7, allSourcesMatch: true,
  normalAmendmentsBeforeAndAfterRecovery: true, rulesUnchangedFrom159: true, metadataWrites: 42, cleanupComplete: true,
  formalBrowserImportVerified: false, wholeProjectLossRecoveryVerified: false, realCredentialLifecycleVerified: false,
  externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({modelConditions: 33, emulatorCases: 7, cleanupComplete: true}));
