import fs from 'node:fs';
import assert from 'node:assert/strict';
import {generated} from '../GD91-126/contract-rules.mjs';
const root=new URL('./',import.meta.url);
const replace=(s,a,b)=>{assert.equal(s.split(a).length-1,1,'adaptation-target:'+a);return s.replace(a,b);};
let capacity=fs.readFileSync(new URL('../GD91-121/capacity.mjs',root),'utf8').replace(/\r\n/g,'\n');
capacity="import {stats as qrStats} from './model.mjs';\n"+capacity;
capacity=replace(capacity,"'capacity.mjs','bootstrap.mjs','sdk-client.mjs'","'capacity.mjs','bootstrap.mjs','sdk-client.mjs','model.mjs','../GD91-126/contract-rules.mjs'");
const marker="assert(!source.includes(\"new URL('artifacts/\"),'unredirected-result');";
capacity=replace(capacity,marker,`
const oldModel='import {command,applyModel} from '+JSON.stringify(new URL('../GD91-103/model.mjs',import.meta.url).href)+';';
assert(source.includes(oldModel),'normal-command-import-not-found');
source=source.replace(oldModel,'import {command,applyModel} from '+JSON.stringify(new URL('./model.mjs',import.meta.url).href)+';');
assert(source.includes('code:String(10000000+i)'),'numeric-fixture-override-not-found');
source=source.replace('code:String(10000000+i)','');
`+marker);
capacity=replace(capacity,"const r=JSON.parse(fs.readFileSync(result));",`const r=JSON.parse(fs.readFileSync(result));
assert.equal(qrStats.created,Number(process.env.GD101_PEOPLE));assert.equal(qrStats.checked,qrStats.created);
r.qrFormatVerification={...qrStats,approvedContract:'BD-07-04',ordinaryRandomGenerationUsed:true};`);
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});fs.writeFileSync(new URL('capacity.mjs',root),capacity);
for(const name of ['bootstrap.mjs','sdk-client.mjs','emulator-maintenance.mjs']){
  fs.writeFileSync(new URL(name,root),fs.readFileSync(new URL('../GD91-121/'+name,root),'utf8'));
}
let runner=fs.readFileSync(new URL('../GD91-121/run-local.mjs',root),'utf8').replace(/\r\n/g,'\n');
runner=replace(runner,'node poc/GD91-121/bootstrap.mjs','node poc/GD91-127/bootstrap.mjs');
fs.writeFileSync(new URL('run-local.mjs',root),runner);
fs.writeFileSync(new URL('database.rules.json',root),JSON.stringify(generated(),null,2)+'\n');
console.log(JSON.stringify({rules:'GD91-126',normalCommand:'GD91-126',numericCodeOverrideRemoved:true,
  lifecycleAndClosingLogicUnchanged:true,externalFirebaseConnected:false}));
