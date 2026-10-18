import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',root)));
assert(!r.failure);assert.equal(r.reports.length,7);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);
for(const k of ['denyRulesInstalled','targetEmpty','sourceDocumentsCleared'])assert(r.cleanup[k]);assert.equal(r.cleanup.authUsersRemaining,0);
const first=JSON.parse(fs.readFileSync(new URL('artifacts/first-local-failure.json',root)));assert(first.failure);assert.equal(first.cleanup.authUsersRemaining,0);assert(first.cleanup.targetEmpty);
assert.equal(r.externalFirebaseConnected,false);assert.equal(r.allBusinessMigrationVerified,false);
const result={sourceComparisons:Object.keys(r.sourceHashes).length,groups:r.reports.length,authUsersRemaining:0,allBusinessMigrationVerified:false,externalFirebaseConnected:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
