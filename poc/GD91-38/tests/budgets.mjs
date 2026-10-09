import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const baseline=readFileSync(new URL('../../GD91-36/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const auth=s=>s.slice(s.indexOf('    function scope'),s.indexOf('    function transition')<0?s.indexOf('    function uuid'):s.indexOf('    function transition'));
assert.equal(auth(rules),auth(baseline));
const body=name=>{const start=rules.indexOf('    function '+name+'(');assert(start>=0);const end=rules.indexOf('\n    function ',start+1);return rules.slice(start,end<0?rules.indexOf('\n    match ',start):end);};
// Map.getは文書アクセスではないため、メンバー呼出しを除外する。
const calls=name=>(body(name).match(/(?<![\w.])(?:get|getAfter|exists|existsAfter)\(/g)||[]).length;
assert.equal(calls('authorizedLevel'),3);assert.equal(calls('stateWrite'),2);assert.equal(calls('stateEvent'),2);assert.equal(calls('control'),1);assert.equal(calls('operationCheck'),1);
const a=calls('authorizedLevel'),c=calls('control');
export const budgets={state:[a+calls('stateWrite'),1,calls('stateEvent')+c],read:{reception:c+a,closedManager:c+a+a,dayTemporary:a+a+c,management:a,selfRole:a+1},policy:{reception:c+1+a,temporaryManager:c+1+a,temporaryStaff:c+1+a+a,postCorrection:c+1+a},publication:[a+c]};
for(const v of [budgets.state,budgets.publication,...Object.values(budgets.read).map(x=>[x]),...Object.values(budgets.policy).map(x=>[x])]){assert(v.every(x=>x<=10));assert(v.reduce((x,y)=>x+y,0)<=20);}
assert.equal(budgets.state.reduce((x,y)=>x+y),9);
assert.equal(calls('prepare'),2);assert.equal(calls('preparationReceipt'),3);assert.equal(calls('manifest'),1);
assert.equal(calls('recovery'),3);assert.equal(calls('quarantine'),2);assert.equal(calls('sequence'),1);assert.equal(calls('quarantineReceipt'),1);
budgets.preparation=[calls('prepare')+c+calls('manifest'),calls('preparationReceipt')+c+calls('manifest')];
budgets.quarantine=[calls('quarantine')+calls('recovery')+c,calls('sequence'),calls('quarantineReceipt')];
for(const v of [budgets.preparation,budgets.quarantine]){assert(v.every(x=>x<=10));assert(v.reduce((x,y)=>x+y,0)<=20);}
assert.deepEqual(budgets.preparation,[4,5]);assert.deepEqual(budgets.quarantine,[6,1,1]);
assert.equal(calls('preparationResult'),2);budgets.preparationResult={human:2,manager:a};
// 同一パスの再参照も数え、キャッシュ削減を見込まない。旧保存へ単純加算する根拠には使わない。
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify(budgets));
