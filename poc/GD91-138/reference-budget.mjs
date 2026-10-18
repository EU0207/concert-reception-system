import assert from 'node:assert/strict';import {buildRules} from './generate.mjs';
function functionBody(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);let i=source.indexOf('{',start),depth=1,end=i+1;for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(i+1,end-1);}
export function referenceBudget(){
 const source=buildRules(),names=['manager','recent','versionGuard','headWrite','personWrite','exchange','appendPublication'];
 const direct=Object.fromEntries(names.map(name=>[name,(functionBody(source,name).match(/\b(?:get|getAfter|exists|existsAfter)\s*\(/g)||[]).length]));
 assert.deepEqual(direct,{manager:3,recent:1,versionGuard:1,headWrite:1,personWrite:2,exchange:6,appendPublication:3});
 assert.equal((functionBody(source,'recent').match(/\bmanager\(/g)||[]).length,1);
 for(const name of ['exchange','appendPublication'])assert.equal((functionBody(source,name).match(/\brecent\(/g)||[]).length,1);
 for(const name of ['headWrite','personWrite'])assert.equal((functionBody(source,name).match(/\bversionGuard\(/g)||[]).length,1);
 const recent=direct.manager+direct.recent,head=direct.headWrite+direct.versionGuard,person=direct.personWrite+direct.versionGuard;
 const exchange={operation:direct.exchange+recent,head,people:[person,person],total:direct.exchange+recent+head+2*person};
 const appendPublication={operation:direct.appendPublication+recent,head,total:direct.appendPublication+recent+head};
 assert(exchange.total<=20&&appendPublication.total<=20);assert(Math.max(exchange.operation,head,person,appendPublication.operation)<=10);
 return{exchange,appendPublication,cacheDiscountAssumed:false};
}
