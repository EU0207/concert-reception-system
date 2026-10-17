import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',root)));assert.deepEqual(r.sourceHashes,r.endSourceHashes);
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);
assert.equal(r.reports.length,6);assert.equal(r.externalRequests,0);assert.equal(r.dbRequests,0);assert(r.isolatedProfileRemoved&&r.realBrowserIndexedDb);
const result={sourceComparisons:Object.keys(r.sourceHashes).length,groups:6,realIndexedDbVerified:true,externalRequests:0,dbRequests:0,actualSdkAdapterSwitchVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
