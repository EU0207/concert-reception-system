import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {buildRules} from './generate.mjs';import {referenceBudget} from './reference-budget.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),r=read('artifacts/local-summary.json');
assert(!r.failure);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
for(const[p,h]of Object.entries(r.sourceHashes))assert.equal(hash(fs.readFileSync(new URL(p,root),'utf8')),h,p);
assert.equal(hash(buildRules()),r.rulesHash);assert.equal(r.reports.length,26);
for(const n of [600,1000]){const cases=r.reports.filter(x=>x.people===n);assert.equal(cases.length,13);assert.equal(cases.find(x=>x.id.startsWith('E01')).partialCombinations,14);assert.equal(cases.find(x=>x.id.startsWith('E05')).successes,1);assert.equal(cases.find(x=>x.id.startsWith('P04')).allAssignmentsPreserved,n);}
assert(r.cleanup.rulesClosed&&r.cleanup.trialDocumentsEmpty&&r.cleanup.authUsersRemaining===0);assert(!r.fullBusinessRegressionVerified&&!r.normalRegistrationAndProofGenerationVerified);
assert.deepEqual(referenceBudget(),r.conservativeReferenceBudget);assert(r.sizes.every(x=>x.headDocumentModelBytes<1048576&&x.headIncludesAllSeatIds&&x.headIncludesAllAssignmentIds&&!x.headContainsNames));
const result={sourceComparisons:Object.keys(r.sourceHashes).length,groups:26,profiles:[600,1000],cells:4096,sections:16,referenceBudget:referenceBudget(),fullBusinessRegressionVerified:false,externalFirebaseConnected:false};
fs.writeFileSync(new URL('artifacts/audit-summary.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
