import fs from 'node:fs';
import assert from 'node:assert/strict';
const parent=fs.readFileSync(new URL('../GD91-77/node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const before='allow list: if deltaRead(p) && limited();';
assert.equal(parent.split(before).length,2);
const after='allow list: if deltaRead(p) && request.query.limit > 0 && request.query.limit <= 2048;';
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),parent.replace(before,after));
console.log(JSON.stringify({parent:'GD91-77',receiptListLimitOnly:2048,productionRulesChanged:false}));
