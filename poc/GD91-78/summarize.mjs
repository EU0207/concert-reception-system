import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir=new URL('artifacts/',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const hash=p=>createHash('sha256').update(read(p)).digest('hex');
for(const name of['watch-summary.json','lifecycle-summary.json']){
  if(fs.existsSync(new URL(name,dir))){
    const existing=JSON.parse(read('artifacts/'+name));
    assert(existing.suitePassed===false,'new-successful-run-must-not-be-replaced-with-a-prior-failure');
  }
}
const matches=r=>r.sourceHashes&&r.endSourceHashes&&JSON.stringify(r.sourceHashes)===JSON.stringify(r.endSourceHashes)
  &&Object.entries(r.sourceHashes).every(([p,h])=>hash(p)===h);
const input=fs.readdirSync(dir).filter(p=>/^failed-\d+\.json$/.test(p)).sort().reverse()
  .map(p=>({path:'artifacts/'+p,value:JSON.parse(read('artifacts/'+p))}))
  .find(({value:r})=>matches(r)&&r.reports.some(x=>x.people===600)&&!r.reports.some(x=>x.people===1000));
assert(input,'matching-failed-scale-run-required');
const failed=input.value.clients.slice(-6);assert.equal(failed.length,6);assert(failed.some(x=>x.records!==1000));
const reports=[...input.value.reports,{id:'L-1000',status:'failed',people:1000,expectedByEach:1000,
  receivedByEach:failed.map(x=>x.records),stats:failed.map(x=>x.stats),error:input.value.error,
  rootCauseConfirmed:false,observationTimeoutMs:60000}];
const sourceHashes={...input.value.sourceHashes,'summarize.mjs':hash('summarize.mjs'),[input.path]:hash(input.path)};
const summary={sourceHashes,endSourceHashes:sourceHashes,reports,sourceFailure:input.path,
  unexecutedLifecycleCases:['offline-reconnect','stop-resume','role-revocation','performance-stop','save-failure','equal-timestamp-boundary','scope-mismatch'],
  suitePassed:false,productionFreeTierVerified:false,normalRegistrationVerified:false,realDeviceVerified:false,
  durableJournalVerified:false,sharingLatencyRequirementVerified:false,wireBytesMeasured:false,
  sdkAuthRefreshVerified:false,historicalDirectApiSecurityVerified:false,tested3000:false};
fs.writeFileSync(new URL('artifacts/watch-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({sourceFailure:input.path,passed:reports.filter(x=>x.status==='passed').length,failed:1,receivedAt1000:failed.map(x=>x.records),suitePassed:false}));
const lifecycleInput=fs.readdirSync(dir).filter(p=>/^failed-lifecycle-\d+\.json$/.test(p)).sort().reverse()
  .map(p=>({path:'artifacts/'+p,value:JSON.parse(read('artifacts/'+p))}))
  .find(({value:r})=>Object.entries(r.sourceHashes??{}).every(([p,h])=>hash(p)===h)&&r.reports.length===2);
assert(lifecycleInput,'matching-failed-lifecycle-run-required');
const lifecycle={sourceHashes:{...lifecycleInput.value.sourceHashes,'summarize.mjs':hash('summarize.mjs'),
    [lifecycleInput.path]:hash(lifecycleInput.path)},
  reports:[...lifecycleInput.value.reports,{id:'S-dependent-role-revocation',status:'failed',error:lifecycleInput.value.error,
    observationTimeoutMs:15000,rootCauseConfirmed:false}],sourceFailure:lifecycleInput.path,
  unexecutedCases:['performance-stop','save-failure','equal-timestamp-boundary','scope-mismatch'],
  fixturePeople:10,suitePassed:false,productionFreeTierVerified:false,durableJournalVerified:false,
  historicalDirectApiSecurityVerified:false,tested3000:false};
fs.writeFileSync(new URL('artifacts/lifecycle-summary.json',import.meta.url),JSON.stringify(lifecycle,null,2)+'\n');
console.log(JSON.stringify({lifecyclePassed:2,lifecycleFailed:1,suitePassed:false}));
