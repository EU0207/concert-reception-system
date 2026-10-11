import fs from 'node:fs';
import assert from 'node:assert/strict';
// GD91-63の32ケース本体を変更せず、新しい候補・ヘルパーで再実行する。
const original=new URL('../../GD91-63/tests/emulator.mjs',import.meta.url);
let source=fs.readFileSync(original,'utf8').replace(/\r\n/g,'\n');
const cases=source.slice(source.indexOf(' await run('),source.indexOf(' const endSourceHashes='));
source=source.replaceAll("from './support.mjs'","from '"+new URL('support.mjs',import.meta.url).href+"'")
 .replaceAll("from './budgets.mjs'","from '"+new URL('budgets.mjs',import.meta.url).href+"'")
 .replaceAll("from '../../GD91-60/tests/access-support.mjs'","from '"+new URL('../../GD91-60/tests/access-support.mjs',import.meta.url).href+"'");
source=source.replace("'../generate.mjs','../lifecycle.rules'","'../../GD91-64/generate.mjs','../../GD91-64/branches.rules','../../GD91-64/tests/support.mjs','../../GD91-64/tests/budgets.mjs','../../GD91-64/tests/regression.mjs','../../GD91-64/node_modules/.cache/firestore.rules','../../GD91-64/node_modules/.cache/regression.mjs','../generate.mjs','../lifecycle.rules'");
source=source.replaceAll('new URL(p,import.meta.url)','new URL(p,'+JSON.stringify(original.href)+')');
source=source.replaceAll("'lifecycle-summary'","'regression-summary'");
source=source.replaceAll(",import.meta.url),JSON.stringify",","+JSON.stringify(import.meta.url)+"),JSON.stringify");
assert.equal(source.slice(source.indexOf(' await run('),source.indexOf(' const endSourceHashes=')),cases);
const generated=new URL('../node_modules/.cache/regression.mjs',import.meta.url);
fs.writeFileSync(generated,source);
await import(generated.href);
