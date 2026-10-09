import fs from 'node:fs';import assert from 'node:assert/strict';
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8'),functions=new Map();
for(const m of rules.matchAll(/function (\w+)\([^)]*\) \{/g)){let i=m.index+m[0].length,start=i,depth=1;while(depth&&i<rules.length){if(rules[i]==='{')depth++;if(rules[i]==='}')depth--;i++;}functions.set(m[1],rules.slice(start,i-1));}
function refs(n,stack=[]){assert(!stack.includes(n));const s=functions.get(n);assert(s,n);let c=(s.match(/(?<![\w.])(?:get|getAfter|exists)\(/g)||[]).length;for(const m of s.matchAll(/(?<![\w.])(\w+)\(/g))if(functions.has(m[1]))c+=refs(m[1],[...stack,n]);return c;}
assert.equal(refs('ticketEvent'),5); // 既存はget、新規はexists。選択分岐の参照は4。
const ticket=functions.get('ticketWrite');assert.equal((ticket.match(/let /g)||[]).length,2);
assert(ticket.includes('a.ticketRevision == n.values.ticket')&&ticket.includes('i.attendeeId == id'));
assert(ticket.includes('a.ticketRevision > b.ticketRevision'));
const common=refs('nextVersions')+refs('nextTicketIndex'),history=refs('ticketEvent')-1;
const tail=[refs('ticketIndexUpdate'),refs('credentialCreate'),refs('codeCreate')];
const noTicketBase=refs('control')+refs('operation')+refs('noTicketVersion')-refs('noTicketSeatFence');
assert.equal(noTicketBase,8);
export const budgets={
 noTicketAssigned:[noTicketBase+2,refs('noTicketProfile'),refs('noTicketPeople'),refs('noTicketEvent'),refs('noTicketAssignment')],
 noTicketUnassigned:[noTicketBase+1,refs('noTicketProfile'),refs('noTicketPeople'),refs('noTicketEvent')],
 firstQr:[refs('ticketVersion'),common+refs('assignedForQr')+refs('qrLinks'),history,...tail],
 ticketCheck:[refs('ticketVersion'),common+refs('eligibleForCheck'),history,tail[0]],
 reissue:[refs('ticketVersion'),common+refs('qrLinks')+refs('revokedLinks'),history,...tail,refs('credentialRevoke'),refs('codeRevoke')],
 cancel:[refs('cancelVersion'),common+refs('cancelTicket'),refs('cancelEvent'),tail[0],refs('cancelProfile'),refs('cancelPeople'),refs('cancelAssignment'),refs('credentialRevoke'),refs('codeRevoke')],
 reopenCheck:[refs('ticketVersion'),common+refs('eligibleForCheck')+refs('assignedForQr'),history,tail[0]],
 return:[refs('control')+refs('operation')+refs('manager')+refs('layoutReady')+refs('nextPeople')+refs('tickets')+refs('assignment'),refs('profileWrite'),refs('peopleUpdate'),refs('normalEvent')]
};
assert.deepEqual(budgets,{noTicketAssigned:[10,3,3,1,1],noTicketUnassigned:[9,3,3,1],firstQr:[5,5,4,1,1,1],ticketCheck:[5,3,4,1],reissue:[5,6,4,1,1,1,1,1],cancel:[5,5,3,1,2,1,1,1,1],reopenCheck:[5,4,4,1],return:[9,4,4,2]});
for(const b of Object.values(budgets)){assert(Math.max(...b)<=10);assert(b.reduce((a,c)=>a+c,0)<=20);}
