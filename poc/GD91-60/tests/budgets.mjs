import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const rules=read('../firestore.rules'),old=read('../../GD91-59/firestore.rules');
function body(s,name){
 const start=s.indexOf('    function '+name+'(');assert(start>=0,name);
 let i=s.indexOf('{',start),depth=1;
 while(depth){i++;if(s[i]==='{')depth++;if(s[i]==='}')depth--;}
 return s.slice(start,i+1);
}
const preserved=['scope','roleValid','providerValid','currentPreparation','generalPreparation','sessionShape','recentHumanAt','recentHuman','identity','authorizedLevel','authorized','issueSession','revokeSession','manager','candidateProof','common','readyCandidate','publicationAssignment','publication','versionUpdate','assignmentUpdate','eventCreate'];
for(const name of preserved)assert.equal(body(rules,name),body(old,name),name);
const calls=name=>(body(rules,name).match(/(?<![\w.])(?:get|getAfter|exists|existsAfter)\(/g)||[]).length;
assert.equal(calls('authorizedLevel'),3);
assert.equal(calls('stateWrite'),2);
assert.equal(calls('stateEvent'),2);
assert.equal(calls('stateVersion'),1);
assert.equal(calls('stateFence'),0);
assert.equal(calls('beforeVersion'),1);
assert.equal(calls('afterVersion'),1);
const auth=calls('authorizedLevel'),control=calls('control');
export const budgets={
 state:[auth+calls('stateWrite')+2,1,calls('stateEvent')+control,control+calls('stateVersion')+2],
 roleChange:[4,6],session:[2],preparation:[4,5],quarantine:[6,1,1],publication:[8,6,6],
 read:{reception:4,closedManager:7,dayTemporary:7,management:3,selfRole:4,preparationResult:3},
 policy:{reception:5,temporaryManager:5,temporaryStaff:8,postCorrection:5}
};
for(const parts of [budgets.state,budgets.roleChange,budgets.session,budgets.preparation,budgets.quarantine,budgets.publication]){
 assert(parts.every(n=>n<=10));assert(parts.reduce((a,b)=>a+b,0)<=20);
}
assert.deepEqual(budgets.state,[7,1,3,4]);
export const comparison={preservedFunctions:preserved,cacheDiscount:false,expressionEvaluationMeasured:false};
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({budgets,comparison}));
