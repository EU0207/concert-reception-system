import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sourceHashes} from '../GD91-105/source-audit.mjs';

const root=new URL('./',import.meta.url),rules=new URL('../GD91-113/database.rules.json',root);
const scopes=[['GD91-109','retention-local.mjs','retention',8],['GD91-111','registry-local.mjs','registry',8],['GD91-111','closing-local.mjs','closing',17]];
for(const [folder,file,label,count] of scopes){
 const original=new URL('../'+folder+'/'+file,root),target=new URL('artifacts/'+label+'-summary.json',root);
 const files=['retention-suite.mjs','generate.mjs','../GD91-113/generate.mjs','../GD91-113/database.rules.json','../'+folder+'/'+file,'../GD91-110/layout.mjs'];
 const hashes=()=>sourceHashes(root,files),before=hashes();
 let source=fs.readFileSync(original,'utf8');
 source=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p==='../GD91-104/geometry.mjs'?new URL('../GD91-110/layout.mjs',root).href:p,original).href));
 source=source.replace(/new URL\('(?:\.\.\/GD91-107\/)?database.rules.json',import.meta.url\)/g,`new URL(${JSON.stringify(rules.href)})`)
  .replace(new RegExp("new URL\\('artifacts/"+label+"-summary.json',import.meta.url\\)",'g'),`new URL(${JSON.stringify(target.href)})`)
  .replace("new URL('artifacts/',import.meta.url)",`new URL(${JSON.stringify(new URL('artifacts/',root).href)})`)
  .replaceAll('import.meta.url',JSON.stringify(original.href)).replace(/process\.exit\(process\.exitCode\?\?0\);/g,'');
 assert(!source.includes("new URL('artifacts/"),'unredirected-result');
 await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const result=JSON.parse(fs.readFileSync(target));assert(!result.failure,label);assert.equal(result.reports.length,count);
 const rebase=o=>Object.fromEntries(Object.entries(o).map(([p,h])=>['../'+folder+'/'+p,h]));
 result.sourceHashes={...rebase(result.sourceHashes),...before};result.endSourceHashes={...rebase(result.endSourceHashes),...hashes()};
 assert.deepEqual(result.sourceHashes,result.endSourceHashes);
 result.executedRulesSource='../GD91-113/database.rules.json';result.adaptedFrom='../'+folder+'/'+file;
 fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({scope:label,groups:count,cleanup:result.cleanup}));
}
