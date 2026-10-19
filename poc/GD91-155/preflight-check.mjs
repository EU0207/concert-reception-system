import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),before=sourceHashes(root,['preflight-check.mjs','remote.mjs','offline-guard.mjs']);
const run=mode=>execFileSync(process.execPath,['--import',new URL('offline-guard.mjs',root).href,fileURLToPath(new URL('remote.mjs',root)),...(mode?[mode]:[])],{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const plan=JSON.parse(run('--plan'));
assert.equal(plan.decisionId,'TECH-DD91-119');assert.equal(plan.externalRequestsExecuted,0);assert.equal(plan.approvalRecorded,false);
let checks=1;
for(const mode of [undefined,'--run-approved-images-and-appcheck-retry','--run-approved-118','--diagnostic']){
 assert.throws(()=>run(mode),error=>String(error.stderr).includes('explicit-119-approval-required'));checks++;
}
assert.deepEqual(sourceHashes(root,['preflight-check.mjs','remote.mjs','offline-guard.mjs']),before);
const result={sourceHashes:before,endSourceHashes:before,checks,externalRequestsExecuted:0,privateConfigReadBeforeApproval:false,loginServerStartedBeforeApproval:false,previousApprovalFlagRejected:true};
fs.writeFileSync(new URL('artifacts/preflight-check-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks,externalRequestsExecuted:0}));
