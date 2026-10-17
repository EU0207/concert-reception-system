import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {generated} from '../GD91-116/generate.mjs';
const root=new URL('./',import.meta.url),hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const ruleHash=createHash('sha256').update(JSON.stringify(generated())).digest('hex');let comparisons=0;const reports=[];
for(const people of [600,1000]){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/late-edits-'+people+'-summary.json',root)));assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 for(const [p,h] of Object.entries(r.sourceHashes)){assert.equal(hash(p),h,p);comparisons++;}
 assert.equal(r.people,people);assert.equal(r.reports.length,3);assert.equal(r.executedRulesHash,ruleHash);assert.equal(r.maintenance.rulesHash,ruleHash);
 assert(r.reports[0].wholeEventUnchanged&&r.reports[1].realRestResponseSocketDropped&&r.reports[1].sameIdResultLookup);
 assert.equal(r.reports[1].writeResendCount,0);assert(r.reports[1].acrossStorageParts&&r.reports[2].ticketAndQrDataUnchanged&&r.reports[2].losingReservationRetained);
 assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);assert(r.fixturePeopleAndTicketsSeededByOwner);
 const operations=Object.entries(r.phaseMapping).map(([phase,id])=>({id,...r.restMeter[phase+':normal']}));
 assert(operations.every(x=>x.transportErrors===0));
 reports.push({people,maxCommitBytes:r.maxCommitBytes,operations,normalRegistrationSeededNotMeasuredHere:true,realSdkFanoutNotMeasuredHere:true});
}
const own=sourceHashes(root,['audit.mjs']);
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify({sourceHashes:own,endSourceHashes:own,sourceComparisons:comparisons,reports,
 executedRulesHash:ruleHash,externalFirebaseConnected:false,fullBusinessFreeTierVerified:false,productionImplementation:false},null,2)+'\n');
console.log(JSON.stringify({sourceComparisons:comparisons,people:reports.map(x=>x.people),operationGroups:6,fullBusinessFreeTierVerified:false}));
