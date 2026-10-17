import assert from 'node:assert/strict';import fs from 'node:fs';import {budget} from './budget-model.mjs';import {sourceHashes} from '../GD91-105/source-audit.mjs';
const base={normalTlsBytes:100,extraSdkCopyBytes:20,restRequests:3,generationJsonBytes:10,closingRootJsonBytes:30,
 extraFullLayoutSaves:2,extraSnapshotCopies:1,backupCopies:1,retainedExtraGenerations:2,retainedPerformances:1,monthlyPerformances:1,
 unmeasuredRequestAllowanceBytes:5,extraBusinessReserveBytes:40,bootstrapAndEndReserveBytes:50,otherMonthlyBytes:0,otherStoredBytes:0};
const reports=[];function check(id,fn){fn();reports.push(id);}
check('no-double-count-of-normal-sdk',()=>assert.equal(budget(base).perPerformanceBytes,670));
check('repetition-is-explicit',()=>assert.equal(budget({...base,monthlyPerformances:4}).monthlyBytes,2680));
check('storage-keeps-protected-generations',()=>assert.equal(budget(base).retainedJsonComparisonBytes,100));
check('download-excess-visible',()=>assert(!budget({...base,otherMonthlyBytes:10000000000}).fitsIllustrativeDownloadBudget));
check('storage-excess-visible',()=>assert(!budget({...base,otherStoredBytes:1000000000}).fitsIllustrativeStorageBudget));
check('missing-reserve-rejected',()=>assert.throws(()=>budget({...base,bootstrapAndEndReserveBytes:undefined})));
check('zero-reserve-rejected',()=>assert.throws(()=>budget({...base,extraBusinessReserveBytes:0})));
check('overflow-rejected',()=>assert.throws(()=>budget({...base,monthlyPerformances:Number.MAX_SAFE_INTEGER})));
check('negative-input-rejected',()=>assert.throws(()=>budget({...base,backupCopies:-1})));
check('model-never-claims-free-tier-proof',()=>assert.equal(budget(base).fullBusinessFreeTierVerified,false));
const hashes=sourceHashes(new URL('./',import.meta.url),['budget-test.mjs']);fs.writeFileSync(new URL('artifacts/budget-test-summary.json',import.meta.url),JSON.stringify({sourceHashes:hashes,endSourceHashes:hashes,reports,externalFirebaseConnected:false},null,2)+'\n');console.log(JSON.stringify({budgetCases:reports.length}));
