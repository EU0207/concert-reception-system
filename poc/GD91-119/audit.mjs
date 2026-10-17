import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {sourceHashes} from '../GD91-105/source-audit.mjs';import {generated} from '../GD91-116/generate.mjs';
const root=new URL('./',import.meta.url),r=JSON.parse(fs.readFileSync(new URL('artifacts/local-summary.json',root)));
assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);let comparisons=0;
for(const [p,h] of Object.entries(r.sourceHashes)){assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n')).digest('hex'),h,p);comparisons++;}
assert.equal(r.reports.length,14);assert.equal(new Set(r.reports.map(x=>x.id)).size,14);assert(r.closedAndActualsNotSeeded);
assert(r.cleanup.rulesClosed&&r.cleanup.trialRootEmpty);assert(r.modelTotalIncludingAllowances<=600);assert.equal(r.cleanupReserve,80);assert(r.maxJsonNodes<=20000&&r.maxRootJsonBytes<=1048576);
const remote=fileURLToPath(new URL('remote.mjs',root)),plan=JSON.parse(execFileSync(process.execPath,[remote,'--plan'],{encoding:'utf8'}));
assert.equal(plan.decisionId,'TECH-DD91-109');assert.equal(plan.externalRequestsExecuted,0);assert.equal(plan.maxAuthUsers,5);assert.equal(plan.maxApplicationCallsIncludingCleanup,600);assert.equal(plan.cleanupCallReserve,80);assert.equal(plan.maxJsonNodes,20000);
for(const flag of ['--unapproved','--plan-diagnostic'])assert.notEqual(spawnSync(process.execPath,[remote,flag],{encoding:'utf8'}).status,0);
const rules=generated();let expressions=0,childReferences=0,maxExpressionBytes=0;
function visit(node){for(const [key,v] of Object.entries(node))if(typeof v==='object'&&v)visit(v);else if(['.read','.write','.validate'].includes(key)&&typeof v==='string'){
 expressions++;childReferences+=(v.match(/\.child\(/g)||[]).length;maxExpressionBytes=Math.max(maxExpressionBytes,Buffer.byteLength(v));
}}
visit(rules);const own=sourceHashes(root,['audit.mjs','remote.mjs','generate.mjs']);
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify({sourceHashes:own,endSourceHashes:own,sourceComparisons:comparisons,
 localGroups:14,commonIoCallModel:r.commonIoCallModel,protocolExtraCallModel:r.protocolExtraCallModel,modelTotalIncludingAllowances:r.modelTotalIncludingAllowances,
 maxJsonNodes:r.maxJsonNodes,maxRootJsonBytes:r.maxRootJsonBytes,plan,
 staticRules:{jsonBytes:Buffer.byteLength(JSON.stringify(rules)),stringExpressions:expressions,childReferenceOccurrences:childReferences,maxExpressionBytes,
  runtimeEvaluationCountMeasured:false,firestoreDocumentAccessQuotaApplicable:false,notApplicationReadWriteCounts:true},
 cleanup:r.cleanup,externalFirebaseConnected:false,fullBusinessFreeTierVerified:false,productionImplementation:false},null,2)+'\n');
console.log(JSON.stringify({localGroups:14,sourceComparisons:comparisons,callModel:r.modelTotalIncludingAllowances,maxJsonNodes:r.maxJsonNodes,maxRootJsonBytes:r.maxRootJsonBytes,externalRequestsExecuted:0}));
