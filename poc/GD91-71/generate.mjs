import fs from 'node:fs';import assert from 'node:assert/strict';
await import('../GD91-70/generate.mjs');
let rules=fs.readFileSync(new URL('../GD91-70/node_modules/.cache/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function replace(a,b){assert.equal(rules.split(a).length-1,1,a);rules=rules.replace(a,()=>b);}
function body(n){const start=rules.indexOf('    function '+n+'(');assert(start>=0,n);let i=rules.indexOf('{',start),d=1;while(d){i++;if(rules[i]==='{')d++;if(rules[i]==='}')d--;}return rules.slice(start,i+1);}
replace('    function translatedCell(h,b,a) {',fs.readFileSync(new URL('individual.rules',import.meta.url),'utf8')+'\n    function translatedCell(h,b,a) {');
replace('h.edit.kind == "extend"','h.edit.kind in ["extend","add","renumber","move"]');
replace("let vertical = e.dimension == 'rows';","let vertical = e.get('dimension','rows') == 'rows';");
replace("extensionFact(h,before.fact,get(/databases/$(database)/documents/sourceProofShows/$(p)/sections/$(sectionNamespace)/generations/$(g)/cellFacts/$(id)).data.fact)","individualCell(h,before.fact,get(/databases/$(database)/documents/sourceProofShows/$(p)/sections/$(sectionNamespace)/generations/$(g)/cellFacts/$(id)).data.fact)");
replace(body('scanComparison'),body('scanComparison').replace("&& after.fact.item.cell.get('consumedNumber',null) == before.fact.item.cell.get('consumedNumber',null)","&& (h.get('edit',null) != null && h.edit.kind == 'move' && h.edit.seatId == id || after.fact.item.cell.get('consumedNumber',null) == before.fact.item.cell.get('consumedNumber',null))"));
replace('&& numberSlot(h,c,catalog.lines,b,a) && indexedSeat',"&& (h.get('edit',null) == null ? numberSlot(h,c,catalog.lines,b,a) : a.numberCursors == b.numberCursors) && indexedSeat");
let descriptor=body('extensionDescriptor');descriptor=descriptor.replace('return e.keys()',"return e.kind != 'extend' ? e.keys().toSet() == ['kind','oldRows','oldColumns','rowDelta','columnDelta','rowOffset','columnOffset','reason','seatId','sourceCellId','targetCellId'].toSet()\n        && e.kind in ['add','renumber','move'] && e.oldRows == old.geometry.rows && e.oldColumns == old.geometry.columns\n        && h.rows == e.oldRows && h.columns == e.oldColumns && e.rowDelta == 0 && e.columnDelta == 0\n        && e.rowOffset == view.rowOffset && e.columnOffset == view.columnOffset\n        : e.keys()");replace(body('extensionDescriptor'),descriptor);
replace("&& result.generation == g && result.baseGeneration == h.baseGeneration && result.changedSeatIds == [] && result.seats == old.seatIds.size()", "&& result.generation == g && result.baseGeneration == h.baseGeneration\n        && result.changedSeatIds == (h.edit.kind in ['extend','add'] ? [] : [h.edit.seatId])\n        && result.seats == old.seatIds.size()+(h.edit.kind == 'add' ? 1 : 0)\n        && (h.edit.kind == 'extend' || get(/databases/$(database)/documents/sourceProofShows/$(p)/sections/$(section)/generations/$(g)/editDetails/current).data == {'generation':g,'edit':h.edit})");
// 個別編集は同じ3文書の公開境界。既存席の最新未割当・券保護はpublicationAssignmentが検査する。
replace("e.kind == 'extendSection' ? extensionVersion(p,b,a,e)","e.kind in ['extendSection','seatEdit'] ? extensionVersion(p,b,a,e)");
replace("e.kind in ['publishSection','extendSection'] ? a.publicationOperationId","e.kind in ['publishSection','extendSection','seatEdit'] ? a.publicationOperationId");
replace("e.kind == 'extendSection' ? e.keys().hasAll(['edit'])","e.kind in ['extendSection','seatEdit'] ? e.keys().hasAll(['edit'])");
replace("e.kind in ['publishSection','extendSection','assignmentProbe']","e.kind in ['publishSection','extendSection','seatEdit','assignmentProbe']");
replace("e.kind in ['publishSection','extendSection'] ? publicationProof","e.kind in ['publishSection','extendSection','seatEdit'] ? publicationProof");
replace("request.resource.data.kind in ['publishSection','extendSection'] && eventCreate","request.resource.data.kind in ['publishSection','extendSection','seatEdit'] && eventCreate");
replace("(e.kind == 'extendSection' ? e.edit == m.edit && m.edit.kind == 'extend' && m.changedSeatIds == [] && m.seatIds.toSet() == old.seatIds.toSet() : m.get('edit',null) == null)","(e.kind in ['extendSection','seatEdit'] ? e.edit == m.edit && (e.kind == 'extendSection' ? m.edit.kind == 'extend' && m.changedSeatIds == [] && m.seatIds.toSet() == old.seatIds.toSet() : m.edit.kind in ['add','renumber','move'] && (m.edit.kind == 'add' ? m.changedSeatIds == [] && m.seatIds.toSet() == old.seatIds.toSet().union([m.edit.seatId].toSet()) : m.changedSeatIds == [m.edit.seatId] && m.seatIds.toSet() == old.seatIds.toSet())) : m.get('edit',null) == null)");
replace("&& m.edit.kind == 'extend' && e.edit == m.edit", "&& (e.kind == 'extendSection' ? m.edit.kind == 'extend' : m.edit.kind in ['add','renumber','move']) && e.edit == m.edit");
replace("c.firstReceptionStartedAt == null && request.time < c.dayStartsAt || m.edit.reason.matches", "e.kind == 'extendSection' && c.firstReceptionStartedAt == null && request.time < c.dayStartsAt || m.edit.reason.matches");
replace("&& a.seatIds == b.seatIds\n", "&& (m.edit.kind == 'add' || a.seatIds == b.seatIds)\n");
replace("hasOnly(['operationId','values','sections','usedIds','usedGenerations']) && (m.edit.kind", "hasOnly(['operationId','values','sections','seatIds','usedIds','usedGenerations']) && (m.edit.kind");
replace("'assignment':b.values.assignment,'attendee':b.values.attendee,'ticket':b.values.ticket,'control':b.values.control,'reception':b.values.reception+1}\n        && e.operationId", "'assignment':b.values.assignment+(m.edit.kind == 'add' ? 1 : 0),'attendee':b.values.attendee,'ticket':b.values.ticket,'control':b.values.control,'reception':b.values.reception+1}\n        && e.operationId");
fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),rules);
for(const name of ['global-support','comparison-support','candidate-support']){
 const original=new URL('../GD91-70/node_modules/.cache/'+name+'.mjs',import.meta.url);let source=fs.readFileSync(original,'utf8');
 source=source.replaceAll(new URL('../GD91-70/node_modules/.cache/global-support.mjs',import.meta.url).href,new URL('node_modules/.cache/global-support.mjs',import.meta.url).href);
 if(name==='global-support')source=source.replace("const consumed=x.cell.kind===", "if(f.head.edit){a.cursor++;a.lastChunk=p.id;return a;}\n const consumed=x.cell.kind===");
 fs.writeFileSync(new URL('node_modules/.cache/'+name+'.mjs',import.meta.url),source);
}
console.log(JSON.stringify({generatedFrom:'GD91-70',extension:'individual.rules',finalWrites:3}));
