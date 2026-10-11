import fs from 'node:fs';import assert from 'node:assert/strict';
export {budgets} from '../../GD91-65/tests/budgets.mjs';
import {preserved as oldPreserved} from '../../GD91-65/tests/budgets.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
export const preserved=[...oldPreserved,'corePaid','lifeCancelProfile','lifeReturnProfile','lifeCancelPeople','lifeReturnPeople','branchPeople','branchProfile','coreAssignmentVersion','coreAssignment','coreRosterState','firstVersion','firstAssignment','initVersion','initChild','initEvent'];
function body(s,n){const start=s.indexOf('    function '+n+'(');assert(start>=0,n);let i=s.indexOf('{',start),depth=1;while(depth){i++;if(s[i]==='{')depth++;if(s[i]==='}')depth--;}return s.slice(start,i+1);}
const old=read('../../GD91-65/node_modules/.cache/firestore.rules'),current=read('../node_modules/.cache/firestore.rules');
for(const n of preserved)assert.equal(body(old,n),body(current,n),n);
// 追加検査は同じ参照済みの値だけを使い、get/getAfter/existsを増やさない。
assert(!/\b(get|getAfter|exists|existsAfter)\s*\(/.test(read('../roster.rules')));
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({preserved:preserved.length,referenceBudgetsUnchanged:true,registration:20,paid:17,cacheDiscount:false,expressionEvaluationMeasured:false}));
