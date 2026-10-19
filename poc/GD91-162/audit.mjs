import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root = new URL('./', import.meta.url), summaries = ['model', 'local'].map(n => JSON.parse(fs.readFileSync(new URL('artifacts/' + n + '-summary.json', root))));
for (const result of summaries) {
  assert.deepEqual(sourceHashes(root, Object.keys(result.sourceHashes)), result.sourceHashes); assert.deepEqual(result.sourceHashes, result.endSourceHashes);
  assert(!result.failure); assert.equal(result.externalFirebaseConnected, false); assert.equal(result.productionImplementation, false);
  assert.equal(result.wholeCatalogRollbackDetected, false); assert.equal(result.routineBackupRecoveryVerified, false);
}
const [model, local] = summaries; assert.equal(model.modelConditions, 24); assert.equal(local.reports.length, 5);
assert.deepEqual(local.reports.map(r => r.stop), ['normal', 'before-intent', 'after-intent', 'after-authority', 'after-permit']);
assert(local.reports.every(r => r.bothBusinessDatabasesLost && r.independentCatalogSurvived && r.normalEarlyActivationDenied && r.catalogConsumedBeforeActivation && r.oldCertificateReuseDenied && r.sourceDatabaseEmpty && r.deletedReceiptAbsent && r.deviceStopEnforced));
assert(local.reports.every(r => r.sourceNormalAmendments === 2 && r.restoredNormalAmendments === (r.targetWasReadableBeforeDeviceStop ? 3 : 2)));
assert(Object.values(local.cleanup).every(Boolean));
fs.writeFileSync(new URL('artifacts/audit-summary.json', root), JSON.stringify({sourceComparisons: summaries.reduce((n, s) => n + Object.keys(s.sourceHashes).length, 0),
  uniqueSourceFiles: new Set(summaries.flatMap(s => Object.keys(s.sourceHashes))).size, modelConditions: 24, emulatorCases: 5, allSourcesMatch: true, cleanupComplete: true,
  independentCurrentCatalogAssumed: true, wholeCatalogRollbackDetected: false, routineBackupRecoveryVerified: false,
  realCredentialLifecycleVerified: false, externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({modelConditions: 24, emulatorCases: 5, limitationsPreserved: true}));
