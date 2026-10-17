import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {generated} from '../GD91-116/generate.mjs';
const root=new URL('./',import.meta.url),hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const ruleHash=createHash('sha256').update(JSON.stringify(generated())).digest('hex');let comparisons=0;const reports=[];
for(const people of [600,1000]){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/maximum-'+people+'-summary.json',root)));assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const [p,h] of Object.entries(r.sourceHashes)){assert.equal(hash(p),h,p);comparisons++;}
 const x=r.result;assert.equal(x.people,people);assert.equal(x.seatRecords,people);assert.equal(x.attendeeRecords,0);
 assert.equal(x.sections,16);assert.equal(x.numberingLinesPerSection,256);assert.equal(x.cells,4096);assert.equal(x.parts,256);
 assert(x.allCellFieldsPreserved&&x.uniqueLabels&&x.bothAxes&&x.bothOrders);assert.equal(x.cachedGenerationReads,0);assert(x.maxWriteJsonBytes<1048576);
 assert.equal(x.maintenance.rulesHash,ruleHash);assert(x.maintenance.boundaries.every(b=>b.applicationDataHashUnchanged&&b.exactRulesRestored));assert.equal(x.maintenance.measuredMaxHeapBytes,8589934592);
 assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);assert(!r.externalFirebaseConnected&&!r.productionImplementation);
 reports.push({people,cells:x.cells,sections:x.sections,numberingLinesPerSection:x.numberingLinesPerSection,maxWriteJsonBytes:x.maxWriteJsonBytes,generationJsonBytes:x.generationJsonBytes,snapshotRequests:x.snapshotRequests,normalRequests:x.normalRequests,serverAccepted:true,realSdkUsed:false});
}
const addition=JSON.parse(fs.readFileSync(new URL('artifacts/addition-summary.json',root)));assert(!addition.failure);assert.deepEqual(addition.sourceHashes,addition.endSourceHashes);
for(const [p,h] of Object.entries(addition.sourceHashes)){assert.equal(hash(p),h,p);comparisons++;}
assert.deepEqual(addition.reports.map(x=>x.people),[600,1000]);assert.deepEqual(addition.reports.map(x=>x.initialParts),[38,63]);assert.deepEqual(addition.reports.map(x=>x.finalParts),[39,64]);
assert(addition.reports.every(x=>x.partialPublicationRefused&&x.oldSeatIdsAndFieldsPreserved&&x.seatIdsAndNumbersUnique&&x.attendeeRecords===0));
assert(addition.cleanup.rulesClosed&&addition.cleanup.trialRootEmpty);
const own=sourceHashes(root,['audit.mjs']);
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify({sourceHashes:own,endSourceHashes:own,sourceComparisons:comparisons,reports,
 additionGroups:addition.reports,executedRulesHash:ruleHash,externalFirebaseConnected:false,fullBusinessFreeTierVerified:false,productionImplementation:false,tested3000People:false},null,2)+'\n');
console.log(JSON.stringify({sourceComparisons:comparisons,reports,fullBusinessFreeTierVerified:false}));
