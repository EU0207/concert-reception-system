import fs from 'node:fs';
import assert from 'node:assert/strict';
const extra=['generate.mjs','individual.rules','firebase.json','tests/support.mjs','tests/budgets.mjs','tests/regression.mjs','tests/initial-support.mjs','tests/initial-layout.mjs','tests/model.mjs','node_modules/.cache/firestore.rules',...['global-support','comparison-support','candidate-support'].map(n=>'node_modules/.cache/'+n+'.mjs')].map(p=>'../../GD91-71/'+p);
for(const [gd,label] of [[70,'extension-regression'],[69,'geometry-regression'],[68,'bulk-regression'],[67,'roster-regression'],[65,'initial-regression'],[64,'branches-regression'],[63,'lifecycle-regression']]){
 const original=new URL('../../GD91-'+gd+'/tests/emulator.mjs',import.meta.url);
 let source=fs.readFileSync(original,'utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf(' await run('),end=source.indexOf(' const endSourceHashes='),cases=source.slice(start,end);assert(start>=0&&end>start);
 source=source.replaceAll("from './support.mjs'","from '"+new URL(gd===65?'initial-support.mjs':'support.mjs',import.meta.url).href+"'")
  .replaceAll("from './budgets.mjs'","from '"+new URL('budgets.mjs',import.meta.url).href+"'");
 source=source.replace(/from (['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+q+new URL(p,original).href+q);
 source=source.replace(/sources\s*=\s*\[/,m=>m+extra.map(p=>JSON.stringify(p)).join(',')+',');
 source=source.replaceAll('new URL(p, import.meta.url)','new URL(p,'+JSON.stringify(original.href)+')').replaceAll('new URL(p,import.meta.url)','new URL(p,'+JSON.stringify(original.href)+')');
 source=source.replace(/new URL\('\.\.\/artifacts\//g,"new URL('"+new URL('../artifacts/',import.meta.url).href);
 for(const previous of ['extension-summary','geometry-summary','bulk-summary','roster-summary','initial-summary','branches-summary','lifecycle-summary'])source=source.replaceAll(previous,label);
 assert.equal(source.slice(source.indexOf(' await run('),source.indexOf(' const endSourceHashes=')),cases);
 const generated=new URL('../node_modules/.cache/regression-'+gd+'.mjs',import.meta.url);fs.writeFileSync(generated,source);await import(generated.href);
}
