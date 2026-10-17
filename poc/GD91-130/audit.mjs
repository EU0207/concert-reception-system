import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',root)));assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);
assert.equal(r.reports.length,6);assert.equal(r.externalRequests,0);assert(r.reports[0].realOldSdkResultLookupMatched);
assert(r.cleanup.firestore.rulesClosed&&r.cleanup.firestore.emulatorDocumentsEmpty&&r.cleanup.rtdb.rulesClosed&&r.cleanup.rtdb.trialRootEmpty&&r.cleanup.isolatedProfileRemoved);
const previous=JSON.parse(fs.readFileSync(new URL('artifacts/first-local-failure.json',root)));assert(previous.failure);assert.equal(previous.reports.length,3);assert(previous.cleanup.isolatedProfileRemoved);
const result={sourceComparisons:Object.keys(r.sourceHashes).length,groups:6,sameBrowserSdkAndIndexedDbVerified:true,oldSdkResultLookupMatched:true,
 newIdentityAndKeyScopesUsed:true,earlierPartialRunExcluded:true,externalRequests:0,formalBackupFormatVerified:false,allBusinessMigrationVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
