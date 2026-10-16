import fs from 'node:fs';import assert from 'node:assert/strict';
import {generated as previous} from '../GD91-111/generate.mjs';
export const maxObservationMillis=8640000000000000;
export function generated(){
 const rules=previous(),run=rules.rules.checks.$run;
 const current="newData.child('observedAt')",value=current+'.val()';
 const valid=`${current}.isNumber() && ${value} >= 0 && ${value} <= ${maxObservationMillis} && ${value} % 1 === 0`;
 for(const [node,old] of [
  [run.receipts.$device.events.$key,`${current}.isNumber() && ${value} <= now`],
  [run.quarantine.$device.events.$key,`${current}.isNumber() && ${value} >= 0 && ${value} <= now`]
 ]){assert.equal(node['.validate'].split(old).length,2);node['.validate']=node['.validate'].replace(old,valid);}
 return rules;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/GD91-113/generate.mjs')){
 fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(generated(),null,2)+'\n');
}
