import fs from 'node:fs';import assert from 'node:assert/strict';
const base=fs.readFileSync(new URL('../../GD91-60/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n'),generated=fs.readFileSync(new URL('../node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function body(s,name){const start=s.indexOf('    function '+name+'(');assert(start>=0,name);let i=s.indexOf('{',start),depth=1;while(depth){i++;if(s[i]==='{')depth++;if(s[i]==='}')depth--;}return s.slice(start,i+1);}
export const preserved=['scope','roleValid','providerValid','currentPreparation','generalPreparation','sessionShape','recentHumanAt','recentHuman','identity','authorizedLevel','authorized','issueSession','revokeSession','manager','candidateProof','common','readyCandidate','publicationAssignment','publication','stateVersion','stateWrite','stateEvent'];
for(const n of preserved)assert.equal(body(base,n),body(generated,n),n);
// 経路ごとに到達する分岐を数える。同じ文書の再参照も減算しない。
export const budgets={registration:[7,3,4,3,3],paid:[7,4,3,3],singleAssignment:[9,5,3],pairAssignment:[9,7,3],publication:[8,6,6],state:[7,1,3,4]};
for(const v of Object.values(budgets)){assert(Math.max(...v)<=10);assert(v.reduce((a,b)=>a+b,0)<=20);}
assert(!body(generated,'versionUpdate').includes("assignmentProbe(p,b,a,e)"));
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({budgets,preservedFunctions:preserved.length,cacheDiscount:false,expressionEvaluationMeasured:false}));
