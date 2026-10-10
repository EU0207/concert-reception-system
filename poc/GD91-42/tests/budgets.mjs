import fs from 'node:fs';import assert from 'node:assert/strict';
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8'),functions=new Map();
for(const m of rules.matchAll(/function (\w+)\([^)]*\) \{/g)){let i=m.index+m[0].length,start=i,depth=1;while(depth&&i<rules.length){if(rules[i]==='{')depth++;if(rules[i]==='}')depth--;i++;}functions.set(m[1],rules.slice(start,i-1));}
function refs(n,stack=[]){assert(!stack.includes(n),[...stack,n].join(' -> '));const s=functions.get(n);assert(s,n);let c=(s.match(/(?<![\w.])(?:get|getAfter|exists)\(/g)||[]).length;for(const m of s.matchAll(/(?<![\w.])(\w+)\(/g))if(functions.has(m[1]))c+=refs(m[1],[...stack,n]);return c;}
assert.equal(refs('ticketEvent'),5); // 既存はget、新規はexists。選択分岐の参照は4。
const ticket=functions.get('ticketWrite');assert.equal((ticket.match(/let /g)||[]).length,2);
assert(ticket.includes('a.ticketRevision == n.values.ticket')&&ticket.includes('i.attendeeId == id'));
assert(ticket.includes('a.ticketRevision > b.ticketRevision'));
const common=refs('nextVersions')+refs('nextTicketIndex'),history=refs('ticketEvent')-1;
const tail=[refs('ticketIndexUpdate'),refs('credentialCreate'),refs('codeCreate')];
const noTicketBase=refs('control')+refs('operation')+refs('noTicketVersion')-refs('noTicketSeatFence');
assert.equal(noTicketBase,8);
const cancelBase=refs('cancelVersion')-refs('cancelNoSeatFence');assert.equal(cancelBase,5);
export const budgets={
 noQrAssigned:[cancelBase,common+refs('cancelTicket')-refs('revokedLinks'),refs('cancelEvent'),tail[0],refs('cancelProfile'),refs('cancelPeople'),refs('cancelAssignment')],
 noQrUnassigned:[cancelBase+1,common+refs('cancelTicket')-refs('revokedLinks'),refs('cancelEvent')-refs('cancelResultAssignment'),tail[0],refs('cancelProfile'),refs('cancelPeople')],
 noTicketAssigned:[noTicketBase+2,refs('noTicketProfile'),refs('noTicketPeople'),refs('noTicketEvent'),refs('noTicketAssignment')],
 noTicketUnassigned:[noTicketBase+1,refs('noTicketProfile'),refs('noTicketPeople'),refs('noTicketEvent')],
 firstQr:[refs('ticketVersion'),common+refs('assignedForQr')+refs('qrLinks'),history,...tail],
 ticketCheck:[refs('ticketVersion'),common+refs('eligibleForCheck'),history,tail[0]],
 reissue:[refs('ticketVersion'),common+refs('qrLinks')+refs('revokedLinks'),history,...tail,refs('credentialRevoke'),refs('codeRevoke')],
 cancel:[cancelBase,common+refs('cancelTicket'),refs('cancelEvent'),tail[0],refs('cancelProfile'),refs('cancelPeople'),refs('cancelAssignment'),refs('credentialRevoke'),refs('codeRevoke')],
 reopenCheck:[refs('ticketVersion'),common+refs('eligibleForCheck')+refs('assignedForQr'),history,tail[0]],
 return:[refs('control')+refs('operation')+refs('manager')+refs('layoutReady')+refs('nextPeople')+refs('tickets')+refs('assignment'),refs('profileWrite'),refs('peopleUpdate'),refs('normalEvent')]
};
assert.deepEqual(budgets,{noQrAssigned:[5,3,3,1,2,1,1],noQrUnassigned:[6,3,2,1,2,1],noTicketAssigned:[10,3,3,1,1],noTicketUnassigned:[9,3,3,1],firstQr:[5,5,4,1,1,1],ticketCheck:[5,3,4,1],reissue:[5,6,4,1,1,1,1,1],cancel:[5,5,3,1,2,1,1,1,1],reopenCheck:[5,4,4,1],return:[9,4,4,2]});
for(const b of Object.values(budgets)){assert(Math.max(...b)<=10);assert(b.reduce((a,c)=>a+c,0)<=20);}
const direct=n=>(functions.get(n).match(/(?<![\w.])(?:get|getAfter|exists)\(/g)||[]).length;
assert.equal(refs('saveManager'),3);assert.equal(refs('registeredLabel'),1);assert.equal(direct('attendeeVersion'),0);
assert.equal(refs('registrationLabel'),3);assert.equal(refs('labelWrite'),3);assert.equal(refs('labelIndexWrite'),3);assert.equal(refs('labelOperation'),2);assert.equal(refs('ownEvent'),4);
export const joinedBudgets={registration:[refs('control')+refs('operation')+refs('saveManager')+refs('nextPeople')+refs('registeredLabel'),refs('profileWrite'),refs('peopleUpdate'),refs('normalEvent'),refs('registrationLabel')],paidOnly:[6,refs('profileWrite'),refs('peopleUpdate'),refs('normalEvent')],dayLabel:[refs('labelCentral'),refs('labelWrite'),refs('labelIndexWrite'),refs('labelOperation'),refs('ownEvent')],beforeDayLabel:[refs('labelCentral')-refs('ownPair'),refs('labelWrite'),refs('labelIndexWrite'),refs('labelOperation')]};
assert.deepEqual(joinedBudgets,{registration:[7,4,4,2,3],paidOnly:[6,4,4,2],dayLabel:[8,3,3,2,4],beforeDayLabel:[7,3,3,2]});for(const v of Object.values(joinedBudgets)){assert(Math.max(...v)<=10);assert(v.reduce((a,b)=>a+b,0)<=20);}
