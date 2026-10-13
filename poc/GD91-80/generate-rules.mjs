import fs from 'node:fs';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const parent=read('../GD91-78/node_modules/.cache/firestore.rules');
const receipt=read('../GD91-77/receipt.rules');
function take(source,name){
  const marker='function '+name+'(';assert.equal(source.split(marker).length,2,name);
  const start=source.indexOf(marker),open=source.indexOf('{',start);let depth=1,end=open+1;
  while(depth){assert(end<source.length);if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}
  return source.slice(start,end);
}
const names=['currentPreparation','generalPreparation','recentHumanAt','recentHuman','identity','authorizedLevel','authorized','active','control'];
const functions=names.map(n=>take(parent,n)).concat(take(receipt,'deltaRead'));
const minimal=read('../GD91-79/minimal.rules');
const marker='    match /{document=**} { allow read, write: if false; }';assert(minimal.includes(marker));
const actual=functions.join('\n')+'\nmatch /publicationShows/{p}/receiptEvents/{id} {\nallow read: if deltaRead(p);\nallow write: if false;\n}\n';
fs.writeFileSync(new URL('remote.rules',import.meta.url),minimal.replace(marker,actual+'\n'+marker));
console.log(JSON.stringify({unchangedAuthorizationFunctions:names.length+1,productionRulesChanged:false,clientWritesAllowed:false}));
