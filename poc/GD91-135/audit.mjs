import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {generated} from '../GD91-126/contract-rules.mjs';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/numbering-regression-summary.json',root)));assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);
assert.equal(r.progress.length,14);assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty&&r.realSdkReadAndWriteUsed);assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',root))),generated());
const result={sourceComparisons:Object.keys(r.sourceHashes).length,groups:14,realSdkReadAndWriteUsed:true,rulesExactlyMatch126:true,externalFirebaseConnected:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
