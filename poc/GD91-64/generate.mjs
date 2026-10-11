import fs from 'node:fs';
import assert from 'node:assert/strict';
await import('../GD91-63/generate.mjs');
let rules=fs.readFileSync(new URL('../GD91-63/node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const fragment=fs.readFileSync(new URL('branches.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function replace(from,to){assert.equal(rules.split(from).length-1,1,from);rules=rules.replace(from,()=>to);}
function body(s,start){let end=s.indexOf('{',start),depth=1;while(depth){end++;if(s[end]==='{')depth++;if(s[end]==='}')depth--;}return s.slice(start,end+1);}
for(const m of fragment.matchAll(/^    function (\w+)\(/gm)){
 const next=body(fragment,m.index),start=rules.indexOf('    function '+m[1]+'(');
 if(start<0)replace('    match /publicationShows/{p} {',next+'\n    match /publicationShows/{p} {');
 else rules=rules.slice(0,start)+next+rules.slice(start+body(rules,start).length);
}
assert.equal(rules.split("'cancelAttendance','returnAttendance']; }").length-1,2);
rules=rules.replaceAll("'cancelAttendance','returnAttendance']; }","'cancelAttendance','returnAttendance','cancelWithoutTicket']; }");
// マーカーは対象の選択にだけ使い、保存内容は共通版・履歴へ照合する。
replace("return a.attendancePlan == 'notAttending' ? lifeCancelProfile(p,id,b,a) : lifeReturnProfile(p,id,b,a);","return a.get('cancelNoTicketOperationId','') == a.operationId ? branchProfile(p,id,b,a) : a.attendancePlan == 'notAttending' ? lifeCancelProfile(p,id,b,a) : lifeReturnProfile(p,id,b,a);");
replace("return a.attendeeIds.size() < b.attendeeIds.size() ? lifeCancelPeople(p,b,a) : lifeReturnPeople(p,b,a);","return a.get('cancelNoTicketOperationId','') == a.operationId ? branchPeople(p,b,a) : a.attendeeIds.size() < b.attendeeIds.size() ? lifeCancelPeople(p,b,a) : lifeReturnPeople(p,b,a);");
replace("request.resource.data.keys().hasAny(['cancelledAttendeeId']) ? lifeAssignment", "request.resource.data.get('cancelNoTicketOperationId','') == request.resource.data.operationId ? branchAssignment(p,resource.data,request.resource.data) : request.resource.data.keys().hasAny(['cancelledAttendeeId']) ? lifeAssignment");
replace("(e.kind == 'returnAttendance' ? lifeReturnEvent(p,e) : lifeTicketEvent(p,e))","(e.kind == 'cancelWithoutTicket' ? branchEvent(p,e) : e.kind == 'returnAttendance' ? lifeReturnEvent(p,e) : lifeTicketEvent(p,e))");
// 不参加の識別子を保持した名簿でも通常の入金更新を継続できる。
replace("a.keys().hasOnly(['schemaVersion','environmentId','performanceId','attendeeId','buyerId','attendancePlan','paid','revision','operationId'])", "a.keys().hasOnly(['schemaVersion','environmentId','performanceId','attendeeId','buyerId','attendancePlan','paid','revision','operationId','cancelNoTicketOperationId'])");
replace("a.keys().hasOnly(['schemaVersion','environmentId','performanceId','revision','operationId','publicationOperationId','assignments','cancelledAttendeeId'])", "a.keys().hasOnly(['schemaVersion','environmentId','performanceId','revision','operationId','publicationOperationId','assignments','cancelledAttendeeId','cancelNoTicketOperationId'])");
replace("!a.keys().hasAny(['cancelledAttendeeId'])", "!a.keys().hasAny(['cancelledAttendeeId','cancelNoTicketOperationId'])");
const allocationStart=rules.indexOf('    function coreAssignment('),allocationBody=body(rules,allocationStart);
rules=rules.slice(0,allocationStart)+allocationBody.replace("['revision','operationId','assignments','cancelledAttendeeId'])", "['revision','operationId','assignments','cancelledAttendeeId','cancelNoTicketOperationId'])")+rules.slice(allocationStart+allocationBody.length);
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules);
console.log(JSON.stringify({generatedFrom:'GD91-63',extension:'branches.rules'}));
