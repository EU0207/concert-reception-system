import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex'),hashes=()=>sourceHashes(new URL('./',import.meta.url),['regression.mjs','run-regression.mjs','generate.mjs','database.rules.json','../GD91-103/database.rules.json']);const before=hashes();
const rules=new URL('database.rules.json',import.meta.url),support=new URL('../GD91-99/support.mjs',import.meta.url),compat=new URL('../GD91-99/compat.mjs',import.meta.url),fetcher=new URL('../GD91-99/clock-transport.mjs',import.meta.url);
const scopes=[['GD91-105','validate.mjs',18,'section'],['GD91-105','common-local.mjs',4,'section-common'],['GD91-104','validate.mjs',9,'geometry-slide'],['GD91-104','structural-local.mjs',9,'structural'],['GD91-104','common-local.mjs',4,'display-common'],['GD91-103','validate.mjs',19,'groups'],['GD91-103','common-local.mjs',8,'groups-common'],['GD91-102','validate.mjs',21,'layout'],['GD91-102','common-local.mjs',8,'layout-common'],['GD91-100','validate.mjs',20,'closed'],['GD91-100','common-local.mjs',12,'closed-common'],['GD91-98','validate.mjs',13,'quarantine'],['GD91-94','validate.mjs',14,'sharing'],['GD91-92','validate.mjs',12,'manager'],['GD91-96','validate.mjs',12,'queue'],['GD91-97','common-local.mjs',4,'general'],['GD91-99','clock-local.mjs',7,'clock'],['GD91-99','review-local.mjs',16,'review'],['GD91-99','common-local.mjs',6,'common'],['GD91-106','validate.mjs',4,'read-budget']];
for(const[folder,name,count,label]of scopes){
 const original=new URL('../'+folder+'/'+name,import.meta.url),result=new URL('artifacts/regression-'+label+'-summary.json',import.meta.url);
 const executable=folder==='GD91-105'&&name==='common-local.mjs'?new URL('../'+folder+'/validate.mjs',import.meta.url):original;
 let source=fs.readFileSync(executable,'utf8');
 if(folder==='GD91-105')source=source.replaceAll("process.argv.includes('--minimal')",name==='common-local.mjs'?'true':'false');
 source=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,quote,p)=>{const u=new URL(p,original);return'from '+JSON.stringify(u.href.endsWith('/GD91-89/support.mjs')?support.href:u.href.endsWith('/GD91-84/transport.mjs')?compat.href:u.href);})
 .replace(/new URL\('(\.\.\/GD91-105\/)?database.rules.json',import.meta.url\)/g,`new URL(${JSON.stringify(rules.href)})`)
 .replace(/new URL\('artifacts\/(?:validate|structural-local|common-local|clock|review)-summary.json',import.meta.url\)/,`new URL(${JSON.stringify(result.href)})`)
 .replace(/new URL\('artifacts\/'\+\(minimal\?'common-local':'validate'\)\+'-summary.json',import.meta.url\)/,`new URL(${JSON.stringify(result.href)})`)
 .replaceAll('import.meta.url',JSON.stringify(original.href)).replace(/process\.exit\((?:0|process\.exitCode\?\?0)\);/g,'');
 assert(!source.includes("new URL('artifacts/"),'unredirected-regression-artifact');
 source='import {clockFetch as fetch} from '+JSON.stringify(fetcher.href)+';\n'+source;
 await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const r=JSON.parse(fs.readFileSync(result));assert(!r.failure);assert.equal((r.reports??r.runs).length,count);assert.deepEqual(r.sourceHashes,r.endSourceHashes);
 const rebase=e=>Object.fromEntries(Object.entries(e).map(([f,h])=>['../'+folder+'/'+f,h]));r.sourceHashes={...rebase(r.sourceHashes),...before,['../'+folder+'/'+name]:hash(fs.readFileSync(original,'utf8'))};r.endSourceHashes={...rebase(r.endSourceHashes),...hashes(),['../'+folder+'/'+name]:hash(fs.readFileSync(original,'utf8'))};assert.deepEqual(r.sourceHashes,r.endSourceHashes);r.executedRulesSource='database.rules.json';r.adaptedFrom='../'+folder+'/'+name;r.transportAdaptation='common clock, global ID index and review-progress coupling; legacy ACK shape';fs.writeFileSync(result,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({legacyScope:label,passed:true}));
}
console.log(JSON.stringify({existingGroups:216,readBudgetComparisons:4,actualRules:'GD91-110',externalFirebaseConnected:false}));process.exit(0);

