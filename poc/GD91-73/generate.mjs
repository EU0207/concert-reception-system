import fs from 'node:fs';import assert from 'node:assert/strict';
await import('../GD91-72/generate.mjs');
let rules=fs.readFileSync(new URL('../GD91-72/node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const replace=(a,b)=>{assert.equal(rules.split(a).length-1,1,a);rules=rules.replace(a,()=>b);};
replace('    match /publicationShows/{p} {',fs.readFileSync(new URL('index.rules',import.meta.url),'utf8')+'\n    match /publicationShows/{p} {');
const sharedStart=rules.indexOf('    function sharedDraft('),sharedEnd=rules.indexOf('\n    }',sharedStart)+6;
assert(sharedStart>0&&sharedEnd>sharedStart);
let shared=rules.slice(sharedStart,sharedEnd).replace("'expectedVersions','baseVersions'","'expectedVersions','expectedSharedVersion','baseVersions'").replace('&& a.occurredAt == request.time;','&& a.occurredAt == request.time && sharedSelectionFence(p,id,a);');
assert(shared.includes('sharedSelectionFence'));rules=rules.slice(0,sharedStart)+shared+rules.slice(sharedEnd);
// 正本が必須とする同一IDの履歴へ索引フェンスを置き、正本側の評価を増やさない。
const operationStart=rules.indexOf('      match /operations/{id} {'),operationEnd=rules.indexOf('\n',operationStart);
assert(operationStart>0&&operationEnd>operationStart);
let operation=rules.slice(operationStart,operationEnd).replace('allow create: if ','allow create: if (').replace('; }',' ) && publicIndexFence(p,request.resource.data.resultVersions); }');
rules=rules.slice(0,operationStart)+operation+rules.slice(operationEnd);
replace('allow create: if stateEvent(p,id,request.resource.data);','allow create: if stateEvent(p,id,request.resource.data) && publicIndexFence(p,afterVersion(p).values);');
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules);
fs.copyFileSync(new URL('../GD91-72/firebase.json',import.meta.url),new URL('firebase.json',import.meta.url));
console.log(JSON.stringify({generatedFrom:'GD91-72',extension:'index.rules',additionalFinalWrites:1}));
