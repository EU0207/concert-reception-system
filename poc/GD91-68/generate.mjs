import fs from 'node:fs';
import assert from 'node:assert/strict';
await import('../GD91-67/generate.mjs');
let rules=fs.readFileSync(new URL('../GD91-67/node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function replace(a,b){assert.equal(rules.split(a).length-1,1,a);rules=rules.replace(a,()=>b);}
replace("'attendeeIds':[],'roster':{}", "'attendeeIds':[],'roster':{},'groups':{}");
replace("['revision','operationId','attendeeIds','roster']", "['revision','operationId','attendeeIds','roster','groups']");
replace('&& next.roster == old.roster);','&& next.roster == old.roster && next.groups == old.groups);');
replace('&& a.roster[id] ==', '&& groupAppend(b,a,id,profile) && a.roster[id] ==');
replace("['schemaVersion','environmentId','performanceId','revision','operationId','publicationOperationId','assignments','cancelledAttendeeId','cancelNoTicketOperationId']", "['schemaVersion','environmentId','performanceId','revision','operationId','publicationOperationId','assignments','groups','bulkOperationId','cancelledAttendeeId','cancelNoTicketOperationId']");
replace(" && a.keys().hasOnly(['schemaVersion','environmentId','performanceId','revision','operationId','publicationOperationId','assignments'])", '');
replace('&& integer(a.revision) && uuid(a.operationId)', '&& a.groups is map && integer(a.revision) && uuid(a.operationId)');
replace('&& n.values.layout == 1 && n.values.source == 1', "&& a.groups == {} && a.bulkOperationId == '' && n.values.layout == 1 && n.values.source == 1");
replace("coreVersion(p,b,a,e) : manager(p) && e.kind", "coreVersion(p,b,a,e) : bulkKind(e.kind) ? bulkVersion(p,b,a,e) : manager(p) && e.kind");
// 初回割当の形はfirstAssignment、公開との一体性はfirstEventからも検査する。
replace('      let n = afterAssignment(p);\n      return manager(p) && firstBase', '      return manager(p) && firstBase');
replace("&& readyCandidate(p,e,m,{'seatIds':[],'entityIds':[]},b,a)\n        && n.publicationOperationId == a.operationId && n.operationId == a.operationId && n.revision == 1;", "&& readyCandidate(p,e,m,{'seatIds':[],'entityIds':[]},b,a)\n        && existsAfter(/databases/$(database)/documents/publicationShows/$(p)/assignmentState/current);");
replace("? assignmentUpdate(p,resource.data,request.resource.data) : request.resource.data.get('cancelNoTicketOperationId','')", "? assignmentUpdate(p,resource.data,request.resource.data) : request.resource.data.bulkOperationId == request.resource.data.operationId ? bulkAssignment(p,resource.data,request.resource.data) : request.resource.data.get('cancelNoTicketOperationId','')");
replace("coreEvent(p,id,request.resource.data) : request.resource.data.kind == 'publishSection'", "coreEvent(p,id,request.resource.data) : bulkKind(request.resource.data.kind) ? bulkEvent(p,id,request.resource.data) : request.resource.data.kind == 'publishSection'");
replace('    match /publicationShows/{p} {', fs.readFileSync(new URL('bulk.rules',import.meta.url),'utf8')+'\n    match /publicationShows/{p} {');
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules);
console.log(JSON.stringify({generatedFrom:'GD91-67',extension:'bulk.rules'}));
