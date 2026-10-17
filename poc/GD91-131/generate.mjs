import fs from 'node:fs';import assert from 'node:assert/strict';import {generated} from '../GD91-126/contract-rules.mjs';
const root=new URL('./',import.meta.url);let source=fs.readFileSync(new URL('../GD91-111/regression.mjs',root),'utf8');
assert(source.includes("actualRules:'GD91-111'"));source=source.replace("actualRules:'GD91-111'","actualRules:'GD91-126'").replace('process.exit(0);','')
 .replace("'run-regression.mjs'","'run-local.mjs','runtime-hook.mjs','qr-model.mjs','bootstrap.mjs'");
fs.writeFileSync(new URL('regression.mjs',root),source);fs.writeFileSync(new URL('database.rules.json',root),JSON.stringify(generated(),null,2)+'\n');
