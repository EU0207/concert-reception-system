import fs from 'node:fs';import assert from 'node:assert/strict';
import {preserved as old} from '../../GD91-67/tests/budgets.mjs';
export {budgets} from '../../GD91-67/tests/budgets.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
function body(s,n){const start=s.indexOf('    function '+n+'(');assert(start>=0,n);let i=s.indexOf('{',start),depth=1;while(depth){i++;if(s[i]==='{')depth++;if(s[i]==='}')depth--;}return s.slice(start,i+1);}
const base=read('../../GD91-67/node_modules/.cache/firestore.rules'),current=read('../node_modules/.cache/firestore.rules');
export const changed=old.filter(n=>body(base,n)!==body(current,n));
export const preserved=old.filter(n=>!changed.includes(n));
assert.deepEqual(changed,['coreAssignment','firstVersion','firstAssignment']);
for(const n of preserved)assert.equal(body(base,n),body(current,n),n);
export const bulkBudgets={header:9,headerWithPrevious:10,progress:9,confirmAuto:15,confirmGroup:16,perWriteMaximum:10,cacheDiscount:false};
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({preserved:preserved.length,changed,bulkBudgets,expressionEvaluationMeasured:false}));
