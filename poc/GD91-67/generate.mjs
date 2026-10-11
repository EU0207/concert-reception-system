import fs from 'node:fs';
import assert from 'node:assert/strict';
await import('../GD91-65/generate.mjs');
let rules = fs.readFileSync(new URL('../GD91-65/node_modules/.cache/firestore.rules', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const fragment = fs.readFileSync(new URL('roster.rules', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function replace(from, to) { assert.equal(rules.split(from).length - 1, 1, from); rules = rules.replace(from, () => to); }
replace("'operationId':id,'attendeeIds':[]}", "'operationId':id,'attendeeIds':[],'roster':{}}");
replace("['revision','operationId','attendeeIds'])\n        && old.revision", "['revision','operationId','attendeeIds','roster'])\n        && old.revision");
replace("&& next.attendeeIds.size() <= 500 : old.attendeeIds.hasAny([e.targetId]) && next.attendeeIds == old.attendeeIds);",
  "&& next.attendeeIds.size() <= 500 && rosterAppend(old,next,e.targetId,e.payload.after) : old.attendeeIds.hasAny([e.targetId]) && next.attendeeIds == old.attendeeIds && next.roster == old.roster);");
replace("&& a.paid is bool && a.revision is int && a.revision > 0", "&& a.paid is bool && a.revision is int && a.revision > 0 && rosterFields(a)");
replace("['schemaVersion','environmentId','performanceId','attendeeId','buyerId','attendancePlan','paid','revision','operationId'])",
  "['schemaVersion','environmentId','performanceId','attendeeId','buyerId','attendancePlan','paid','revision','operationId','groupId','rosterOrder'])");
replace("['schemaVersion','environmentId','performanceId','attendeeId','buyerId','attendancePlan','paid','revision','operationId','cancelNoTicketOperationId'])",
  "['schemaVersion','environmentId','performanceId','attendeeId','buyerId','attendancePlan','paid','revision','operationId','cancelNoTicketOperationId','groupId','rosterOrder'])");
replace("&& (e.kind == 'attendeeCreate' ? coreNextLabel(p,e.targetId).operationId == a.operationId :",
  "&& (e.kind == 'attendeeCreate' ? a.roster[e.targetId] == {'groupId':profile.groupId,'rosterOrder':profile.rosterOrder} && coreNextLabel(p,e.targetId).operationId == a.operationId :");
replace('    match /publicationShows/{p} {', fragment + '\n    match /publicationShows/{p} {');
fs.mkdirSync(new URL('node_modules/.cache/', import.meta.url), {recursive: true});
fs.writeFileSync(new URL('node_modules/.cache/firestore.rules', import.meta.url), rules);
console.log(JSON.stringify({generatedFrom: 'GD91-65', extension: 'roster.rules', registrationWrites: 5}));
