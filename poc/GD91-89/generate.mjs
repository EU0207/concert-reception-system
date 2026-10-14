import fs from 'node:fs';import {addProjection} from './projection-rules.mjs';
const rules=addProjection(JSON.parse(fs.readFileSync(new URL('../GD91-88/database.rules.json',import.meta.url),'utf8')));
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
fs.copyFileSync(new URL('../GD91-88/deny.rules.json',import.meta.url),new URL('deny.rules.json',import.meta.url));
console.log(JSON.stringify({rulesBytes:Buffer.byteLength(JSON.stringify(rules)),externalFirebaseConnected:false}));
