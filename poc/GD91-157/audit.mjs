import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root = new URL('./', import.meta.url);
let comparisons = 0;
for (const name of ['local-summary.json', 'model-summary.json']) {
  const result = JSON.parse(fs.readFileSync(new URL('artifacts/' + name, root)));
  const actual = sourceHashes(root, Object.keys(result.sourceHashes));
  assert.deepEqual(actual, result.sourceHashes, 'source:' + name);
  assert.deepEqual(result.sourceHashes, result.endSourceHashes, 'end-source:' + name);
  comparisons += Object.keys(actual).length;
  assert.equal(result.externalFirebaseConnected, false);
  if (name === 'local-summary.json') {
    assert(!result.failure);
    assert.equal(result.hops.length, 3);
    assert.equal(result.rejectedInputs.length, 27);
    assert(Object.values(result.cleanup).every(value => value === true));
    assert(result.hops.every(h => h.correctionsReplayed === 1 && h.oldAuthorizationNotCopied && h.stoppedReadDenied));
    assert.deepEqual(result.hops.map(h => h.importedPriorArchives), [0, 1, 2]);
    assert.equal(result.postPurgeRemigrationVerified, false);
    assert.equal(result.staleBackupReactivationPrevented, false);
  } else assert.equal(result.rejectedInputs.length, 18);
}
fs.writeFileSync(new URL('artifacts/audit-summary.json', root), JSON.stringify({sourceComparisons: comparisons,
  nativePrePurgeThreeHopsVerified: true, postPurgeRemigrationVerified: false,
  staleBackupReactivationPrevented: false, externalFirebaseConnected: false,
  productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({sourceComparisons: comparisons, nativePrePurgeThreeHopsVerified: true}));
