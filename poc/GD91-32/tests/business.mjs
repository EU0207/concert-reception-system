import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { commit, update, get, data, ok, fixture, initialize, resetCounts } from './support.mjs';

const scope = f => ({ schemaVersion: 6, environmentId: 'FAKE-environment', performanceId: f.show });
export function bootstrapPlan(f) {
  const id = randomUUID();
  return {
    id,
    people: { ...scope(f), revision: 1, operationId: id, attendeeId: '', eligibleAttendeeIds: [] },
    ticket: { ...scope(f), revision: 1, operationId: id, protectedAttendeeIds: [] },
    versions: { ...scope(f),sectionId:'',generation:'',operationId:id,values:{commit:1,layout:0,source:0,assignment:0,attendee:1,ticket:1,control:f.controlRevision} },
    event: { ...scope(f), operationId: id, kind: 'bootstrapBusiness', deviceUid: f.owner.uid, generation:'',expectedVersions:null,
      resultVersions:{commit:1,layout:0,source:0,assignment:0,attendee:1,ticket:1,control:f.controlRevision} }
  };
}
export function bootstrapWrites(f, o) {
  return [update(f, 'attendeeState/current', o.people, undefined, false),
    update(f, 'ticketState/current', o.ticket, undefined, false),
    update(f, 'operations/' + o.id, o.event, undefined, false), update(f,'versions/current',o.versions,undefined,false)];
}
export async function bootstrap(f, o = bootstrapPlan(f)) {
  ok(await commit(f, bootstrapWrites(f, o)));
  f.people = o.people; f.ticket = o.ticket; f.sharedVersions = o.versions; f.profiles = new Map();
}
export async function ready(options) {
  const f = await fixture(options);
  resetCounts(f); await bootstrap(f); f.bootstrapCosts = structuredClone(f.counts);
  resetCounts(f); await initialize(f); f.initialCosts = structuredClone(f.counts);
  resetCounts(f); return f;
}
function versionsFor(f, id, domain) {
  return { ...structuredClone(f.sharedVersions), operationId: id,
    values: { ...f.sharedVersions.values, commit: f.sharedVersions.values.commit + 1,
      [domain]: f.sharedVersions.values[domain] + 1 } };
}
function eventFor(f, id, kind, versions, payload, deviceUid = f.owner.uid) {
  return { ...scope(f), operationId: id, kind, deviceUid, generation: f.sharedVersions.generation,
    expectedVersions: structuredClone(f.sharedVersions.values),
    resultVersions: structuredClone(versions.values), payload };
}
export function customerPlan(f, changes = {}, existingId) {
  const id = randomUUID(), attendeeId = existingId ?? randomUUID(), before = f.profiles.get(attendeeId) ?? null;
  const profile = before ? { ...structuredClone(before), ...changes, revision: before.revision + 1, operationId: id }
    : { ...scope(f), attendeeId, buyerId: randomUUID(), attendancePlan: 'planned', seatDisplayName: '架空A', paid: false,
      ...changes, revision: 1, operationId: id };
  const eligible = new Set(f.people.eligibleAttendeeIds);
  if (profile.attendancePlan === 'planned') eligible.add(attendeeId); else eligible.delete(attendeeId);
  const people = { ...structuredClone(f.people), revision: f.people.revision + 1, operationId: id,
    attendeeId, eligibleAttendeeIds: [...eligible] };
  const versions = versionsFor(f, id, 'attendee');
  const checkOnly = before && Object.keys(changes).length === 1 && Object.hasOwn(changes, 'paid');
  return { id, attendeeId, profile, people, versions,
    event: eventFor(f, id, before ? 'attendeeUpdate' : 'attendeeCreate', versions,
      { attendeeId, before: structuredClone(before), after: structuredClone(profile) }, checkOnly ? '' : f.owner.uid), creating: !before };
}
export function customerWrites(f, o) {
  return [update(f, 'attendees/' + o.attendeeId, o.profile, undefined, !o.creating),
    update(f, 'attendeeState/current', o.people, undefined, true),
    update(f, 'versions/current', o.versions, undefined, true),
    update(f, 'operations/' + o.id, o.event, undefined, false)];
}
export function acceptCustomer(f, o) {
  f.profiles.set(o.attendeeId, o.profile); f.people = o.people; f.sharedVersions = o.versions;
}
export async function saveCustomer(f, o = customerPlan(f)) {
  ok(await commit(f, customerWrites(f, o))); acceptCustomer(f, o); return o;
}
export async function assignment(f) { return data(await get(f, 'assignmentState/current')); }
export async function assignmentPlan(f, kind, options = {}) {
  const before = await assignment(f), after = structuredClone(before), id = randomUUID();
  after.revision++; after.operationId = id;after.lastKind=kind;
  let payload;
  if (kind === 'bulkAssign') {
    after.assignments = { ...after.assignments, ...options.mapping };
    payload = { before: structuredClone(before.assignments), after: structuredClone(after.assignments), reason: options.reason ?? '' };
  } else {
    const seat1 = options.seat1, seat2 = options.seat2 ?? '', before1 = before.assignments[seat1], before2 = before.assignments[seat2] ?? '';
    if (kind === 'assign') after.assignments[seat1] = options.attendeeId;
    if (kind === 'unassign') after.assignments[seat1] = '';
    if (kind === 'move') { after.assignments[seat1] = ''; after.assignments[seat2] = before1; }
    if (kind === 'swap') { after.assignments[seat1] = before2; after.assignments[seat2] = before1; }
    payload = { seat1, seat2, before1, before2, after1: after.assignments[seat1], after2: after.assignments[seat2] ?? '', reason: options.reason ?? '' };
  }
  const versions = versionsFor(f, id, 'assignment');
  return { id, before, after, versions, event: eventFor(f, id, kind, versions, payload) };
}
export function assignmentWrites(f, o) {
  return [update(f, 'assignmentState/current', o.after, undefined, true),
    update(f, 'versions/current', o.versions, undefined, true),
    update(f, 'operations/' + o.id, o.event, undefined, false)];
}
export async function saveAssignment(f, o) {
  ok(await commit(f, assignmentWrites(f, o))); f.sharedVersions = o.versions; return o;
}
export async function snapshot(f) {
  const records = ['head/current', 'versions/current', 'assignmentState/current', 'attendeeState/current', 'ticketState/current', 'idRegistry/current', 'selection/current', 'control/current',
    ...[...(f.profiles?.keys() ?? [])].map(id => 'attendees/' + id)];
  return Object.fromEntries(await Promise.all(records.map(async p => [p, await get(f, p)])));
}
export async function reject(f, writes, token = f.owner.token, check = r => assert.equal(r.status, 403, JSON.stringify(r.body))) {
  const before = await snapshot(f); check(await commit(f, writes, token)); assert.deepEqual(await snapshot(f), before);
}

export async function controlPlan(f) {
  const before=data(await get(f,'control/current')),after={...before,revision:before.revision+1},id=randomUUID();
  const versions=versionsFor(f,id,'control');return{id,before,after,versions,event:eventFor(f,id,'controlFence',versions,{before,after})};
}
export function controlWrites(f,o) {return [update(f,'control/current',o.after,undefined,true),update(f,'versions/current',o.versions,undefined,true),update(f,'operations/'+o.id,o.event,undefined,false)];}
export async function saveControl(f,o){o??=await controlPlan(f);ok(await commit(f,controlWrites(f,o)));f.sharedVersions=o.versions;f.controlRevision=o.after.revision;return o;}
