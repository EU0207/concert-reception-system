import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
const self=new URL('regression.mjs',import.meta.url),rules=new URL('database.rules.json',import.meta.url);
const wrapperBefore=digest(fs.readFileSync(self,'utf8')),rulesBefore=digest(fs.readFileSync(rules,'utf8'));
for(const[folder,name,count,label]of[['GD91-94','validate.mjs',14,'sharing'],['GD91-92','validate.mjs',12,'manager'],['GD91-96','validate.mjs',12,'queue'],['GD91-97','common-local.mjs',4,'general']]){
 const original=new URL('../'+folder+'/'+name,import.meta.url),result=new URL('artifacts/regression-'+label+'-summary.json',import.meta.url);
 let source=fs.readFileSync(original,'utf8');
 source=source.replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,original).href))
  .replace("new URL('database.rules.json',import.meta.url)",`new URL(${JSON.stringify(rules.href)})`)
  .replace(/new URL\('artifacts\/(?:validate|common-local)-summary.json',import.meta.url\)/,`new URL(${JSON.stringify(result.href)})`)
  .replaceAll('import.meta.url',JSON.stringify(original.href))
  .replace(/process\.exit\((?:0|process\.exitCode\?\?0)\);/g,'');
 await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const r=JSON.parse(fs.readFileSync(result));assert(!r.failure);assert.equal(r.reports.length,count);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 const rebase=e=>Object.fromEntries(Object.entries(e).map(([f,h])=>['../'+folder+'/'+f,h]));
 r.sourceHashes={...rebase(r.sourceHashes),'regression.mjs':wrapperBefore,'database.rules.json':rulesBefore,['../'+folder+'/'+name]:digest(fs.readFileSync(original,'utf8'))};
 r.endSourceHashes={...rebase(r.endSourceHashes),'regression.mjs':digest(fs.readFileSync(self,'utf8')),'database.rules.json':digest(fs.readFileSync(rules,'utf8')),['../'+folder+'/'+name]:digest(fs.readFileSync(original,'utf8'))};
 assert.deepEqual(r.sourceHashes,r.endSourceHashes);r.executedRulesSource='database.rules.json';r.adaptedFrom='../'+folder+'/'+name;
 fs.writeFileSync(result,JSON.stringify(r,null,2)+'\n');
}
console.log(JSON.stringify({sharedGroups:14,managerGroups:12,queueGroups:12,generalGroups:4,actualRules:'GD91-98',externalFirebaseConnected:false}));
