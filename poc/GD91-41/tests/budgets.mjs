import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n'),rules=read('../firestore.rules'),old=read('../../GD91-36/firestore.rules');
const body=(s,name)=>{const start=s.indexOf('    function '+name+'(');assert(start>=0);let end=s.indexOf('\n    function ',start+1);if(end<0)end=s.indexOf('\n    match ',start);return s.slice(start,end);};
for(const name of ['scope','roleValid','providerValid','currentPreparation','generalPreparation','sessionShape','recentHumanAt','recentHuman','issueSession','revokeSession','manager','active','highImpact'])assert.equal(body(rules,name),body(old,name));
const original=body(old,'authorizedLevel'),core=original.slice(original.indexOf('      return request.auth.token.firebase.sign_in_provider'),original.indexOf('        && (level == 0'));
assert(body(rules,'identity').includes(core));
assert.equal(body(rules,'authorizedLevel'),original.replace(core,'      return identity(p,d,s,r)\n'));
const calls=name=>(body(rules,name).match(/(?<![\w.])(?:get|getAfter|exists|existsAfter)\(/g)||[]).length;
for(const [name,n]of Object.entries({identity:0,authorizedLevel:3,writeIdentity:3,central:3,registrationPair:2,ownPair:1,labelWrite:3,profileCreate:2,indexWrite:3,operation:2,ownEvent:4,assigned:3,labelRead:4,ownDayRead:2,publicRead:1}))assert.equal(calls(name),n,name);
export const budgets={registration:[calls('central')+calls('writeIdentity')+calls('registrationPair'),calls('profileCreate'),calls('labelWrite'),calls('indexWrite'),calls('operation')],dayLabel:[calls('central')+calls('writeIdentity')+calls('ownPair'),calls('labelWrite'),calls('indexWrite'),calls('operation'),calls('ownEvent')],beforeDayLabel:[calls('central')+calls('writeIdentity'),calls('labelWrite'),calls('indexWrite'),calls('operation')],reads:{assignedLabel:calls('labelRead')+calls('assigned'),ownDay:calls('ownDayRead')+calls('authorizedLevel')*2,publicClosed:calls('publicRead')+calls('authorizedLevel')*2,manager:3}};
assert.deepEqual(budgets.registration,[8,2,3,3,2]);assert.deepEqual(budgets.dayLabel,[7,3,3,2,4]);assert.deepEqual(budgets.beforeDayLabel,[6,3,3,2]);
for(const v of [budgets.registration,budgets.dayLabel,budgets.beforeDayLabel,...Object.values(budgets.reads).map(n=>[n])]){assert(v.every(n=>n<=10));assert(v.reduce((a,b)=>a+b,0)<=20);}
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify(budgets));
