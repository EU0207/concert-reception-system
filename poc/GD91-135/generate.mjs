import fs from 'node:fs';import assert from 'node:assert/strict';import {generated} from '../GD91-126/contract-rules.mjs';
const root=new URL('./',import.meta.url);let source=fs.readFileSync(new URL('../GD91-111/numbering-regression.mjs',root),'utf8');
const old="'generate.mjs','check-generation.mjs','run-local.mjs'";assert(source.includes(old));source=source.replace(old,"'generate.mjs','bootstrap.mjs','run-local.mjs','../GD91-131/runtime-hook.mjs','../GD91-131/qr-model.mjs'").replace('process.exit(process.exitCode??0);','');
fs.writeFileSync(new URL('numbering-regression.mjs',root),source);fs.writeFileSync(new URL('database.rules.json',root),JSON.stringify(generated(),null,2)+'\n');
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
