import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root = new URL('./', import.meta.url), result = JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json', root)));
assert.deepEqual(sourceHashes(root, Object.keys(result.sourceHashes)), result.sourceHashes);
assert.deepEqual(result.sourceHashes, result.endSourceHashes);
assert(!result.failure);
assert(Object.values(result.results).every(value => value === true));
assert.equal(Object.keys(result.results).length, 6);
assert(Object.values(result.cleanup).every(value => value === true));
assert.equal(result.authoritativeBootstrapVerified, false);
fs.writeFileSync(new URL('artifacts/audit-summary.json', root), JSON.stringify({sourceComparisons: Object.keys(result.sourceHashes).length,
  missingAuthorityFailsClosed: true, normalClientSelfInitializationDenied: true,
  wrongTrustedBootstrapIsAnUnresolvedLimit: true, cleanupComplete: true,
  authoritativeBootstrapVerified: false, crossProjectAuthenticationVerified: false,
  wholeProjectLossRecoveryVerified: false, externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({sourceComparisons: Object.keys(result.sourceHashes).length, limitationReproduced: true}));
