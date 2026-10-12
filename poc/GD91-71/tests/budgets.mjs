import fs from 'node:fs';import assert from 'node:assert/strict';
export {budgets} from '../../GD91-70/tests/budgets.mjs';
import {preserved as prior} from '../../GD91-70/tests/budgets.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const old=read('../../GD91-70/node_modules/.cache/firestore.rules'),current=read('../node_modules/.cache/firestore.rules');
function body(s,n){const start=s.indexOf('    function '+n+'(');assert(start>=0,n);let i=s.indexOf('{',start),d=1;while(d){i++;if(s[i]==='{')d++;if(s[i]==='}')d--;}return s.slice(start,i+1);}
export const changed=[...old.matchAll(/    function (\w+)\(/g)].map(x=>x[1]).filter(n=>body(old,n)!==body(current,n));
assert.deepEqual(changed,['scanNumbers','scanComparison','baseSource','scanCellComparison','versionUpdate','assignmentUpdate','eventCreate','publicationProof','extensionDescriptor','extensionSeal','extensionVersion']);
export const preserved=prior.filter(n=>!changed.includes(n));for(const n of preserved)assert.equal(body(current,n),body(old,n),n);
export const individualBudgets={details:8,seal:10,candidate:10,version:7,assignment:6,event:6,finalTotal:19,maximumPerWrite:10,cacheDiscount:false};
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({changed,preserved:preserved.length,individualBudgets,expressionEvaluationMeasured:false}));
