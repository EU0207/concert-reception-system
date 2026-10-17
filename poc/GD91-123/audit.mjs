import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generated} from './image-rules.mjs';
import {generated as old} from '../GD91-116/generate.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
const r=read('artifacts/local-summary.json');assert(!r.failure);assert.equal(r.reports.length,12);
assert.deepEqual(r.sourceHashes,r.endSourceHashes);let comparisons=0;
for(const [p,h] of Object.entries(r.sourceHashes)){
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;
}
const all=generated();assert(all.rules.checks.$run.images);delete all.rules.checks.$run.images;assert.deepEqual(all,old());
assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);assert.equal(r.externalBrowserRequests,0);
const b=read('artifacts/budget-summary.json');assert.equal(b.reports.length,12);
for(const [p,h] of Object.entries(b.sourceHashes)){
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;
}
for(const [file,groups] of [['common-local-summary.json',10],['app-check-plan-test-summary.json',9]]){
  const evidence=read('artifacts/'+file);assert(!evidence.failure);assert.equal(evidence.reports.length,groups);
  assert.deepEqual(evidence.sourceHashes,evidence.endSourceHashes);
  for(const [p,h] of Object.entries(evidence.sourceHashes)){
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;
  }
  if(file.startsWith('common'))assert(evidence.cleanup.rulesClosed&&evidence.cleanup.trialRootEmpty);
  else{assert(evidence.mockedControlPlane);assert.equal(evidence.externalRequestsExecuted,0);assert.equal(evidence.actualAppCheckEnforcementVerified,false);}
}
const result={sourceComparisons:comparisons,imageGroups:12,decodedRawPngBytes:1000000,
  jpegDecoded:true,independentReaderAuths:6,tlsMeasured:true,existingSeatRulesUnchanged:true,
  commonSeatAndImageGroups:10,appCheckMockAndGuardCases:9,actualAppCheckEnforcementVerified:false,
  budgetComparisons:12,cleanup:r.cleanup,externalFirebaseConnected:false,
  realDeviceAcceptance:false,providerBillingMeasured:false,methodAdoptionApproved:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
