import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fixture, initialize, commit, update, get, data, ok, denied, seed, movement, slideWrites, publishSlide,
  start, fill, finishWrites, completion, finish, stageWrites, resetCounts, projectView, slide, context } from './support.mjs';
import { bootstrapPlan, bootstrapWrites, bootstrap, ready, customerPlan, customerWrites, acceptCustomer, saveCustomer,
  assignment, assignmentPlan, assignmentWrites, saveAssignment, snapshot, reject } from './business.mjs';
import { planSlide, PlanError } from '../plan.mjs';

const sources = ['../firestore.rules', '../firebase.json', '../plan.mjs', 'emulator.mjs', 'support.mjs', 'business.mjs',
  '../../GD91-16/codec.mjs', '../../GD91-07/planner.mjs', '../../GD91-08/slide.mjs', '../../GD91-10/projection.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async p => [p,
  createHash('sha256').update((await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex')])));
const sourceHashes = await hashes(), reports = [];
async function record(id, label, action) {
  const result = await action(); reports.push({ id, label, status: 'passed', ...result }); console.log(`${id}: CHECKED ${label}`);
}
const subset = (writes, mask) => writes.filter((_, i) => mask & (1 << i));
const conflict = r => assert([403, 409].includes(r.status), JSON.stringify(r.body));
const head = async f => data(await get(f, 'head/current'));
async function createPeople(f, n) {
  const people = []; for (let i = 0; i < n; i++) people.push(await saveCustomer(f)); return people;
}

await record('C01', 'empty business indexes bootstrap through authenticated client requests', async () => {
  const f = await fixture(), o = bootstrapPlan(f), w = bootstrapWrites(f, o);
  assert.equal((await get(f, 'attendeeState/current')).status, 404);
  for (let mask = 1; mask < 7; mask++) {
    denied(await commit(f, subset(w, mask)));
    for (const p of ['attendeeState/current', 'ticketState/current', 'operations/' + o.id]) assert.equal((await get(f, p)).status, 404);
  }
  resetCounts(f); await bootstrap(f, o);
  assert.deepEqual([f.counts.requests, f.counts.writes], [1, 3]);
  assert.deepEqual(data(await get(f, 'attendeeState/current')), o.people);
  denied(await commit(f, [update(f, 'ticketState/current', { ...o.ticket, protectedAttendeeIds: [randomUUID()] }, undefined, true)]));
  return { partialSubsetsDenied: 6, bootstrap: f.counts, businessIndexesNotSeeded: true };
});

await record('C02', 'bootstrap refuses nonempty indexes and revoked or unbound actors', async () => {
  const f = await fixture(); let count = 0;
  for (const mutate of [o => o.people.eligibleAttendeeIds.push(randomUUID()), o => o.people.attendeeId = randomUUID(),
    o => o.ticket.protectedAttendeeIds.push(randomUUID()), o => o.people.schemaVersion = 1,
    o => o.ticket.operationId = randomUUID(), o => o.event.deviceUid = f.other.uid]) {
    const o = bootstrapPlan(f); mutate(o); denied(await commit(f, bootstrapWrites(f, o))); count++;
  }
  for (const token of [f.reader.token, f.human.token, null]) denied(await commit(f, bootstrapWrites(f, bootstrapPlan(f)), token));
  await bootstrap(f); return { bootstrapForgeriesDenied: count, wrongActorsDenied: 3 };
});

await record('C03', 'five-document initial publication remains atomic with business format two', async () => {
  const f = await fixture(); await bootstrap(f); await start(f); await fill(f);
  const o = completion(f), w = finishWrites(f, o);
  for (let mask = 1; mask < 31; mask++) {
    await reject(f, subset(w, mask));
    assert.equal((await get(f, 'operations/' + o.id)).status, 404);
    assert.equal((await get(f, 'assignmentState/current')).status, 404);
  }
  resetCounts(f); await finish(f, o);
  assert.deepEqual([f.counts.requests, f.counts.writes], [1, 5]);
  assert.equal(data(await get(f, 'versions/current')).schemaVersion, 2);
  conflict(await commit(f, bootstrapWrites(f, bootstrapPlan(f))));
  return { partialSubsetsDenied: 30, publication: f.counts, postPublicationResetDenied: true };
});

await record('C04', 'all partial customer registrations preserve old state and absent profiles', async () => {
  const f = await ready(), o = customerPlan(f), w = customerWrites(f, o);
  for (let mask = 1; mask < 15; mask++) {
    await reject(f, subset(w, mask)); assert.equal((await get(f, 'attendees/' + o.attendeeId)).status, 404);
    assert.equal((await get(f, 'operations/' + o.id)).status, 404);
  }
  resetCounts(f); await saveCustomer(f, o);
  assert.deepEqual([f.counts.requests, f.counts.writes], [1, 4]);
  assert.equal(o.profile.paid, false); assert(f.people.eligibleAttendeeIds.includes(o.attendeeId)); assert.equal((await head(f)).revision, 1);
  return { partialSubsetsDenied: 14, unpaidPersonEligible: true, creation: f.counts };
});

await record('C05', 'customer indexes cannot be forged independently of their business records', async () => {
  const f = await ready(); const valid = await saveCustomer(f);
  const changes = [o => o.people.eligibleAttendeeIds.push(randomUUID()), o => o.people.eligibleAttendeeIds = [],
    o => o.people.eligibleAttendeeIds.push(o.attendeeId), o => o.people.eligibleAttendeeIds = [o.attendeeId],
    o => o.people.attendeeId = valid.attendeeId, o => o.people.revision++, o => o.people.schemaVersion = 1,
    o => o.profile.attendeeId = randomUUID(), o => o.profile.buyerId = '', o => o.profile.schemaVersion = 1,
    o => o.profile.performanceId = 'FAKE-other', o => o.profile.environmentId = 'FAKE-other', o => o.profile.paid = 'yes',
    o => o.profile.attendancePlan = 'unknown', o => o.profile.seatDisplayName = '1234567', o => o.profile.extra = true,
    o => o.profile.revision++, o => o.profile.operationId = randomUUID(), o => o.event.payload.before = valid.profile,
    o => o.event.payload.after.seatDisplayName = '異なる', o => o.event.deviceUid = '', o => o.event.payload.extra = true,
    o => o.versions.schemaVersion = 1, o => o.versions.values.commit++, o => o.versions.values.assignment++,
    o => delete o.versions.values.control, o => o.versions.performanceId = 'FAKE-other', o => o.versions.values.attendee = 9007199254740992];
  for (const mutate of changes) {
    const o = customerPlan(f); mutate(o); await reject(f, customerWrites(f, o));
    assert.equal((await get(f, 'attendees/' + o.attendeeId)).status, 404);
  }
  await saveCustomer(f); return { customerForgeriesDenied: changes.length, unrelatedExistingPersonPreserved: true };
});

await record('C06', 'normal profile changes maintain eligibility and fixed-check audit exceptions', async () => {
  const f = await ready(), c = await saveCustomer(f);
  const beforeHead = await head(f), beforeTicket = data(await get(f, 'ticketState/current'));
  await reject(f, customerWrites(f, customerPlan(f, { paid: false }, c.attendeeId)));
  for (const paid of [true, false]) {
    const o = customerPlan(f, { paid }, c.attendeeId); await saveCustomer(f, o);
    assert.equal(data(await get(f, 'operations/' + o.id)).deviceUid, '');
  }
  await saveCustomer(f, customerPlan(f, { seatDisplayName: '架空B' }, c.attendeeId));
  const nonattending = customerPlan(f, { attendancePlan: 'notAttending' }, c.attendeeId); await saveCustomer(f, nonattending);
  assert.equal(f.people.eligibleAttendeeIds.length, 0);
  await saveCustomer(f, customerPlan(f, { attendancePlan: 'planned' }, c.attendeeId));
  assert(f.people.eligibleAttendeeIds.includes(c.attendeeId));
  assert.deepEqual(await head(f), beforeHead); assert.deepEqual(data(await get(f, 'ticketState/current')), beforeTicket);
  const o = customerPlan(f, { paid: true }, c.attendeeId); o.event.deviceUid = f.owner.uid; await reject(f, customerWrites(f, o));
  return { headUnchanged: true, ticketUnchanged: true, fixedCheckOperatorOmitted: true, unassignedUnissuedReturnOnly: true };
});

await record('C07', 'normal assign move swap and unissued release preserve unchanged domains', async () => {
  const f = await ready(), [a, b] = await createPeople(f, 2), seats = f.model.seats.map(s => s.seatId);
  const first = await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId }), w = assignmentWrites(f, first);
  for (let mask = 1; mask < 7; mask++) await reject(f, subset(w, mask));
  const beforeHead = await head(f), beforePeople = data(await get(f, 'attendeeState/current')), beforeTicket = data(await get(f, 'ticketState/current'));
  resetCounts(f); await saveAssignment(f, first);
  assert.deepEqual([f.counts.requests, f.counts.writes], [1, 3]);
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: seats[1], attendeeId: b.attendeeId }));
  await saveAssignment(f, await assignmentPlan(f, 'move', { seat1: seats[0], seat2: seats[2] }));
  await saveAssignment(f, await assignmentPlan(f, 'swap', { seat1: seats[1], seat2: seats[2] }));
  assert.equal((await assignment(f)).assignments[seats[1]], a.attendeeId);
  await saveAssignment(f, await assignmentPlan(f, 'unassign', { seat1: seats[1] }));
  assert.equal((await assignment(f)).assignments[seats[1]], '');
  assert.deepEqual(await head(f), beforeHead); assert.deepEqual(data(await get(f, 'attendeeState/current')), beforePeople);
  assert.deepEqual(data(await get(f, 'ticketState/current')), beforeTicket);
  return { partialSubsetsDenied: 6, operations: 5, writesPerOperation: 3, layoutAndBusinessUnchanged: true };
});

await record('C08', 'assignment forgeries and unrelated piggyback changes are rejected', async () => {
  const f = await ready(), [a, b] = await createPeople(f, 2), absent = await saveCustomer(f, customerPlan(f, { attendancePlan: 'notAttending' }));
  const seats = f.model.seats.map(s => s.seatId);
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId }));
  const changes = [o => o.after.assignments[seats[1]] = a.attendeeId, o => o.after.assignments[seats[1]] = randomUUID(),
    o => o.after.assignments[seats[1]] = absent.attendeeId, o => delete o.after.assignments[seats[0]],
    o => o.after.assignments[f.model.section.cells[0].cellId] = b.attendeeId, o => o.after.assignments[randomUUID()] = '',
    o => o.after.assignments[seats[0]] = '', o => o.after.schemaVersion = 1, o => o.after.generation = randomUUID(),
    o => o.after.revision++, o => o.after.extra = true, o => o.after.operationId = randomUUID(),
    o => o.event.payload.after1 = a.attendeeId, o => o.event.payload.before1 = a.attendeeId,
    o => o.event.payload.seat1 = seats[2], o => o.event.deviceUid = f.other.uid, o => o.event.expectedVersions.attendee++,
    o => o.event.resultVersions.layout++, o => o.event.payload.extra = true,
    o => o.versions.values.assignment++, o => o.versions.values.commit = 9007199254740992,
    ...['layout', 'source', 'attendee', 'ticket', 'control'].map(k => o => o.versions.values[k]++), o => o.versions.values.extra = 1];
  for (const mutate of changes) {
    const o = await assignmentPlan(f, 'assign', { seat1: seats[1], attendeeId: b.attendeeId }); mutate(o); await reject(f, assignmentWrites(f, o));
  }
  const o = await assignmentPlan(f, 'assign', { seat1: seats[1], attendeeId: b.attendeeId });
  for (const extra of [update(f, 'attendeeState/current', { revision: f.people.revision + 1 }, ['revision'], true),
    update(f, 'ticketState/current', { revision: 2 }, ['revision'], true), update(f, 'head/current', { revision: 2 }, ['revision'], true)]) {
    await reject(f, [...assignmentWrites(f, o), extra]);
  }
  await saveAssignment(f, o);
  const blocked = customerPlan(f, { attendancePlan: 'notAttending' }, a.attendeeId); await reject(f, customerWrites(f, blocked));
  assert.equal(data(await get(f, 'attendees/' + a.attendeeId)).attendancePlan, 'planned');
  return { assignmentForgeriesDenied: changes.length, piggybackVariantsDenied: 3, assignedPersonCannotUseUnissuedOnlyCancellation: true };
});

await record('C09', 'stale confirmations refuse customer and assignment overwrites', async () => {
  const f = await ready(), [a, b] = await createPeople(f, 2), seats = f.model.seats.map(s => s.seatId);
  const oldAssignment = await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId });
  const oldCustomer = customerPlan(f, { paid: true }, a.attendeeId);
  await saveCustomer(f, customerPlan(f, { seatDisplayName: '架空C' }, b.attendeeId));
  await reject(f, assignmentWrites(f, oldAssignment)); await reject(f, customerWrites(f, oldCustomer));
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId }));
  await saveCustomer(f, customerPlan(f, { paid: true }, a.attendeeId));
  const oldSlide = movement(f); await saveCustomer(f, customerPlan(f, { paid: true }, b.attendeeId)); await reject(f, slideWrites(f, oldSlide));
  return { staleOperationsDenied: 3, currentReconfirmationAccepted: true };
});

await record('C10', 'customer and seat races each have exactly one winner', async () => {
  const f = await ready(), a = customerPlan(f), b = customerPlan(f);
  b.event.deviceUid = f.other.uid;
  const results = await Promise.all([commit(f, customerWrites(f, a)), commit(f, customerWrites(f, b), f.other.token)]);
  assert.equal(results.filter(r => r.status === 200).length, 1); results.filter(r => r.status !== 200).forEach(conflict);
  const winner = results[0].status === 200 ? a : b, loser = winner === a ? b : a; acceptCustomer(f, winner);
  assert.equal((await get(f, 'attendees/' + loser.attendeeId)).status, 404);
  const c = await saveCustomer(f), seat = f.model.seats[0].seatId;
  const x = await assignmentPlan(f, 'assign', { seat1: seat, attendeeId: winner.attendeeId });
  const y = await assignmentPlan(f, 'assign', { seat1: seat, attendeeId: c.attendeeId }); y.event.deviceUid = f.other.uid;
  const assignments = await Promise.all([commit(f, assignmentWrites(f, x)), commit(f, assignmentWrites(f, y), f.other.token)]);
  assert.equal(assignments.filter(r => r.status === 200).length, 1); assignments.filter(r => r.status !== 200).forEach(conflict);
  assert([winner.attendeeId, c.attendeeId].includes((await assignment(f)).assignments[seat]));
  return { normalCustomerRaceWinners: 1, sameSeatRaceWinners: 1, sameHumanTwoApprovedDevices: true };
});

await record('C11', 'business changes and slides compete at the same commit boundary', async () => {
  let lockAbortRecoveries = 0, initialWinnerPairs = 0;
  for (let iteration = 0; iteration < 10; iteration++) for (const withAssignment of [false, true]) {
    const f = await ready(), c = await saveCustomer(f), s = movement(f);
    const o = withAssignment ? await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId })
      : customerPlan(f, { seatDisplayName: '架空D' }, c.attendeeId);
    const writes = [slideWrites(f, s), withAssignment ? assignmentWrites(f, o) : customerWrites(f, o)], before = await snapshot(f);
    const results = await Promise.all(writes.map(w => commit(f, w)));
    const winners = results.filter(r => r.status === 200).length;
    assert(winners <= 1, JSON.stringify(results)); results.filter(r => r.status !== 200).forEach(conflict);
    let winner = results[0].status === 200 ? 0 : 1;
    if (winners === 0) {
      const aborted = results.findIndex(r => r.status === 409 && r.body.error.status === 'ABORTED');
      assert(aborted >= 0, JSON.stringify(results));
      assert(results.every(r => r.body.error.status === 'ABORTED' || r.status === 403 && r.body.error.message.includes('Service call error.')), JSON.stringify(results));
      assert.deepEqual(await snapshot(f), before);
      for (const id of [s.id, o.id]) assert.equal((await get(f, 'operations/' + id)).status, 404);
      // 結果と版を照合した後の明示再試行。403応答の要求を自動再送しない。
      ok(await commit(f, writes[aborted])); winner = aborted; lockAbortRecoveries++;
    } else initialWinnerPairs++;
    const v = data(await get(f, 'versions/current'));
    assert.equal(v.values.commit, f.sharedVersions.values.commit + 1);
    assert.equal(v.values.layout, (await head(f)).revision);
    assert.equal((await get(f, 'operations/' + (winner === 0 ? o.id : s.id))).status, 404);
    assert.equal((await get(f, 'operations/' + (winner === 0 ? s.id : o.id))).status, 200);
  }
  return { competingDomainPairs: 20, initialWinnerPairs, lockAbortRecoveries, finalWinnersPerPair: 1,
    noDoubleCommit: true, sameIdAfterResultAndVersionCheck: true, permissionDeniedNotBlindlyRetried: true };
});

await record('C12', 'latest device session and role authorization fences all normal writes', async () => {
  const f = await ready(), c = await saveCustomer(f);
  const original = Object.fromEntries(await Promise.all(['devices/' + f.owner.uid, 'sessions/' + f.owner.uid, 'roles/FAKE-manager'].map(async p => [p, data(await get(f, p))])));
  const variants = [['devices/' + f.owner.uid, { active: false }], ['devices/' + f.owner.uid, { preparedRoleRevision: 2 }],
    ['devices/' + f.owner.uid, { humanUid: f.readerHuman.uid }], ['devices/' + f.owner.uid, { performanceId: 'FAKE-other' }],
    ['sessions/' + f.owner.uid, { active: false }], ['sessions/' + f.owner.uid, { roleRevision: 2 }],
    ['sessions/' + f.owner.uid, { expiresAt: { $timestamp: '2000-01-01T00:00:00Z' } }], ['sessions/' + f.owner.uid, { authProvider: 'password' }],
    ['roles/FAKE-manager', { active: false }], ['roles/FAKE-manager', { revision: 2 }], ['roles/FAKE-manager', { role: 'temporary' }],
    ['roles/FAKE-manager', { endsAt: { $timestamp: '2000-01-01T00:00:00Z' } }]];
  let deniedRequests = 0;
  for (const [p, changed] of variants) {
    await seed(f, p, { ...original[p], ...changed });
    const o = customerPlan(f), a = await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId });
    for (const w of [customerWrites(f, o), assignmentWrites(f, a), slideWrites(f, movement(f))]) { await reject(f, w); deniedRequests++; }
    await seed(f, p, original[p]);
  }
  for (const token of [f.reader.token, f.human.token, null]) {
    await reject(f, customerWrites(f, customerPlan(f)), token); deniedRequests++;
  }
  return { authorityVariants: variants.length, deniedRequests, sessionsIssuedNormally: true, registrationAndRoleGrantsSeeded: true };
});

await record('C13', 'unknown responses are resolved by operation ID without double application', async () => {
  const f = await ready(), c = customerPlan(f); ok(await commit(f, customerWrites(f, c))); acceptCustomer(f, c);
  const actual = data(await get(f, 'operations/' + c.id)); assert.deepEqual(actual, c.event);
  for (const [path, expected] of [['attendees/' + c.attendeeId, c.profile], ['attendeeState/current', c.people], ['versions/current', c.versions]]) {
    assert.deepEqual(data(await get(f, path)), expected);
  }
  await reject(f, customerWrites(f, c), f.owner.token, conflict);
  const s = await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId });
  ok(await commit(f, assignmentWrites(f, s))); f.sharedVersions = s.versions;
  assert.deepEqual(data(await get(f, 'operations/' + s.id)), s.event);
  assert.deepEqual(await assignment(f), s.after); assert.deepEqual(data(await get(f, 'versions/current')), s.versions);
  await reject(f, assignmentWrites(f, s), f.owner.token, conflict);
  const changed = structuredClone(s); changed.event.payload.after1 = randomUUID(); await reject(f, assignmentWrites(f, changed), f.owner.token, conflict);
  return { customerDocumentsChecked: 4, assignmentDocumentsChecked: 3, replayAndChangedContentDenied: 3, sdkRecoveryNotTested: true };
});

async function checkPlan(f) {
  const state = await assignment(f), source = structuredClone(f.model);
  source.assignments = Object.entries(state.assignments).filter(([, id]) => id).map(([seatId, attendeeId]) => ({ seatId, attendeeId }));
  const snap = { schemaVersion: 2, environmentId: 'FAKE-environment', performanceId: f.show, generation: f.generation,
    versions: structuredClone(f.sharedVersions.values), head: structuredClone(f.head), source };
  const command = { operationId: randomUUID(), kind: 'slide', environmentId: snap.environmentId, performanceId: f.show,
    expectedGeneration: f.generation, expectedVersions: structuredClone(snap.versions), direction: f.direction, amount: 1 };
  const proposed = slide(projectView(source, f.head, context), { direction: f.direction, amount: 1 }, context).after;
  const original = structuredClone({ snap, command, proposed });
  const plan = planSlide(snap, command, proposed, context); assert.equal(plan.route, 'offsetUpdate');
  assert.deepEqual({ snap, command, proposed }, original);
  const bad = structuredClone(snap); bad.head.revision = bad.versions.commit;
  assert.throws(() => planSlide(bad, command, proposed, context), e => e instanceof PlanError && e.code === 'INCONSISTENT_SNAPSHOT');
  assert.throws(() => planSlide({ ...snap, schemaVersion: 1 }, command, proposed, context), e => e.code === 'UNSUPPORTED_SNAPSHOT');
  return { plan, source, proposed };
}

await record('C14', 'slide calculation uses layout revision after normal business changes', async () => {
  const f = await ready(), c = await saveCustomer(f);
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId }));
  assert.equal(f.sharedVersions.values.commit, 3); assert.equal(f.head.revision, 1);
  await checkPlan(f); const before = await assignment(f); await publishSlide(f); assert.deepEqual(await assignment(f), before);
  assert.equal(f.sharedVersions.values.commit, 4); assert.equal(f.head.revision, 2);
  return { commitBefore: 3, layoutBefore: 1, commitAfter: 4, layoutAfter: 2, inputUnchanged: true, legacyFormatRejected: true };
});

await record('C15', 'axis order and all slide directions retain normal assignments', async () => {
  let profiles = 0;
  for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) for (const direction of ['up', 'down', 'left', 'right']) {
    const f = await ready({ axis, order, direction }), c = await saveCustomer(f);
    await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId }));
    const before = await assignment(f), sourceBefore = structuredClone(f.model); await checkPlan(f); await publishSlide(f);
    assert.deepEqual(await assignment(f), before); assert.deepEqual(f.model, sourceBefore); profiles++;
  }
  return { axisOrderDirectionProfiles: profiles, identitiesNumbersAndAssignmentsPreserved: true };
});

await record('C16', 'five hundred normally registered people connect to nine hundred real seats', async () => {
  const f = await ready({ large: true });
  resetCounts(f); const people = await createPeople(f, 500), registration = structuredClone(f.counts);
  assert.deepEqual([registration.requests, registration.writes], [500, 2000]);
  assert.equal(f.people.eligibleAttendeeIds.length, 500);
  for (const p of people) assert.deepEqual(data(await get(f, 'attendees/' + p.attendeeId)), p.profile);
  const seats = f.model.seats.map(s => s.seatId), mapping = Object.fromEntries(people.map((p, i) => [seats[i], p.attendeeId]));
  resetCounts(f); await saveAssignment(f, await assignmentPlan(f, 'bulkAssign', { mapping })); const bulk = structuredClone(f.counts);
  assert.deepEqual([bulk.requests, bulk.writes], [1, 3]);
  assert.equal(Object.values((await assignment(f)).assignments).filter(Boolean).length, 500);
  await saveAssignment(f, await assignmentPlan(f, 'move', { seat1: seats[0], seat2: seats[500] }));
  await saveAssignment(f, await assignmentPlan(f, 'swap', { seat1: seats[1], seat2: seats[500] }));
  const beforeHead = await head(f); await saveCustomer(f, customerPlan(f, { paid: true }, people[0].attendeeId)); assert.deepEqual(await head(f), beforeHead);
  await checkPlan(f); const before = await assignment(f), ticket = data(await get(f, 'ticketState/current'));
  resetCounts(f); await publishSlide(f); const slideCost = structuredClone(f.counts);
  assert.deepEqual([slideCost.requests, slideCost.writes], [1, 3]); assert.deepEqual(await assignment(f), before);
  assert.deepEqual(data(await get(f, 'ticketState/current')), ticket);
  return { cells: f.model.section.cells.length, seats: seats.length, normallyRegisteredPeople: 500, assignedPeople: 500,
    bootstrap: f.bootstrapCosts, initialization: f.initialCosts, registration, bulkAssignment: bulk, slide: slideCost,
    customerIndexJsonBytes: Buffer.byteLength(JSON.stringify(f.people)), assignmentJsonBytes: Buffer.byteLength(JSON.stringify(before)),
    sourceBusinessSnapshotsSeeded: false, ticketIssuanceNotTested: true, sessionCosts: f.sessionCosts };
});

await record('C17', 'seeded protection comparison does not equate check clearing with QR issuance tests', async () => {
  const f = await ready(), [a, b] = await createPeople(f, 2), seats = f.model.seats.map(s => s.seatId);
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: seats[0], attendeeId: a.attendeeId }));
  await saveAssignment(f, await assignmentPlan(f, 'assign', { seat1: seats[1], attendeeId: b.attendeeId }));
  await seed(f, 'ticketState/current', { ...f.ticket, protectedAttendeeIds: [a.attendeeId] });
  await reject(f, assignmentWrites(f, await assignmentPlan(f, 'unassign', { seat1: seats[0] })));
  await reject(f, assignmentWrites(f, await assignmentPlan(f, 'move', { seat1: seats[0], seat2: seats[2] })));
  await saveAssignment(f, await assignmentPlan(f, 'move', { seat1: seats[0], seat2: seats[2], reason: '架空の席変更' }));
  await seed(f, 'control/current', { revision: 1, firstReceptionStartedAt: { $timestamp: '2020-01-01T00:00:00Z' }, environmentId: 'FAKE-environment' });
  await reject(f, assignmentWrites(f, await assignmentPlan(f, 'swap', { seat1: seats[1], seat2: seats[2] })));
  await saveAssignment(f, await assignmentPlan(f, 'swap', { seat1: seats[1], seat2: seats[2], reason: '架空の交換理由' }));
  return { comparisonOnly: true, protectedIndexAndFirstStartSeeded: true, restrictionsChecked: 3, normalTicketWriterAndQrNotTested: true };
});

await record('C18', 'legacy version format and foreign business sources cannot be used', async () => {
  const f = await ready(), c = await saveCustomer(f), before = structuredClone(f.sharedVersions);
  await seed(f, 'versions/current', { ...before, schemaVersion: 1 });
  await reject(f, customerWrites(f, customerPlan(f))); await reject(f, slideWrites(f, movement(f)));
  await seed(f, 'versions/current', before);
  for (const [path, value] of [['attendeeState/current', { ...f.people, performanceId: 'FAKE-other' }],
    ['ticketState/current', { ...f.ticket, environmentId: 'FAKE-other' }]]) {
    await seed(f, path, value);
    await reject(f, assignmentWrites(f, await assignmentPlan(f, 'assign', { seat1: f.model.seats[0].seatId, attendeeId: c.attendeeId })));
    await seed(f, path, path.startsWith('attendee') ? f.people : f.ticket);
  }
  return { legacyFormatRequestsDenied: 2, foreignBusinessSourcesDenied: 2 };
});

await record('C19', 'four-seat source fragment remains an evaluation-limit comparison', async () => {
  const f = await fixture({ columns: 11, chunkSize: 4, rich: true }); await bootstrap(f); await start(f);
  const result = await commit(f, stageWrites(f, f.chunks[0])); denied(result); assert.match(result.body.error.message, /maximum of 1000 expressions/);
  return { comparisonOnly: true, expressionLimit: true, productLimitUnchanged: true };
});

const endSourceHashes = await hashes(); assert.deepEqual(endSourceHashes, sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({
  project: 'demo-concert-seat-gd91-26', runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF',
  sourceHashes, endSourceHashes,
  scope: 'Normal empty business-index initialization, minimal attendee record/index writes and 500 actual assignments, moves/swaps and offset slide in one-section format two. Human sessions issued normally; device registration and role grants seeded. C17 seeds protected IDs and first-start only as a comparison: no normal ticket/QR issuance, invalidation or nonattendance integration. Full group/fixed rules, complete auth lifecycle, multiple sections, all edits/cleanup, SDK/IndexedDB/UI/device tests are not covered.',
  reports
}, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);
