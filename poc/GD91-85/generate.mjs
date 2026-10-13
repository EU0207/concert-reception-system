import fs from 'node:fs';
const rules=JSON.parse(fs.readFileSync(new URL('../GD91-84/database.rules.json',import.meta.url),'utf8'));
const run=rules.rules.checks.$run,inventory=[];
const number=(path,min=1)=>{const n=`data.child('${path}')`;return `${n}.val() === null || (${n}.isNumber() && ${n}.val() >= ${min})`;};
const scalar=(path,type)=>{const n=path?`data.child('${path}')`:'data';return type==='boolean'?`${n}.val() === null || ${n}.val() === true || ${n}.val() === false`:`${n}.val() === null || (${n}.isString() && ${n}.val().length >= 0)`;};
function protect(path,dependency,mutability){let node=run;for(const key of path.split('/'))node=node[key];node['.read']=`(${node['.read']}) && (${dependency})`;inventory.push({path,dependency,mutability});}
for(const path of ['control','head','sharedHead','generations/$generation/meta'])protect(path,number('revision'),'versioned');
protect('references/$ref',scalar('active','boolean'),'one-way-release');
protect('generations/$generation/parts/$part',number('index',0),'immutable-part');
protect('generations/$generation/sections/$section',scalar('name','string'),'immutable-section');
for(const path of ['operations/$op','sharedOperations/$op'])protect(path,number('resultRevision'),'immutable-result');
for(const path of ['general','management','sensitive','temporary'])protect('probes/'+path,scalar('','string'),'diagnostic-scalar');
// 保存契約へ未接続の旧診断入口は開放しない。
for(const path of ['view','private','shared'])run[path]['.read']=false;
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
fs.writeFileSync(new URL('deny.rules.json',import.meta.url),JSON.stringify({rules:{'.read':false,'.write':false}},null,2)+'\n');
fs.writeFileSync(new URL('artifacts/read-contract.json',import.meta.url),JSON.stringify({protected:inventory,selfStatus:['roles/$human','devices/$uid','sessions/$uid'],disabled:['view','private','shared'],wholeBusinessConnected:false},null,2)+'\n');
console.log(JSON.stringify({protectedReadLocations:inventory.length,externalConnection:false}));
