import fs from 'node:fs';import assert from 'node:assert/strict';
await import('../GD91-62/generate.mjs');
let rules=fs.readFileSync(new URL('../GD91-62/node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function replace(from,to){assert.equal(rules.split(from).length-1,1,from);rules=rules.replace(from,()=>to);}
function body(name,text){const start=rules.indexOf('    function '+name+'(');assert(start>=0,name);let end=rules.indexOf('{',start),depth=1;while(depth){end++;if(rules[end]==='{')depth++;if(rules[end]==='}')depth--;}rules=rules.slice(0,start)+text.trimEnd()+rules.slice(end+1);}
replace("['attendeeCreate','attendeePaid','assign','unassign','move','swap']","['attendeeCreate','attendeePaid','assign','unassign','move','swap','qrCreate','ticketCheck','qrReissue','cancelAttendance','returnAttendance']");
replace('return coreKind(e.kind) ? coreVersion(p,b,a,e)',"return lifeKind(e.kind) ? lifeVersion(p,b,a,e) : coreKind(e.kind) ? coreVersion(p,b,a,e)");
replace('allow create: if coreKind(request.resource.data.kind) ? coreEvent(p,id,request.resource.data)',"allow create: if lifeKind(request.resource.data.kind) ? lifeEvent(p,id,request.resource.data) : coreKind(request.resource.data.kind) ? coreEvent(p,id,request.resource.data)");
replace('allow update: if corePaid(p,id,resource.data,request.resource.data);',"allow update: if request.resource.data.attendancePlan != resource.data.attendancePlan ? lifeProfile(p,id,resource.data,request.resource.data) : corePaid(p,id,resource.data,request.resource.data);");
replace('allow update: if coreIndex(p,resource.data,request.resource.data);',"allow update: if lifeKind(nextEvent(p,request.resource.data.operationId).kind) ? lifePeople(p,resource.data,request.resource.data) : coreIndex(p,resource.data,request.resource.data);");
replace(' : coreAssignment(p,resource.data,request.resource.data);'," : nextEvent(p,request.resource.data.operationId).kind == 'cancelAttendance' ? lifeAssignment(p,resource.data,request.resource.data) : coreAssignment(p,resource.data,request.resource.data);");
// 分岐用の追加参照を避ける。出所は各子文書の相互照合で確定する。
replace('lifeKind(nextEvent(p,request.resource.data.operationId).kind)',"request.resource.data.attendeeIds.size() != resource.data.attendeeIds.size() && request.resource.data.attendeeIds.size() <= resource.data.attendeeIds.size()");
replace("nextEvent(p,request.resource.data.operationId).kind == 'cancelAttendance'",'request.resource.data.keys().hasAny([\'cancelledAttendeeId\'])');
const fragments=fs.readFileSync(new URL('lifecycle.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const coreSeat=`    function coreSeat(p,v,sectionId,seatId) {
      let g = v.sections[sectionId];
      let fact = get(/databases/$(database)/documents/sourceProofShows/$(p)/sections/$(sectionId)/generations/$(g)/seatFacts/$(seatId)).data;
      return v.seatIds.hasAny([seatId]) && fact.generation == g && fact.fact.item.cell.seatId == seatId && fact.fact.attributes.usable == true;
    }`;
body('coreSeat',coreSeat);
replace("return b.values.layout > 0 && a.values.diff(b.values).affectedKeys().hasOnly(['commit','assignment','reception'])","return b.values.layout > 0 && a.values.diff(b.values).affectedKeys().hasOnly(['commit','assignment','ticket','reception'])");
replace('&& proto(p,tickets) && tickets.revision == b.values.ticket && tickets.seatIds.size() == 0','&& lifeAllocationProtection(p,b,a,e,tickets)');
replace('// 券保護の通常更新は後続で接続する。現段階で発券済みの経路は許可しない。','// 券保護の移動量とQR保持を通常業務と一体で検査する。');
replace("&& a.publicationOperationId == b.publicationOperationId && a.operationId == n.operationId", "&& !a.keys().hasAny(['cancelledAttendeeId']) && a.publicationOperationId == b.publicationOperationId && a.operationId == n.operationId");
// 不参加の割当マーカーは次の通常席設定で除去する。
replace("a.keys().hasOnly(['schemaVersion','environmentId','performanceId','revision','operationId','publicationOperationId','assignments'])","a.keys().hasOnly(['schemaVersion','environmentId','performanceId','revision','operationId','publicationOperationId','assignments','cancelledAttendeeId'])");
replace('&& a.keys() == b.keys() && a.diff(b).affectedKeys().hasOnly([\'revision\',\'operationId\',\'assignments\'])',"&& a.keys().hasOnly(['schemaVersion','environmentId','performanceId','revision','operationId','publicationOperationId','assignments']) && a.diff(b).affectedKeys().hasOnly(['revision','operationId','assignments','cancelledAttendeeId'])");
replace("coreNextLabel(p,e.targetId).operationId == a.operationId : e.kind == 'attendeePaid');","coreNextLabel(p,e.targetId).operationId == a.operationId : e.kind == 'returnAttendance' ? lifePeople(p,b,a) : e.kind == 'attendeePaid');");
replace('    match /publicationShows/{p} {',fragments+`\n    match /publicationShows/{p} {
      match /ticketProtection/current { allow get: if manager(p); allow update: if lifeProtection(p,resource.data,request.resource.data); }
      match /tickets/{id} { allow get: if manager(p); allow create: if lifeTicket(p,id,null,request.resource.data,true); allow update: if lifeTicket(p,id,resource.data,request.resource.data,false); }
      match /credentials/{id} { allow get: if manager(p); allow create: if lifeCredential(p,id,request.resource.data); allow update: if lifeRevoke(p,id,resource.data,request.resource.data,false); }
      match /confirmationCodes/{id} { allow get: if manager(p); allow create: if lifeCode(p,id,request.resource.data); allow update: if lifeRevoke(p,id,resource.data,request.resource.data,true); }`);
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules);
console.log(JSON.stringify({generatedFrom:'GD91-62 plus GD91-60',extension:'lifecycle.rules'}));
