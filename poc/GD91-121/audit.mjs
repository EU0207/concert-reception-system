import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {generated} from '../GD91-116/generate.mjs';
const root=new URL('./',import.meta.url);let sourceComparisons=0;
const counts=process.argv.length>2?process.argv.slice(2).map(Number):[4,600,1000];assert(counts.length>0&&counts.every(x=>[4,600,1000].includes(x))&&new Set(counts).size===counts.length);
const digest=path=>createHash('sha256').update(fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const rules=JSON.parse(fs.readFileSync(new URL('database.rules.json',root)));assert.deepEqual(rules,generated());
const ruleHash=createHash('sha256').update(JSON.stringify(rules)).digest('hex'),reports=[];
for(const people of counts){
 const r=JSON.parse(fs.readFileSync(new URL('artifacts/capacity-'+people+'-summary.json',root)));assert(!r.failure);
 assert.equal(r.externalFirebaseConnected,false);assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);
 for(const proof of [r,r.tlsProxy]){assert.deepEqual(proof.sourceHashes,proof.endSourceHashes);for(const [p,h] of Object.entries(proof.sourceHashes)){assert.equal(digest(p),h,p);sourceComparisons++;}}
 assert.equal(r.emulatorMaintenance.rulesHash,ruleHash);assert.equal(r.reports.length,1);const x=r.reports[0];
 assert.equal(x.people,people);assert.equal(x.actualSdkEnvironments,6);assert.equal(x.snapshotPassesPerEnvironment,3);
 assert(x.normalRegistrationToIssuedQr&&x.closing.closedAndActualsNotSeeded&&x.closing.allNamesAndArrivalsPreserved);
 assert.equal(x.closing.registeredDevices,8);assert.deepEqual(x.reception.eventsPerEnvironment,Array(6).fill(people));assert.equal(x.reconnectEvents,0);
 const normal=Object.entries(r.restMeter).filter(([key])=>key.endsWith(':normal')),sum=key=>normal.reduce((n,[,b])=>n+b[key],0);
 assert.equal(r.httpsRouting.normalRouted,sum('requests'));assert(r.tlsProxy.connections>=6);assert(r.tlsProxy.tlsDownloadBytes>sum('responseBodyBytes'));
 reports.push({people,normalRestRequests:sum('requests'),completedRestResponseBodyBytes:sum('responseBodyBytes'),normalRestTransportErrors:sum('transportErrors'),
  tlsDownloadBytes:r.tlsProxy.tlsDownloadBytes,tlsUploadBytes:r.tlsProxy.tlsUploadBytes,connections:r.tlsProxy.connections,
  rootJsonBytes:r.postClosingRootJsonBytes,ownerPreconditionsExcluded:true,providerBillingMeasured:false,fullBusinessFreeTierVerified:false});
}
const complete=counts.length===3;
fs.writeFileSync(new URL('artifacts/'+(complete?'audit-summary':'partial-audit-summary')+'.json',root),JSON.stringify({sourceComparisons,allCurrentSourcesMatch:true,allPeopleMeasured:complete,rulesHash:ruleHash,reports,
 externalFirebaseConnected:false,fullBusinessFreeTierVerified:false},null,2)+'\n');console.log(JSON.stringify({sourceComparisons,reports}));
