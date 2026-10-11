import fs from 'node:fs';import assert from 'node:assert/strict';
const base=fs.readFileSync(new URL('../GD91-60/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const extension=fs.readFileSync(new URL('business.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
let rules=base;
const replacements=[
 ["return manager(p) && (e.kind == 'publishSection' ? publication(p,b,a,e) : e.kind == 'assignmentProbe' && assignmentProbe(p,b,a,e));", "return coreKind(e.kind) ? coreVersion(p,b,a,e) : manager(p) && e.kind == 'publishSection' && publication(p,b,a,e);"],
 ["allow update: if assignmentUpdate(p,resource.data,request.resource.data);", "allow update: if request.resource.data.publicationOperationId != resource.data.publicationOperationId ? assignmentUpdate(p,resource.data,request.resource.data) : coreAssignment(p,resource.data,request.resource.data);"],
 ["allow create: if eventCreate(p,id,request.resource.data);", "allow create: if coreKind(request.resource.data.kind) ? coreEvent(p,id,request.resource.data) : request.resource.data.kind == 'publishSection' && eventCreate(p,id,request.resource.data);"],
 ["    match /publicationShows/{p} {", extension+"\n    match /publicationShows/{p} {\n      match /eligible/current { allow get: if manager(p); allow update: if coreIndex(p,resource.data,request.resource.data); }\n      match /attendees/{id} { allow get: if manager(p); allow create: if coreProfile(p,id,request.resource.data,true); allow update: if corePaid(p,id,resource.data,request.resource.data); }\n      match /attendeeLabels/{id} { allow get: if manager(p); allow create: if coreLabel(p,id,request.resource.data); }"]
];
for(const [from,to] of replacements){assert.equal(rules.split(from).length-1,1,from);rules=rules.replace(from,()=>to);}
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules);
console.log(JSON.stringify({generatedFrom:'GD91-60/firestore.rules',extension:'business.rules',baseRulesUnchanged:true}));
