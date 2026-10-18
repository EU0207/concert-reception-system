import assert from 'node:assert/strict';import {buildRules} from './generate.mjs';
function body(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);let i=source.indexOf('{',start),depth=1,end=i+1;for(;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(i+1,end-1);}
export function referenceBudget(){
 const source=buildRules(),names=['manager','reader','recent','versionGuard','headWrite','registerHead','registerPerson','newPerson','newLabel','labelReadable','issueSession'];
 const direct=Object.fromEntries(names.map(name=>[name,(body(source,name).match(/\b(?:get|getAfter|exists|existsAfter)\s*\(/g)||[]).length]));
 assert.deepEqual(direct,{manager:3,reader:3,recent:1,versionGuard:1,headWrite:1,registerHead:0,registerPerson:4,newPerson:2,newLabel:2,labelReadable:1,issueSession:2});
 assert.equal((body(source,'recent').match(/\bmanager\(/g)||[]).length,1);assert.equal((body(source,'registerPerson').match(/\brecent\(/g)||[]).length,1);
 for(const name of ['headWrite','newPerson','newLabel'])assert.equal((body(source,name).match(/\bversionGuard\(/g)||[]).length,1);
 const operation=direct.registerPerson+direct.recent+direct.manager,head=direct.headWrite+direct.versionGuard,person=direct.newPerson+direct.versionGuard,label=direct.newLabel+direct.versionGuard;
 const result={registration:{operation,head,person,label,total:operation+head+person+label},staffReads:{head:direct.manager+direct.reader,label:direct.manager+direct.labelReadable+direct.reader,accessGate:direct.reader+1},sessionIssue:direct.issueSession,cacheDiscountAssumed:false};
 assert(result.registration.total<=20);assert(Math.max(operation,head,person,label,...Object.values(result.staffReads))<=10);return result;
}
