import fs from 'node:fs';import assert from 'node:assert/strict';
const original=new URL('validate.mjs',import.meta.url);let source=fs.readFileSync(original,'utf8');
source=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,quote,path)=>'from '+JSON.stringify(new URL(path==='./cases.mjs'?'./common-cases.mjs':path,original).href));
assert(source.includes("['validate.mjs'"));source=source.replace("['validate.mjs'","['common-local.mjs','common-cases.mjs','validate.mjs'");source=source.replace("'artifacts/validate-summary.json'","'artifacts/common-local-summary.json'").replaceAll('import.meta.url',JSON.stringify(original.href));
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
