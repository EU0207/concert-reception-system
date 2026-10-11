import fs from 'node:fs';import assert from 'node:assert/strict';
for (const [gd,label] of [[65,'initial-regression'],[64,'branches-regression'],[63,'lifecycle-regression']]) {
  const original=new URL('../../GD91-'+gd+'/tests/emulator.mjs',import.meta.url);
  let source=fs.readFileSync(original,'utf8').replace(/\r\n/g,'\n');
  const cases=source.slice(source.indexOf(' await run('),source.indexOf(' const endSourceHashes='));
  source=source.replaceAll("from './support.mjs'","from '"+new URL(gd===65?'initial-support.mjs':'support.mjs',import.meta.url).href+"'")
    .replaceAll("from './budgets.mjs'","from '"+new URL('budgets.mjs',import.meta.url).href+"'")
    .replaceAll("from '../../GD91-60/tests/access-support.mjs'","from '"+new URL('../../GD91-60/tests/access-support.mjs',import.meta.url).href+"'");
  source=source.replace('sources=[',"sources=['../../GD91-67/generate.mjs','../../GD91-67/roster.rules','../../GD91-67/projection.mjs','../../GD91-67/tests/support.mjs','../../GD91-67/tests/structure.mjs','../../GD91-67/tests/initial-support.mjs','../../GD91-67/tests/regression.mjs','../../GD91-67/tests/budgets.mjs','../../GD91-67/node_modules/.cache/firestore.rules',");
  source=source.replaceAll('new URL(p,import.meta.url)','new URL(p,'+JSON.stringify(original.href)+')');
  for(const previous of ['initial-summary','branches-summary','lifecycle-summary']) source=source.replaceAll("'"+previous+"'","'"+label+"'");
  source=source.replaceAll(',import.meta.url),JSON.stringify',','+JSON.stringify(import.meta.url)+'),JSON.stringify');
  assert.equal(source.slice(source.indexOf(' await run('),source.indexOf(' const endSourceHashes=')),cases);
  const generated=new URL('../node_modules/.cache/regression-'+gd+'.mjs',import.meta.url);fs.writeFileSync(generated,source);await import(generated.href);
}
