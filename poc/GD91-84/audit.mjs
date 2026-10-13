import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(new URL('artifacts/'+name,import.meta.url),'utf8'));
const names=['local-summary.json','stream-summary.json','stream-fence-summary.json','stream-check-summary.json','stream-check-fence-summary.json'];let checked=0;
for(const name of names){const report=read(name);assert.equal(report.failure,undefined,name);assert.deepEqual(report.sourceHashes,report.endSourceHashes);
  for(const[file,expected]of Object.entries(report.sourceHashes)){assert.equal(hash(fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n')),expected,file);checked++;}
  assert.deepEqual(report.cleanup,{rulesClosed:true,trialRootEmpty:true});
  for(const key of ['externalFirebaseConnected','productionAuthorizationVerified','productionFreeTierVerified','tested3000'])assert.equal(report[key],false);
  function scan(value){if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){assert(!/^(uid|token|idToken|refreshToken|password|email|privateKey|authorization|projectId|databaseURL)$/i.test(k),name+':'+k);scan(v);}if(typeof value==='string')assert(!/AIza[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|-----BEGIN|crs-authcheck-/.test(value));}scan(report);
}
const main=read('local-summary.json');assert.equal(main.reports.length,32);assert.equal(new Set(main.reports.map(x=>x.id)).size,32);
const capacity=main.reports.filter(x=>x.id.startsWith('C-'));assert.equal(capacity.length,4);
for(const r of capacity){assert([600,1000].includes(r.people));assert([2,16].includes(r.sections));assert.equal(r.cells,r.people*2);assert(r.maxLayoutPartBytes<=65536&&r.maxRosterPartBytes<=65536);assert(r.maxRequestBytes<16*1024*1024);assert(r.headBytes<=128);assert.equal(r.preparation.ownerRequests,0);assert.equal(r.fullBusinessBudgetVerified,false);}
for(const name of names.filter(x=>x.startsWith('stream'))){const r=read(name);assert.equal(r.reports.length,6);const fenced=r.ruleVariant==='data-revision';
  const rules=JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'));if(fenced)rules.rules.checks.$run.probes.general['.read']+=' && data.child(\'revision\').isNumber() && data.child(\'revision\').val() > 0';assert.equal(hash(rules),r.deployedRulesHash);
  for(const c of r.reports){assert.equal(c.currentRestStatus,401);if(c.kind.endsWith('expiry')){assert.equal(c.postInvalidationDataReceived,!fenced);assert.equal(c.restStreamPostInvalidationDataReceived,!fenced);assert.equal(c.cancelledBeforePayload,false);assert.equal(c.explicitRevocationStopsBoth,true);}else assert.equal(c.serverRejectionVerified,true);}
  assert.equal(r.allComparedRevocationsVerified,fenced);if(name.startsWith('stream-check')){assert.equal(r.subjectsCreated,4);assert(r.peakNodes<=150);}
}
console.log(JSON.stringify({integratedGroups:32,streamComparisons:6,variants:2,sourceHashesVerified:checked,baselineTimeExpiryRejected:false,revisionVariantRejectsNewDataLocally:true,externalExpiryChecked:false,productionAdoptionApproved:false,issue167Complete:false}));
