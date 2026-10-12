import fs from 'node:fs';
import assert from 'node:assert/strict';
const parent = fs.readFileSync(new URL('../GD91-73/node_modules/.cache/firestore.rules', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const marker = '    match /{document=**} { allow read,write: if false; }';
assert.equal(parent.split(marker).length, 2);
const extension = fs.readFileSync(new URL('receipt.rules', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
fs.mkdirSync(new URL('node_modules/.cache/', import.meta.url), {recursive: true});
fs.writeFileSync(new URL('node_modules/.cache/firestore.rules', import.meta.url), parent.replace(marker, () => extension + '\n' + marker));
console.log(JSON.stringify({parent: 'GD91-73', existingRulesChanged: false, extension: 'receiptEvents'}));
