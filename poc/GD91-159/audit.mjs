import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root = new URL('./', import.meta.url);
let comparisons = 0;
const uniqueSources = new Set();
const local = JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json', root)));
for (const name of ['local-summary.json', 'contract-summary.json']) {
  const result = JSON.parse(fs.readFileSync(new URL('artifacts/' + name, root)));
  const actual = sourceHashes(root, Object.keys(result.sourceHashes));
  assert.deepEqual(actual, result.sourceHashes, 'source:' + name);
  assert.deepEqual(result.sourceHashes, result.endSourceHashes);
  comparisons += Object.keys(actual).length;
  for (const file of Object.keys(actual)) uniqueSources.add(file);
  assert.equal(result.externalFirebaseConnected, false);
}
assert(!local.failure);
assert.equal(local.reports.length, 7);
assert.equal(local.denialCases.length, 25);
assert(Object.values(local.cleanup).every(value => value === true));
assert(local.protectionCounts.exactInverseMatched);
assert(local.rulesBytes < 10485760);
assert(local.reports.some(r => r.id === 'E07-retained-actuals-amendments' && r.retainedBaseHashMatched));
fs.writeFileSync(new URL('artifacts/audit-summary.json', root), JSON.stringify({sourceComparisons: comparisons, uniqueSourceFiles: uniqueSources.size,
  sameDatabaseRepresentativeGroups: 7, deniedCases: local.denialCases.length, cleanupComplete: true,
  generatedRulesBytes: local.rulesBytes, ruleHeadroomBytes: 10485760 - local.rulesBytes,
  protectedReads: local.protectionCounts.readCount, protectedWrites: local.protectionCounts.writeCount,
  oldPermissionsPreservedAsConjuncts: true, wrongTrustedBootstrapExcluded: true,
  authoritativeBootstrapVerified: false, postPurgeRemigrationVerified: false, normalAbortCleanupVerified: false,
  crossDatabaseAuthorityVerified: false, wholeProjectLossRecoveryVerified: false,
  externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({sourceComparisons: comparisons, uniqueSourceFiles: uniqueSources.size, groups: 7, deniedCases: local.denialCases.length}));
