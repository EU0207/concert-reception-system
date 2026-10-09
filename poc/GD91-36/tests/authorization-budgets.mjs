import fs from 'node:fs';
import assert from 'node:assert/strict';
function parse(file) {
 const rules=fs.readFileSync(new URL(file,import.meta.url),'utf8'),functions=new Map();
 for(const m of rules.matchAll(/function (\w+)\([^)]*\) \{/g)){let i=m.index+m[0].length,start=i,depth=1;while(depth&&i<rules.length){if(rules[i]==='{')depth++;if(rules[i]==='}')depth--;i++;}functions.set(m[1],rules.slice(start,i-1));}
 const refs=(n,stack=[])=>{assert(!stack.includes(n));const s=functions.get(n);assert(s,n);let c=(s.match(/(?<![\w.])(?:get|getAfter|exists)\(/g)||[]).length;for(const m of s.matchAll(/(?<![\w.])(\w+)\(/g))if(functions.has(m[1]))c+=refs(m[1],[...stack,n]);return c;};
 return{functions,refs};
}
const old=parse('../../GD91-34/firestore.rules'),now=parse('../firestore.rules');
let unchanged=0;for(const n of old.functions.keys()){
 assert.equal(now.refs(n),old.refs(n),n+': document reference delta');
 if(!['scope','roleValid','sessionShape','authorized','issueSession'].includes(n))assert.equal(now.functions.get(n).replace(/\s/g,''),old.functions.get(n).replace(/\s/g,''),n+': preserved function');
 unchanged++;
}
assert.equal(now.refs('authorizedLevel'),3);
export const authorizationBudgets={session:[now.refs('issueSession')],roleChange:[now.refs('roleChange'),now.refs('roleEvent')],preparation:[now.refs('prepareDevice'),now.refs('preparationReceipt')]};
assert.deepEqual(authorizationBudgets,{session:[2],roleChange:[4,6],preparation:[2,3]});
for(const b of Object.values(authorizationBudgets)){assert(Math.max(...b)<=10);assert(b.reduce((a,c)=>a+c,0)<=20);}
export const referenceComparison={previousFunctions:unchanged,documentReferenceDelta:0,cacheDiscount:false,expressionEvaluationMeasured:false};
