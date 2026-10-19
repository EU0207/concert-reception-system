import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',root)));
assert.deepEqual(r.sourceHashes,r.endSourceHashes);assert.equal(r.reports.length,11);
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);
assert.equal(r.reports.find(x=>x.id==='C04-unsupported-boundaries').rejectedInputs,18);
assert.equal(r.reports.find(x=>x.id==='C05-activation-coverage').rejectedProofs,45);assert.equal(r.allBusinessMigrationVerified,false);
const result={sourceComparisons:Object.keys(r.sourceHashes).length,groups:11,rejectedInputs:18,rejectedActivationProofs:45,realDatabaseTransferVerified:false,allBusinessMigrationVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
