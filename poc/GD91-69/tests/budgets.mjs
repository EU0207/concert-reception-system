import fs from 'node:fs';import assert from 'node:assert/strict';
export {budgets} from '../../GD91-68/tests/budgets.mjs';
import {preserved as previousPreserved} from '../../GD91-68/tests/budgets.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const old=read('../../GD91-68/node_modules/.cache/firestore.rules'),current=read('../node_modules/.cache/firestore.rules');
function body(s,n){const start=s.indexOf('    function '+n+'(');assert(start>=0,n);let i=s.indexOf('{',start),depth=1;while(depth){i++;if(s[i]==='{')depth++;if(s[i]==='}')depth--;}return s.slice(start,i+1);}
export const changedFromPrevious=[...old.matchAll(/    function (\w+)\(/g)].map(x=>x[1]).filter(n=>body(old,n)!==body(current,n));
assert.deepEqual(changedFromPrevious,['finishFirstComparison','startCandidateSeats','scanCandidateSeats','candidateProof','versionUpdate']);
export const preserved=previousPreserved.filter(n=>!changedFromPrevious.includes(n));
for(const n of preserved)assert.equal(body(current,n),body(old,n),n);
export const bulkFunctions=['groupAppend','bulkKind','bulkPlan','bulkFixed','bulkGroup','bulkPrevious','bulkHeader','bulkStart','bulkAdvance','bulkProgress','bulkCompleted','bulkVersion','bulkAssignment','bulkEvent'];
for(const n of bulkFunctions)assert.equal(body(current,n),body(old,n),n);
export const slideBudget={version:6,view:4,event:4,total:14,maximumPerWrite:6,cacheDiscount:false};
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({unchangedBulkFunctions:bulkFunctions.length,slideBudget}));
