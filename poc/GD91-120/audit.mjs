import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);let sourceComparisons=0;
function read(name){
 const result=JSON.parse(fs.readFileSync(new URL('artifacts/'+name,root)));
 assert(!result.failure,name);assert.equal(result.externalFirebaseConnected,false);
 for(const proof of [result,result.tlsProxy].filter(Boolean)){
  assert.deepEqual(proof.sourceHashes,proof.endSourceHashes,name);
  for(const [path,expected] of Object.entries(proof.sourceHashes)){
   const actual=createHash('sha256').update(fs.readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n')).digest('hex');
   assert.equal(actual,expected,path);sourceComparisons++;
  }
 }
 return result;
}
const transport=read('transport-summary.json'),direct=read('direct-summary.json');
assert.equal(transport.reports.length,7);assert.equal(direct.reports.length,3);
assert(transport.temporaryCertificateRemoved&&direct.temporaryCertificateRemoved);
const reports=[];
for(const people of [4,600,1000]){
 const r=read('sdk-'+people+'-summary.json');assert.equal(r.people,people);
 assert(r.transportFixtureOnly&&!r.businessAuthorizationVerifiedHere);
 assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);
 assert.deepEqual(r.reports.map(x=>x.id),['six-snapshots','six-listeners','six-repeat-snapshots','six-cold-reopen']);
 assert.deepEqual(r.reports[1].eventsPerEnvironment,Array(6).fill(people));
 assert.equal(r.reports[3].replayedEvents,0);assert(r.reports[3].sameClientGoOnlineNotVerified);
 assert.equal(r.tlsProxy.connections,12);assert.equal(r.tlsProxy.providerBillingMeasured,false);
 const phaseTotal=r.reports.reduce((n,x)=>n+x.wire.tlsDownloadBytes,0);
 assert(r.tlsProxy.tlsDownloadBytes>=phaseTotal);
 reports.push({people,phaseBytes:Object.fromEntries(r.reports.map(x=>[x.id,x.wire.tlsDownloadBytes])),totalTlsDownloadBytes:r.tlsProxy.tlsDownloadBytes,
  phaseBoundaryRemainderBytes:r.tlsProxy.tlsDownloadBytes-phaseTotal,sameClientGoOnlineVerified:false});
}
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify({sourceComparisons,transportCases:10,reports,
 allCurrentSourcesMatch:true,externalFirebaseConnected:false,fullBusinessFreeTierVerified:false},null,2)+'\n');
console.log(JSON.stringify({sourceComparisons,transportCases:10,sdkCases:12,fullBusinessFreeTierVerified:false}));
