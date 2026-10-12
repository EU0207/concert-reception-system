import fs from 'node:fs';import assert from 'node:assert/strict';
await import('../GD91-71/generate.mjs');
let rules=fs.readFileSync(new URL('../GD91-71/node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const marker='    match /publicationShows/{p} {';assert.equal(rules.split(marker).length-1,1);
rules=rules.replace(marker,()=>fs.readFileSync(new URL('distribution.rules',import.meta.url),'utf8')+'\n'+marker);
const legacy='allow get: if normalRead(p); allow list: if normalRead(p) && limited(); allow write: if false;';assert.equal(rules.split(legacy).length-1,1);
rules=rules.replace(legacy,"allow get: if normalRead(p) && !exists(/databases/$(database)/documents/publicationShows/$(p)/receptionHead/current); allow list: if normalRead(p) && !exists(/databases/$(database)/documents/publicationShows/$(p)/receptionHead/current) && limited(); allow write: if false;");
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules);
console.log(JSON.stringify({generatedFrom:'GD91-71',extension:'distribution.rules',canonicalWritesAdded:0}));
