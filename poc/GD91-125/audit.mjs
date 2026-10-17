import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
execFileSync(process.execPath,[fileURLToPath(new URL('../GD91-123/audit.mjs',import.meta.url))],{windowsHide:true,stdio:'pipe'});
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
let comparisons=0;
for(const name of ['../GD91-123/artifacts/remote-summary.json','../GD91-124/artifacts/local-summary.json','artifacts/app-check-plan-test-summary.json']){
  const r=read(name);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
  const base=name.startsWith('../GD91-123')?new URL('../GD91-123/',root):name.startsWith('../GD91-124')?new URL('../GD91-124/',root):root;
  for(const[p,h]of Object.entries(r.sourceHashes)){
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,base),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;
  }
}
const mocks=read('artifacts/app-check-plan-test-summary.json');assert.equal(mocks.reports.length,10);
assert.equal(mocks.externalRequestsExecuted,0);assert.equal(mocks.actualAppCheckEnforcementVerified,false);
const before=read('../GD91-123/artifacts/remote-summary.json');assert.equal(before.failure.httpStatus,401);
assert.equal(before.applicationCalls,32);assert.equal(before.googleAccountUsed,false);
assert(before.cleanup.appCheck.enforcementRestored&&before.cleanup.appCheck.debugTokensRemoved&&before.cleanup.appCheck.apiStateRestored);
const result={sourceComparisons:comparisons,httpContractAndMockCases:10,failedTrialGroups:0,
  failedTrialCleanupVerified:true,localMigrationModelGroups:7,realDatabaseMigrationVerified:false,
  proposedTrialExternalRequestsExecuted:0,actualAppCheckEnforcementVerified:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
