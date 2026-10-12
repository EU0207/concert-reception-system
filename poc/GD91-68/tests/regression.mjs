import fs from 'node:fs';import assert from 'node:assert/strict';
for(const [gd,label] of [[67,'roster-regression'],[65,'initial-regression'],[64,'branches-regression'],[63,'lifecycle-regression']]){
 const original=new URL('../../GD91-'+gd+'/tests/emulator.mjs',import.meta.url);
 let source=fs.readFileSync(original,'utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf(' await run('),end=source.indexOf(' const endSourceHashes='),cases=source.slice(start,end);
 assert(start>=0&&end>start);
 source=source.replaceAll("from './support.mjs'","from '"+new URL(gd===65?'initial-support.mjs':'support.mjs',import.meta.url).href+"'")
  .replaceAll("from './budgets.mjs'","from '"+new URL('budgets.mjs',import.meta.url).href+"'")
  .replaceAll("from '../../GD91-60/tests/access-support.mjs'","from '"+new URL('../../GD91-60/tests/access-support.mjs',import.meta.url).href+"'");
 if(gd===67)source=source.replaceAll("from '../projection.mjs'","from '"+new URL('../../GD91-67/projection.mjs',import.meta.url).href+"'")
  .replaceAll("from '../../GD91-66/allocation.mjs'","from '"+new URL('../../GD91-66/allocation.mjs',import.meta.url).href+"'");
 const extra=['generate.mjs','bulk.rules','tests/support.mjs','tests/structure.mjs','tests/budgets.mjs','tests/initial-support.mjs','tests/regression.mjs','node_modules/.cache/firestore.rules'].map(p=>'../../GD91-68/'+p);
 source=source.replace(/sources\s*=\s*\[/,m=>m+extra.map(p=>JSON.stringify(p)).join(',')+',');
 source=source.replaceAll('new URL(p, import.meta.url)','new URL(p,'+JSON.stringify(original.href)+')').replaceAll('new URL(p,import.meta.url)','new URL(p,'+JSON.stringify(original.href)+')');
 for(const previous of ['roster-summary','initial-summary','branches-summary','lifecycle-summary'])source=source.replaceAll("'"+previous+"'","'"+label+"'");
 if(gd===67)source=source.replace("'../artifacts/roster-summary.json'","'../artifacts/roster-regression.json'");
 source=source.replaceAll(', import.meta.url), JSON.stringify',','+JSON.stringify(import.meta.url)+'), JSON.stringify').replaceAll(',import.meta.url),JSON.stringify',','+JSON.stringify(import.meta.url)+'),JSON.stringify');
 assert.equal(source.slice(source.indexOf(' await run('),source.indexOf(' const endSourceHashes=')),cases);
 const generated=new URL('../node_modules/.cache/regression-'+gd+'.mjs',import.meta.url);fs.writeFileSync(generated,source);await import(generated.href);
}
