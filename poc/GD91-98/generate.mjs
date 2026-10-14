import fs from 'node:fs';
import {addQuarantine} from './quarantine-rules.mjs';
const rules=addQuarantine(JSON.parse(fs.readFileSync(new URL('../GD91-96/database.rules.json',import.meta.url),'utf8')));
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
for(const file of['deny.rules.json','firebase.json'])fs.copyFileSync(new URL('../GD91-96/'+file,import.meta.url),new URL(file,import.meta.url));
console.log(JSON.stringify({rulesBytes:Buffer.byteLength(JSON.stringify(rules)),externalFirebaseConnected:false}));
