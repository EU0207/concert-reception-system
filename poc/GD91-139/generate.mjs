import fs from 'node:fs';import assert from 'node:assert/strict';
export function buildRules(){
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
 let business=read('../GD91-138/business.rules'),tail=business.indexOf('    match /{document=**}');assert(tail>0);business=business.slice(0,tail);
 const needle="&& (e.kind == 'exchange'";assert.equal(business.split(needle).length-1,1);
 business=business.replace(needle,"&& (e.kind == 'registerPerson' ? registerHead(b,a,e) : e.kind == 'exchange'");
 return read('auth.rules')+business+read('registration.rules');
}
if(process.argv[1]?.endsWith('generate.mjs')){fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),buildRules());}
