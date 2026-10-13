import fs from 'node:fs';
import {addLifecycle} from './lifecycle-rules.mjs';
const rules=addLifecycle(JSON.parse(fs.readFileSync(new URL('../GD91-87/database.rules.json',import.meta.url),'utf8')));
fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
fs.copyFileSync(new URL('../GD91-87/deny.rules.json',import.meta.url),new URL('deny.rules.json',import.meta.url));
console.log(JSON.stringify({rulesBytes:Buffer.byteLength(JSON.stringify(rules)),externalRequests:0}));
