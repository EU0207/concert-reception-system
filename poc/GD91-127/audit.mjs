import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {generated} from '../GD91-126/contract-rules.mjs';
const root=new URL('./',import.meta.url),counts=process.argv.length>2?process.argv.slice(2).map(Number):[4,600,1000];let comparisons=0;
assert(counts.length&&counts.every(x=>[4,600,1000].includes(x))&&new Set(counts).size===counts.length);
const rules=JSON.parse(fs.readFileSync(new URL('database.rules.json',root)));assert.deepEqual(rules,generated());const ruleHash=createHash('sha256').update(JSON.stringify(rules)).digest('hex'),reports=[];
for(const people of counts){const r=JSON.parse(fs.readFileSync(new URL('artifacts/capacity-'+people+'-summary.json',root)));assert(!r.failure&&r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);
 for(const proof of[r,r.tlsProxy]){assert.deepEqual(proof.sourceHashes,proof.endSourceHashes);for(const[p,h]of Object.entries(proof.sourceHashes)){assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;}}
 assert.equal(r.emulatorMaintenance.rulesHash,ruleHash);assert.equal(r.reports.length,1);const x=r.reports[0];assert.equal(x.people,people);assert.equal(x.actualSdkEnvironments,6);
 assert.equal(x.closing.registeredDevices,8);assert.equal(x.sections,people===4?2:16);assert.equal(x.nonSeatCells+people,people===4?8:4096);assert(x.normalRegistrationToIssuedQr&&x.closing.allNamesAndArrivalsPreserved);
 assert.deepEqual(x.reception.eventsPerEnvironment,Array(6).fill(people));assert.equal(x.ownerPersonOrTicketWrites,0);assert.equal(x.reconnectEvents,0);
 assert.equal(r.qrFormatVerification.created,people);assert.equal(r.qrFormatVerification.checked,people);assert(r.qrFormatVerification.ordinaryRandomGenerationUsed);
 const normal=Object.entries(r.restMeter).filter(([p])=>p.endsWith(':normal')),sum=k=>normal.reduce((n,[,b])=>n+b[k],0);
 assert.equal(sum('requests'),r.httpsRouting.normalRouted);assert(r.tlsProxy.tlsDownloadBytes>sum('responseBodyBytes'));
 assert.equal(sum('transportErrors'),x.normalGetRetries+x.resultLookups);assert.equal(x.sameIdResendWrites,0);
 reports.push({people,normalRestRequests:sum('requests'),tlsDownloadBytes:r.tlsProxy.tlsDownloadBytes,tlsUploadBytes:r.tlsProxy.tlsUploadBytes,
  rootJsonBytes:r.postClosingRootJsonBytes,normalTransportErrors:sum('transportErrors'),normalGetRetries:x.normalGetRetries,resultLookups:x.resultLookups,sameIdResendWrites:x.sameIdResendWrites,
  qrBytes:16,qrCharacters:22,codeCharacters:8,sourceGeometryOwnerPreconditionsExcluded:true,providerBillingMeasured:false});
}
const result={sourceComparisons:comparisons,allCurrentSourcesMatch:true,allPeopleMeasured:counts.length===3,rulesHash:ruleHash,reports,externalFirebaseConnected:false,allBusinessRegressionVerified:false,fullBusinessFreeTierVerified:false};
fs.writeFileSync(new URL('artifacts/'+(counts.length===3?'audit-summary':'partial-audit-summary')+'.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
