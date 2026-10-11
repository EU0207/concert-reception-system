import fs from 'node:fs';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const base=read('../../GD91-60/firestore.rules'),current=read('../node_modules/.cache/firestore.rules');
function body(s,n){const start=s.indexOf('    function '+n+'(');assert(start>=0,n);let i=s.indexOf('{',start),depth=1;while(depth){i++;if(s[i]==='{')depth++;if(s[i]==='}')depth--;}return s.slice(start,i+1);}
export const preserved=['scope','roleValid','providerValid','currentPreparation','generalPreparation','sessionShape','recentHumanAt','recentHuman','identity','authorizedLevel','authorized','issueSession','revokeSession','manager','candidateProof','common','readyCandidate','publicationAssignment','publication','stateVersion','stateWrite','stateEvent'];
for(const n of preserved)assert.equal(body(base,n),body(current,n),n);
// 到達分岐ごとの机上算定。キャッシュによる参照減算や実測ではない。
export const budgets={registration:[7,3,4,3,3],paid:[7,4,3,3],unprotectedSingle:[10,4,3],unprotectedPair:[10,5,3],protectedPair:[10,5,3,2],qrCreate:[5,6,1,2,1,1],ticketCheck:[5,4,1,2],qrReissue:[5,8,1,2,1,1,1,1],cancelQrAssigned:[5,6,1,2,1,1,2,1,1],cancelNoQrAssigned:[5,4,1,2,2,1,1],returnClosedTicket:[8,3,6,3],returnNoTicket:[7,3,6,3],cancelNoTicketAssigned:[9,2,4,3,2],cancelNoTicketUnassigned:[9,2,3,3],cancelNoQrUnassigned:[5,4,1,2,2,1],assignProtectedPerson:[10,4,3,2],publication:[8,6,6],state:[7,1,3,4]};
for(const a of Object.values(budgets)){assert(Math.max(...a)<=10);assert(a.reduce((a,b)=>a+b,0)<=20);}
assert.equal((body(current,'coreSeat').match(/get\(/g)||[]).length,1);assert(body(current,'coreSeat').includes('v.seatIds.hasAny([seatId])'));assert(body(current,'coreSeat').includes('fact.generation == g'));assert(!body(current,'versionUpdate').includes('assignmentProbe(p,b,a,e)'));
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({budgets,preservedFunctions:22,cacheDiscount:false,expressionEvaluationMeasured:false}));

assert(body(current,'branchVersion').includes('!existsAfter('));
assert(body(current,'lifeTicketProtection').includes('protectedAttendeeIds'));
assert(!body(current,'lifeCancelPeople').includes('lifeNextTicket('));
