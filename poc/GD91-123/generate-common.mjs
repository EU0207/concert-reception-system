import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
let source=fs.readFileSync(new URL('../GD91-119/local.mjs',root),'utf8');
function replace(a,b){assert(source.includes(a),a);source=source.replaceAll(a,b);}
replace("from '../GD91-116/generate.mjs'","from './image-rules.mjs'");
replace("from '"+"./cases.mjs'","from './common-cases.mjs'");
replace("['local.mjs','cases.mjs','../GD91-116/generate.mjs']","['common-local.mjs','common-cases.mjs','image-rules.mjs']");
replace("'generate.mjs':createHash('sha256').update(fs.readFileSync(new URL('generate.mjs',import.meta.url),'utf8').replace(/\\r\\n/g,'\\n')).digest('hex')","'generate-common.mjs':createHash('sha256').update(fs.readFileSync(new URL('generate-common.mjs',import.meta.url),'utf8').replace(/\\r\\n/g,'\\n')).digest('hex')");
replace("artifacts/local-summary.json","artifacts/common-local-summary.json");
fs.writeFileSync(new URL('common-local.mjs',root),source);
