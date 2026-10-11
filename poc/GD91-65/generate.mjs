import fs from 'node:fs';import assert from 'node:assert/strict';
await import('../GD91-64/generate.mjs');
let rules=fs.readFileSync(new URL('../GD91-64/node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
function replace(a,b){assert.equal(rules.split(a).length-1,1,a);rules=rules.replace(a,()=>b);}
replace('    match /publicationShows/{p} {',read('initial.rules')+'\n    match /publicationShows/{p} {');
// 索引側が正本・表示名を照合するため、正本から索引への重複参照を構成状態の検査へ振り替える。
replace('      let index = coreNextPeople(p);','');
replace('&& index.operationId == a.operationId && index.revision == v.values.attendee && index.attendeeIds.hasAny([id])','&& coreRosterState(p,v)');
replace('match /versions/current { allow get: if manager(p);','match /versions/current { allow create: if initVersion(p,request.resource.data); allow get: if manager(p);');
replace('match /eligible/current { allow get: if manager(p);','match /eligible/current { allow create: if initChild(p,request.resource.data,true); allow get: if manager(p);');
replace('match /ticketProtection/current { allow get: if manager(p);','match /ticketProtection/current { allow create: if initChild(p,request.resource.data,false); allow get: if manager(p);');
replace('match /assignmentState/current { allow get: if manager(p);','match /assignmentState/current { allow create: if firstAssignment(p,request.resource.data); allow get: if manager(p);');
replace("return lifeKind(e.kind) ? lifeVersion(p,b,a,e)","return e.kind == 'publishSection' && b.values.layout == 0 ? firstVersion(p,b,a,e) : lifeKind(e.kind) ? lifeVersion(p,b,a,e)");
replace('allow create: if lifeKind(request.resource.data.kind) ?','allow create: if request.resource.data.kind == \'bootstrapBusiness\' ? initEvent(p,id,request.resource.data) : request.resource.data.kind == \'publishSection\' && request.resource.data.baseGeneration == \'\' ? firstEvent(p,id,request.resource.data) : lifeKind(request.resource.data.kind) ?');
// 初回には旧構成がない。旧構成の比較証明を捏造せず、版0を確認した別の完了検査へ分岐する。
replace('      function finishComparison(g,a) {',`      function finishFirstComparison(g,a) {
        let h = get(/databases/$(database)/documents/sourceProofShows/$(p)/sections/$(sectionNamespace)/generations/$(g)/head/current).data;
        let structure = get(/databases/$(database)/documents/sourceProofShows/$(p)/sections/$(sectionNamespace)/generations/$(g)/structureProof/current).data;
        let v = get(/databases/$(database)/documents/publicationShows/$(p)/versions/current).data;
        return header(g,h) && binding(g,h,a) && binding(g,h,structure) && h.baseGeneration == ''
          && v.values.layout == 0 && v.values.source == 0 && v.values.assignment == 0 && v.sections == {} && v.seatIds == []
          && shape(a,['formatVersion','generation','baseGeneration','controlRevision','operationId','proofPlan','changedSeatIds','protectionRevision','seats'])
          && a.operationId == g && a.proofPlan == 'GD91-57' && a.seats == structure.seats && a.changedSeatIds == [] && a.protectionRevision == v.values.ticket;
      }
      function finishComparison(g,a) {`);
replace('allow create: if finishComparison(g,request.resource.data);',"allow create: if request.resource.data.baseGeneration == '' ? finishFirstComparison(g,request.resource.data) : finishComparison(g,request.resource.data);");
replace('let old = get(/databases/$(database)/documents/publicationShows/$(p)/candidates/$(m.baseGeneration)).data;',"let old = m.baseGeneration == '' ? {'entityIds':[]} : get(/databases/$(database)/documents/publicationShows/$(p)/candidates/$(m.baseGeneration)).data;");
replace('v.sections[m.sectionId] == m.baseGeneration',"(m.baseGeneration == '' ? v.values.layout == 0 && v.values.source == 0 && v.values.assignment == 0 && v.sections == {} && v.seatIds == [] : v.sections[m.sectionId] == m.baseGeneration)");
replace('&& old.schemaVersion == 1 && old.environmentId == m.environmentId && old.performanceId == p && old.sectionId == m.sectionId && old.generation == m.baseGeneration && old.ready == true',"&& (m.baseGeneration == '' || old.schemaVersion == 1 && old.environmentId == m.environmentId && old.performanceId == p && old.sectionId == m.sectionId && old.generation == m.baseGeneration && old.ready == true)");
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules);
console.log(JSON.stringify({generatedFrom:'GD91-64',extension:'initial.rules',firstPublicationWrites:3}));
