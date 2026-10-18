import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',root)));
assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
for(const [p,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);
assert.equal(r.reports.length,11);assert(r.cleanup.firestoreDenyAllInstalled&&r.cleanup.rtdbDenyAllInstalled&&r.cleanup.rtdbSourceEmpty&&r.cleanup.authUsersRemaining===0);
assert(r.reports.find(x=>x.id.startsWith('X01')).expectedArchiveStillReadable);assert(r.reports.find(x=>x.id.startsWith('X02')).fakeHashAcceptedAfterExplicitGrant);
const out={sourceComparisons:Object.keys(r.sourceHashes).length,groups:r.reports.length,localDeviceStopAndRoleRevokeVerified:true,normalSessionIssuance:true,
 crossDatabaseRevocationVerified:false,crossDatabaseSourceHashVerified:false,allHistoryDeletionVerified:false,externalFirebaseConnected:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
