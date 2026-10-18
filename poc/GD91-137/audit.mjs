import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/budget-summary.json',root)));
assert.deepEqual(r.sourceHashes,r.endSourceHashes);for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);
assert.equal(r.reports.length,288);assert(r.retainedUntilExplicitDeletion&&!r.operationalLimitsApproved&&!r.providerBillingMeasured);
assert(r.reports.filter(x=>x.pastPerformances===600).every(x=>!x.unifiedAllFit&&!x.dividedAllFit));
assert(r.reports.every(x=>x.firestoreCentered.allFit===null&&x.firestoreCentered.activeBusinessReads===null));
const result={sourceComparisons:Object.keys(r.sourceHashes).length,comparisons:288,candidates:3,firestoreCenteredCurrentBusinessScenarioMeasured:false,unlimitedRetentionFitsFreeTier:false,providerBillingMeasured:false,externalFirebaseConnected:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
