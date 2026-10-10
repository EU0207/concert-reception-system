import fs from 'node:fs';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n'),old=read('../../GD91-36/firestore.rules'),now=read('../firestore.rules'),previous=read('../../GD91-41/firestore.rules');
function body(s,n){const a=s.indexOf('    function '+n+'(');assert(a>=0);let i=s.indexOf('{',a),d=1;while(d){i++;if(s[i]==='{')d++;if(s[i]==='}')d--;}return s.slice(a,i+1);}
for(const n of ['scope','roleValid','providerValid','currentPreparation','generalPreparation','sessionShape','recentHumanAt','recentHuman','identity','authorizedLevel','authorized','issueSession','revokeSession','manager','active','highImpact'])assert.equal(body(now,n),body(previous,n));
for(const n of ['transition','roleChange','roleEvent','prepareDevice','preparationReceipt'])assert.equal(body(now,n),body(old,n));
export const authorizationBudgets={session:[2],roleChange:[4,6],preparation:[2,3]};
export const referenceComparison={authorizationFunctionsPreserved:21,previousBusinessSchema:8,previousLabelSchema:9,joinedBusinessSchema:10,cacheDiscount:false,expressionEvaluationMeasured:false,oldBusinessRulesByteIdentical:false};
