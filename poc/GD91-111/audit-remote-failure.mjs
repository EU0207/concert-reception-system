import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
// 停止時点のコミットと照合する。後続の診断改善を試行済みと扱わない。
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/remote-closing-summary.json',root))),commit='a304d3e';
assert.deepEqual(r.sourceHashes,r.endSourceHashes);let comparisons=0;
for(const [file,expected] of Object.entries(r.sourceHashes)){
 const target=path.posix.normalize('poc/GD91-111/'+file);assert(target.startsWith('poc/'));
 const source=execFileSync('git',['show',commit+':'+target],{encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
 assert.equal(createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'),expected);comparisons++;
}
assert.equal(r.decisionId,'TECH-DD91-103');assert.equal(r.failure.code,'ERR_ASSERTION');
assert.deepEqual(r.progress.map(x=>x.id),['C01','C02','C03','C04','C05','C06']);assert.equal(r.authUsersCreated,5);
assert(r.applicationCalls<=600);assert(r.observedApplicationBodyBytes<=20971520);
for(const key of ['rulesClosed','rootsEmpty','authRestored','billingAccountUnlinked'])assert.equal(r.cleanup[key],true);
assert.equal(r.cleanup.usersDeleted,5);assert.equal(r.cleanup.authUsersRemaining,0);
const result={decisionId:'TECH-DD91-103-A',externalTrials:1,testedSourceCommit:execFileSync('git',['rev-parse',commit],{encoding:'utf8'}).trim(),sourceComparisons:comparisons,completedGroups:6,plannedGroups:10,closingGroupsNotCompleted:4,applicationCalls:r.applicationCalls,observedApplicationBodyBytes:r.observedApplicationBodyBytes,cleanupVerified:true,failureLocationRecorded:false,allPathsPassed:false,fullBusinessFreeTierVerified:false};
fs.writeFileSync(new URL('artifacts/remote-failure-audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
