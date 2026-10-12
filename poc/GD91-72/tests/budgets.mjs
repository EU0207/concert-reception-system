import fs from 'node:fs';import assert from 'node:assert/strict';
export * from '../../GD91-71/tests/budgets.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const old=read('../../GD91-71/node_modules/.cache/firestore.rules'),current=read('../node_modules/.cache/firestore.rules');
for(const match of old.matchAll(/    function (\w+)\(/g)){
 const start=match.index;let end=old.indexOf('{',start),depth=1;while(depth){end++;if(old[end]==='{')depth++;if(old[end]==='}')depth--;}
 assert(current.includes(old.slice(start,end+1)),match[1]);
}
export const distributionBudgets={header:4,geometry:9,row:10,progress:6,head:6,publicGet:9,publicList:6,sharedDraft:6,cacheDiscount:false};
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({allPriorFunctionBodiesPreserved:true,distributionBudgets,productionCostsMeasured:false}));
