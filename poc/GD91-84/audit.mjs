import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(new URL('artifacts/'+name,import.meta.url),'utf8'));
const names=['local-summary.json','stream-summary.json','stream-fence-summary.json','stream-check-summary.json','stream-check-fence-summary.json','remote-expiry-baseline-summary.json','remote-expiry-data-revision-summary.json'];let checked=0;
for(const name of names){const report=read(name);assert.equal(report.failure,undefined,name);assert.deepEqual(report.sourceHashes,report.endSourceHashes);
  for(const[file,expected]of Object.entries(report.sourceHashes)){assert.equal(hash(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n')),expected,file);checked++;}
  const remote=name.startsWith('remote-');assert.equal(report.error,undefined,name);
  if(remote){assert.deepEqual(report.cleanup,{rulesClosed:true,rootsEmpty:true,usersDeleted:4,authRestored:true,authUsersRemaining:0,billingAccountUnlinked:true});assert(report.applicationCalls<=200);assert.equal(report.applicationCalls,report.ownerAndManagementCalls+report.normalCalls+report.sdkApplicationCalls);assert.equal(report.sdkInternalWireRequestsMeasured,false);assert.equal(report.verificationMailFlowTested,false);}
  else assert.deepEqual(report.cleanup,{rulesClosed:true,trialRootEmpty:true});
  assert.equal(report.externalFirebaseConnected,remote);
  for(const key of ['productionAuthorizationVerified','productionFreeTierVerified','tested3000'])assert.equal(report[key],false);
  function scan(value){if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){assert(!/^(uid|humanUid|deviceUid|apiKey|token|idToken|refreshToken|password|email|privateKey|authorization|projectId|projectNumber|appId|databaseURL)$/i.test(k),name+':'+k);scan(v);}if(typeof value==='string')assert(!/AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN|crs-authcheck-|[\w.+-]+@[\w.-]+\.[a-z]+/i.test(value));}scan(report);
}
const main=read('local-summary.json');assert.equal(main.reports.length,32);assert.equal(new Set(main.reports.map(x=>x.id)).size,32);
const capacity=main.reports.filter(x=>x.id.startsWith('C-'));assert.equal(capacity.length,4);
for(const r of capacity){assert([600,1000].includes(r.people));assert([2,16].includes(r.sections));assert.equal(r.cells,r.people*2);assert(r.maxLayoutPartBytes<=65536&&r.maxRosterPartBytes<=65536);assert(r.maxRequestBytes<16*1024*1024);assert(r.headBytes<=128);assert.equal(r.preparation.ownerRequests,0);assert.equal(r.fullBusinessBudgetVerified,false);}
for(const name of names.filter(x=>x.startsWith('stream')||x.startsWith('remote-'))){const r=read(name);assert.equal(r.reports.length,6);assert.deepEqual(r.reports.map(x=>x.kind),['role','device','session','control','session-expiry','role-expiry']);const fenced=r.ruleVariant==='data-revision';
  const rules=JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'));if(fenced)rules.rules.checks.$run.probes.general['.read']+=' && data.child(\'revision\').isNumber() && data.child(\'revision\').val() > 0';assert.equal(hash(rules),r.deployedRulesHash);
  for(const c of r.reports){assert.equal(c.currentRestStatus,401);assert.equal(c.serverRejectionVerified,!c.kind.endsWith('expiry')||fenced);if(c.kind!=='control')assert.equal(c.otherContinues,true);assert.equal(c.roleAndSessionExpiryCoincide,c.kind==='role-expiry');if(c.kind.endsWith('expiry')){assert.equal(c.postInvalidationDataReceived,!fenced);assert.equal(c.restStreamPostInvalidationDataReceived,!fenced);assert.equal(c.cancelledBeforePayload,false);assert.equal(c.explicitRevocationStopsBoth,true);}else assert.equal(c.serverRejectionVerified,true);}
  assert.equal(r.allComparedRevocationsVerified,fenced);if(name.startsWith('stream-check')||name.startsWith('remote-')){assert.equal(r.subjectsCreated,4);assert(r.peakNodes<=150);}
}
const remoteBaseline=read('remote-expiry-baseline-summary.json'),remoteRevision=read('remote-expiry-data-revision-summary.json');
assert.equal(remoteBaseline.priorPreflightCalls,7);assert.equal(remoteRevision.priorPreflightCalls,0);
assert.equal(remoteBaseline.expiryWindowMs,10000);assert.equal(remoteRevision.expiryWindowMs,10000);
const externalApplicationCalls=remoteBaseline.applicationCalls+remoteRevision.applicationCalls;assert(externalApplicationCalls<=400);
console.log(JSON.stringify({integratedGroups:32,streamComparisons:6,variants:2,sourceHashesVerified:checked,baselineTimeExpiryRejected:false,revisionVariantRejectsNewDataLocally:true,externalExpiryChecked:true,externalApplicationCalls,revisionVariantRejectsNewDataExternally:true,productionAdoptionApproved:false,issue167Complete:false}));
