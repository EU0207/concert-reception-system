import fs from 'node:fs';import {addGroups} from './group-rules.mjs';
const rules=addGroups(JSON.parse(fs.readFileSync(new URL('../GD91-102/database.rules.json',import.meta.url))));
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
for(const f of['deny.rules.json','firebase.json'])fs.copyFileSync(new URL('../GD91-102/'+f,import.meta.url),new URL(f,import.meta.url));
console.log(JSON.stringify({rulesBytes:Buffer.byteLength(JSON.stringify(rules)),externalRequestsExecuted:0}));
