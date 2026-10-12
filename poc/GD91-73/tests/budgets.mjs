import fs from 'node:fs';import assert from 'node:assert/strict';
export {budgets} from '../../GD91-72/tests/budgets.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const old=read('../../GD91-72/node_modules/.cache/firestore.rules'),current=read('../node_modules/.cache/firestore.rules');
for(const match of old.matchAll(/    function (\w+)\(/g)){
 if(match[1]==='sharedDraft')continue;
 const start=match.index;let end=old.indexOf('{',start),depth=1;while(depth){end++;if(old[end]==='{')depth++;if(old[end]==='}')depth--;}
 assert(current.includes(old.slice(start,end+1)),match[1]);
}
assert(current.includes('sharedSelectionFence(p,id,a)'));
export const indexBudget={eventAdditionalReferences:1,stateEventAdditionalReferences:2,indexUpdate:2,indexUpdateWithDisplay:4,indexCreate:2,sharedDraft:7,sharedHead:2,sharedTotal:9,protectedPairConservativeTotal:23,publicationConservativeTotal:25,cacheDiscountAssumed:false,conservative20ReferenceGatePassed:false};
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({oldFunctionBodiesPreserved:true,indexBudget,productionCostsMeasured:false}));
