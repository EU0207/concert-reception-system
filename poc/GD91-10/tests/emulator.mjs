import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend } from '../../GD91-07/planner.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { project as projectView, initialHead } from '../projection.mjs';

const project = 'demo-concert-seat-gd91-10';
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9191');
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const sources = ['../firestore.rules', '../firebase.json', '../projection.mjs', 'emulator.mjs', '../../GD91-07/planner.mjs', '../../GD91-08/slide.mjs'];
const hash = async p => createHash('sha256').update((await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)])));
const reports = [], context = { maxCells: 10000 }, deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const encode = v => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v }
    : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : Object.hasOwn(v, '$timestamp') ? { timestampValue: v.$timestamp }
      : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
const decode = v => Object.hasOwn(v, 'nullValue') ? null : Object.hasOwn(v, 'booleanValue') ? v.booleanValue
  : Object.hasOwn(v, 'integerValue') ? Number(v.integerValue) : Object.hasOwn(v, 'stringValue') ? v.stringValue
    : Object.hasOwn(v, 'timestampValue') ? { $timestamp: v.timestampValue } : Object.hasOwn(v, 'arrayValue') ? (v.arrayValue.values ?? []).map(decode)
      : Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
const fields = v => encode(v).mapValue.fields;
async function request(url, token, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
}
async function actor() {
  const r = await request(`${auth}/accounts:signUp?key=demo-api-key`, null, 'POST', { returnSecureToken: true }); assert.equal(r.status, 200);
  assert.equal(JSON.parse(Buffer.from(r.body.idToken.split('.')[1], 'base64url')).aud, project);
  return { uid: r.body.localId, token: r.body.idToken };
}
const relative = (f, suffix) => `offsetShows/${f.show}/${suffix}`;
const name = (f, suffix) => `projects/${project}/databases/(default)/documents/${relative(f, suffix)}`;
const update = (f, suffix, value, mask, exists) => ({ update: { name: name(f, suffix), fields: fields(value) }, ...(mask ? { updateMask: { fieldPaths: mask } } : {}), ...(exists === undefined ? {} : { currentDocument: { exists } }) });
const get = (f, suffix, token = 'owner') => request(`${base}/${relative(f, suffix)}`, token);
const data = r => decode({ mapValue: { fields: r.body.fields } });
async function commit(f, writes, token = f.owner.token) {
  const r = await request(`${base}:commit`, token, 'POST', { writes });
  if (token !== 'owner') { f.counts.requests++; f.counts.writes += writes.length; f.counts.maxRequestBytes = Math.max(f.counts.maxRequestBytes, Buffer.byteLength(JSON.stringify({ writes }))); }
  return r;
}
const ok = r => assert.equal(r.status, 200, JSON.stringify(r.body));
const denied = r => assert.equal(r.status, 403, JSON.stringify(r.body));
async function seed(f, suffix, value) { ok(await commit(f, [update(f, suffix, value)], 'owner')); }
async function fixture({ axis = 'horizontal', order = 'forward', direction = 'right', large = false, block = null, role = 'owner', empty = false, numbered = true } = {}) {
  const f = { show: `FAKE-${randomUUID()}`, owner: await actor(), other: await actor(), reader: await actor(), counts: { requests: 0, writes: 0, maxRequestBytes: 0 } };
  let m = createSection({ name: '架空区画', rows: large ? 30 : 4, columns: large ? 30 : 4, axis, seatOrder: order, stagePosition: axis === 'vertical' ? 'top' : 'left',
    lines: Array.from({ length: large ? 30 : 4 }, (_, i) => ({ name: `L${i}` })) }, context);
  const selections = Object.fromEntries(m.section.cells.map(c => [`${c.row},${c.column}`, empty ? 'unset' : 'seat']));
  if (!large && !empty) {
    m.section.cells.filter(c => direction === 'up' ? c.row === 0 : direction === 'down' ? c.row === 3 : direction === 'left' ? c.column === 0 : c.column === 3).forEach(c => { selections[`${c.row},${c.column}`] = 'unset'; });
    Object.assign(selections, { '1,1': 'gap', '1,2': 'space', '2,1': 'aisle' });
    if (block) { const c = m.section.cells.find(c => selections[`${c.row},${c.column}`] === 'unset'); selections[`${c.row},${c.column}`] = block; }
  }
  m = numberInitial(m, selections, context);
  if (!large && m.seats.length) {
    const cell = m.section.cells.find(c => c.row === 2 && c.column === 2), manual = m.seats.find(s => s.seatId === cell.seatId);
    manual.numberingMode = 'manual'; manual.manualNumber = '枝番-仮設'; delete manual.prefix; delete manual.number;
  }
  if (large) m = extend(m, { dimension: 'columns', count: 1 }, context).after;
  m.assignments = m.seats.slice(0, large ? 500 : 3).map((s, i) => ({ seatId: s.seatId, attendeeId: `FAKE-person-${i}`, fixed: true }));
  m.ticketRefs = m.assignments.map(a => ({ attendeeId: a.attendeeId, ticketId: `FAKE-ticket-${a.attendeeId}`, credentialId: `FAKE-qr-${a.attendeeId}` }));
  m.receptionRefs = m.assignments.map(a => ({ attendeeId: a.attendeeId, receptionId: `FAKE-reception-${a.attendeeId}` }));
  if (m.seats.length) Object.assign(m.seats[0], { category: 'reserved', reservedLabel: '架空用途', emergencyChange: { kind: 'add', reason: '架空：補助席用途' } });
  m.initialNumbered = numbered; f.model = m; f.head = initialHead(m); f.direction = direction;
  f.cellData = c => ({ ...c, seatId: c.seatId ?? '', consumedNumber: c.consumedNumber ?? null });
  const writes = [update(f, 'head/current', f.head), update(f, 'control/current', { revision: 1, firstReceptionStartedAt: null }),
    update(f, 'roles/FAKE-manager', { active: true, role, revision: 1 }), update(f, 'roles/FAKE-reader', { active: true, role: 'receptionist', revision: 1 })];
  for (const [a, humanUid] of [[f.owner, 'FAKE-manager'], [f.other, 'FAKE-manager'], [f.reader, 'FAKE-reader']]) writes.push(
    update(f, `devices/${a.uid}`, { deviceUid: a.uid, humanUid, active: true, preparedRoleRevision: 1 }),
    update(f, `sessions/${a.uid}`, { humanUid, active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } }));
  writes.push(...m.section.cells.map(c => update(f, `cells/${c.cellId}`, f.cellData(c))),
    ...m.section.lineSettings.map(l => update(f, `lines/${l.lineId}`, l)),
    update(f, 'seatReferences/current', { seats: m.seats, assignments: m.assignments, ticketRefs: m.ticketRefs, receptionRefs: m.receptionRefs }));
  for (let i = 0; i < writes.length; i += 200) ok(await commit(f, writes.slice(i, i + 200), 'owner'));
  return f;
}
function movement(f, direction = f.direction, who = f.owner) {
  const [dr, dc] = deltas[direction], h = f.head, id = randomUUID();
  return { id, after: { ...h, revision: h.revision + 1, operationId: id, rowOffset: (h.rowOffset + dr + h.rows) % h.rows, columnOffset: (h.columnOffset + dc + h.columns) % h.columns },
    history: { kind: 'slide', deviceUid: who.uid, baseRevision: h.revision, revision: h.revision + 1, controlRevision: 1, dr, dc } };
}
function slideWrites(f, o, full = false) {
  const keys = ['revision', 'operationId', 'rowOffset', 'columnOffset'];
  return [update(f, 'head/current', full ? o.after : Object.fromEntries(keys.map(k => [k, o.after[k]])), full ? undefined : keys, true), update(f, `events/${o.id}`, o.history, undefined, false)];
}
function nonSeat(f, cell, toKind) {
  const fromKind = cell.kind, delta = Number(toKind !== 'unset') - Number(fromKind !== 'unset'), id = randomUUID(), h = f.head;
  const after = { ...h, operationId: id, revision: h.revision + 1, sourceRevision: h.sourceRevision + 1, nonEmptyCount: h.nonEmptyCount + delta,
    rowCounts: { ...h.rowCounts, [cell.row]: h.rowCounts[cell.row] + delta }, columnCounts: { ...h.columnCounts, [cell.column]: h.columnCounts[cell.column] + delta } };
  const history = { kind: 'nonSeatProof', deviceUid: f.owner.uid, baseRevision: h.revision, revision: h.revision + 1, controlRevision: 1, cellId: cell.cellId, fromKind, toKind, reason: 'FAKE: counter maintenance' };
  return { id, after, history, cell, toKind };
}
function nonSeatWrites(f, o) {
  const h = o.after, c = o.cell, patch = { revision: h.revision, operationId: h.operationId, sourceRevision: h.sourceRevision, nonEmptyCount: h.nonEmptyCount, rowCounts: { [c.row]: h.rowCounts[c.row] }, columnCounts: { [c.column]: h.columnCounts[c.column] } };
  return [update(f, 'head/current', patch, ['revision', 'operationId', 'sourceRevision', 'nonEmptyCount', `rowCounts.\`${c.row}\``, `columnCounts.\`${c.column}\``], true),
    update(f, `cells/${c.cellId}`, { kind: o.toKind }, ['kind'], true), update(f, `events/${o.id}`, o.history, undefined, false)];
}
async function publish(f, o, writes = slideWrites(f, o), token = f.owner.token) { ok(await commit(f, writes, token)); f.head = o.after; }
async function publishNonSeat(f, o) { await publish(f, o, nonSeatWrites(f, o)); o.cell.kind = o.toKind; }
async function reject(f, writes, token = f.owner.token) {
  const before = data(await get(f, 'head/current')); denied(await commit(f, writes, token)); assert.deepEqual(data(await get(f, 'head/current')), before);
}
async function assertSources(f) {
  const paths = [...f.model.section.cells.map(c => [`cells/${c.cellId}`, f.cellData(c)]), ...f.model.section.lineSettings.map(l => [`lines/${l.lineId}`, l]),
    ['seatReferences/current', { seats: f.model.seats, assignments: f.model.assignments, ticketRefs: f.model.ticketRefs, receptionRefs: f.model.receptionRefs }]];
  for (let offset = 0; offset < paths.length; offset += 200) {
    const expected = new Map(paths.slice(offset, offset + 200).map(([p, v]) => [name(f, p), v]));
    const r = await request(`${base}:batchGet`, f.owner.token, 'POST', { documents: [...expected.keys()] }); ok(r); assert.equal(r.body.length, expected.size);
    for (const item of r.body) assert.deepEqual(decode({ mapValue: { fields: item.found.fields } }), expected.get(item.found.name));
  }
}
async function record(id, label, action) { const result = await action(); reports.push({ id, label, status: 'passed', ...result }); console.log(`${id}: CHECKED ${label}`); }
let index = 0;
for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) for (const direction of Object.keys(deltas)) {
  await record(`O${String(++index).padStart(2, '0')}`, 'two writes match full slide calculation', async () => {
    const f = await fixture({ axis, order, direction }), before = structuredClone(f.model), expected = slide(before, { direction, amount: 1 }, context).after;
    await publish(f, movement(f)); const head = data(await get(f, 'head/current', f.reader.token));
    assert.deepEqual(projectView(before, head, context), expected); assert.deepEqual(f.model, before); await assertSources(f);
    const history = data(await get(f, `events/${head.operationId}`, f.owner.token)); assert(!Object.hasOwn(history, 'reason'));
    assert.equal(head.sourceRevision, 1); assert.equal(f.counts.requests, 1); assert.equal(f.counts.writes, 2);
    return { axis, order, direction, sourceUnchanged: true, counts: f.counts, refreshHeadReads: 1, refreshSourceReads: 0 };
  });
}
await record('O17', 'inverse and repeated moves keep stable identity and current boundary', async () => {
  const f = await fixture(); const original = structuredClone(f.model);
  await publish(f, movement(f, 'right')); await reject(f, slideWrites(f, movement(f, 'right')));
  await publish(f, movement(f, 'left')); assert.deepEqual(projectView(f.model, f.head, context), original);
  const empty = f.model.section.cells.find(c => c.column === 3); const snapshot = structuredClone(f.head);
  assert.equal(projectView(f.model, { ...snapshot, columnOffset: 1 }, context).section.cells.find(c => c.cellId === empty.cellId).column, 0);
  await assertSources(f); return { inverseRestored: true, secondOccupiedEdgeDenied: true, vacatedEdgeUsesOldUnsetIds: true };
});
await record('O18', 'all occupied boundary types reject in every direction', async () => {
  for (const direction of Object.keys(deltas)) for (const block of ['seat', 'gap', 'space', 'aisle']) {
    const f = await fixture({ direction, block }); await reject(f, slideWrites(f, movement(f)));
  }
  return { rejectedVariants: 16 };
});
await record('O19', 'slide cannot forge offsets, counters or immutable metadata', async () => {
  const f = await fixture(), o = movement(f);
  for (const patch of [{ rowOffset: 1 }, { columnOffset: 2 }, { rowOffset: -1 }, { columnOffset: 4 }, { rows: 5 }, { sourceRevision: 2 }, { sectionId: randomUUID() },
    { rowCounts: { ...f.head.rowCounts, 0: 0 } }, { columnCounts: { ...f.head.columnCounts, 0: 0 } }, { nonEmptyCount: 0 }, { initialNumbered: false }]) await reject(f, slideWrites(f, { ...o, after: { ...o.after, ...patch } }, true));
  for (const patch of [{ dr: 1, dc: 1 }, { dc: 2 }, { dc: 0 }, { dr: '0' }, { baseRevision: 0 }, { controlRevision: 0 }, { reason: '' }, { reason: 'FAKE' }]) await reject(f, slideWrites(f, { ...o, history: { ...o.history, ...patch } }));
  await publish(f, o); await assertSources(f); return { headForgeries: 11, historyForgeries: 8 };
});
await record('O20', 'atomic slide excludes isolated history, extra edits and replay', async () => {
  const f = await fixture(), o = movement(f), w = slideWrites(f, o);
  await reject(f, [w[0]]); await reject(f, [w[1]]);
  const c = f.model.section.cells[0]; await reject(f, [...w, update(f, `cells/${c.cellId}`, { row: 1 }, ['row'], true)]);
  await publish(f, o); await reject(f, w);
  const stored = data(await get(f, `events/${o.id}`, f.owner.token)); assert.deepEqual(stored, o.history);
  denied(await commit(f, [update(f, `events/${o.id}`, { ...stored, dc: -1 }, undefined, true)]));
  denied(await commit(f, [{ delete: name(f, `events/${o.id}`) }])); await assertSources(f);
  return { isolatedWritesAndExtraCellDenied: 3, replayDenied: true, historyImmutable: true, sameIdResultQuery: true };
});
await record('O21', 'verified non-seat edit maintains both axes and then blocks boundary', async () => {
  const f = await fixture(), c = f.model.section.cells.find(c => c.column === 3);
  await publishNonSeat(f, nonSeat(f, c, 'space')); assert.equal(f.head.columnCounts[3], 1); await reject(f, slideWrites(f, movement(f)));
  await publishNonSeat(f, nonSeat(f, c, 'aisle')); assert.equal(f.head.columnCounts[3], 1);
  await publishNonSeat(f, nonSeat(f, c, 'unset')); assert.equal(f.head.columnCounts[3], 0);
  const projected = slide(f.model, { direction: 'right', amount: 1 }, context).after; await publish(f, movement(f));
  assert.deepEqual(projectView(f.model, f.head, context), projected); await assertSources(f);
  return { sourceRevision: f.head.sourceRevision, countersMaintainedAcrossThreeKinds: true, restoredBoundaryAllowed: true };
});
await record('O22', 'non-seat edit rejects partial counters and unrelated changes', async () => {
  const f = await fixture(), c = f.model.section.cells.find(c => c.column === 3), o = nonSeat(f, c, 'space'), w = nonSeatWrites(f, o);
  for (let bits = 1; bits < 7; bits++) await reject(f, w.filter((_, i) => bits & (1 << i)));
  for (const patch of [{ rowCounts: f.head.rowCounts }, { columnCounts: f.head.columnCounts }, { nonEmptyCount: f.head.nonEmptyCount }, { sourceRevision: 1 },
    { rowCounts: { ...o.after.rowCounts, 1: 0 } }, { columnCounts: { ...o.after.columnCounts, 0: 0 } }, { rowOffset: 1 }]) {
    const forged = structuredClone(w); forged[0] = update(f, 'head/current', { ...o.after, ...patch }, undefined, true); await reject(f, forged);
  }
  for (const key of ['seatId', 'row', 'column', 'consumedNumber']) {
    const forged = structuredClone(w); forged[1] = update(f, `cells/${c.cellId}`, { ...f.cellData(c), kind: 'space', [key]: key === 'seatId' ? randomUUID() : 1 }, undefined, true); await reject(f, forged);
  }
  await publishNonSeat(f, o); await assertSources(f); return { rejectedSubsets: 6, summaryOrSourceForgeries: 11 };
});
await record('O23', 'editing a displayed edge uses the original cell coordinates', async () => {
  const f = await fixture(); await publish(f, movement(f));
  const visible = projectView(f.model, f.head, context), displayed = visible.section.cells.find(c => c.column === 0), original = f.model.section.cells.find(c => c.cellId === displayed.cellId);
  assert.equal(original.column, 3); await publishNonSeat(f, nonSeat(f, original, 'aisle'));
  await reject(f, slideWrites(f, movement(f, 'left'))); assert.equal(f.head.columnCounts[3], 1);
  assert.equal(projectView(f.model, f.head, context).section.cells.find(c => c.cellId === original.cellId).kind, 'aisle');
  return { originalColumn: 3, displayedColumn: 0, reverseMoveAfterEditDenied: true };
});
await record('O24', 'simultaneous slides and edits reject stale revisions in both orders', async () => {
  const f = await fixture(), pending = movement(f, 'right', f.other), winner = movement(f);
  await publish(f, winner); await reject(f, slideWrites(f, pending), f.other.token);
  for (const first of ['slide', 'edit']) {
    const a = await fixture(), c = a.model.section.cells.find(c => c.column === 3), slideOp = movement(a), editOp = nonSeat(a, c, 'space');
    if (first === 'slide') { await publish(a, slideOp); await reject(a, nonSeatWrites(a, editOp)); }
    else { await publishNonSeat(a, editOp); await reject(a, slideWrites(a, slideOp)); }
  }
  return { staleSlideAndEditVariantsDenied: 3 };
});
await record('O25', 'latest role, device, session and control are checked at confirmation', async () => {
  for (const mutation of ['role', 'device', 'session', 'control', 'roleRevision']) {
    const f = await fixture(), o = movement(f);
    if (mutation === 'role') await seed(f, 'roles/FAKE-manager', { active: true, role: 'receptionist', revision: 2 });
    if (mutation === 'roleRevision') await seed(f, 'roles/FAKE-manager', { active: true, role: 'owner', revision: 2 });
    if (mutation === 'device') await seed(f, `devices/${f.owner.uid}`, { deviceUid: f.owner.uid, humanUid: 'FAKE-manager', active: false, preparedRoleRevision: 1 });
    if (mutation === 'session') await seed(f, `sessions/${f.owner.uid}`, { humanUid: 'FAKE-manager', active: true, emailVerified: true, expiresAt: { $timestamp: '2000-01-01T00:00:00Z' } });
    if (mutation === 'control') await seed(f, 'control/current', { revision: 2, firstReceptionStartedAt: { $timestamp: new Date().toISOString() } });
    await reject(f, slideWrites(f, o));
  }
  return { revocationAndControlVariants: 5, calendarNotTested: true };
});
await record('O26', 'role and performance boundaries with deputy confirmation', async () => {
  const f = await fixture(), other = await fixture(); await reject(f, slideWrites(f, movement(f)), f.reader.token);
  await reject(f, slideWrites(f, movement(f)), other.owner.token); denied(await get(f, 'head/current', null));
  denied(await commit(f, [update(f, 'head/current', { ...f.head, columnOffset: 1 }, undefined, true)]));
  const deputy = await fixture({ role: 'deputy' }); await publish(deputy, movement(deputy)); denied(await get(deputy, `events/${deputy.head.operationId}`, deputy.reader.token));
  return { crossPerformanceAndReaderEditDenied: true, deputyAccepted: true, privateHistoryDenied: true };
});
await record('O27', '930 cells retain 500 references with one request and two writes', async () => {
  const began = performance.now(), f = await fixture({ large: true }), before = structuredClone(f.model), expected = slide(before, { direction: 'right', amount: 1 }, context).after;
  await publish(f, movement(f)); const current = data(await get(f, 'head/current', f.reader.token)); assert.deepEqual(projectView(before, current, context), expected);
  await assertSources(f); assert.equal(f.counts.requests, 1); assert.equal(f.counts.writes, 2); assert.equal(current.sourceRevision, 1);
  assert.equal(expected.seats.length, 900); assert.equal(expected.assignments.length, 500);
  assert.equal(expected.seats[0].emergencyChange.reason, '架空：補助席用途');
  return { cells: 930, seats: 900, lines: 30, assignedReferences: 500, ticketReferences: 500, receptionReferences: 500, sourcesUnchanged: true,
    counts: f.counts, refreshHeadReads: 1, refreshSourceReads: 0, elapsedMs: Math.round(performance.now() - began), prerequisiteAndVerificationIOExcluded: true };
});
await record('O28', 'all-unset no-op, unnumbered draft and invalid projection are guarded', async () => {
  const empty = await fixture({ empty: true }); await reject(empty, slideWrites(empty, movement(empty)));
  const unnumbered = await fixture({ numbered: false }); await reject(unnumbered, slideWrites(unnumbered, movement(unnumbered)));
  const f = await fixture(); for (const patch of [{ rowOffset: -1 }, { rowOffset: 4 }, { columnOffset: 0.5 }, { columns: 5 }, { sectionId: randomUUID() }]) assert.throws(() => projectView(f.model, { ...f.head, ...patch }, context));
  return { emptySaveDenied: true, unnumberedDenied: true, invalidProjectionVariants: 5 };
});
await record('O29', 'seat and gap source records cannot use non-seat counter operation', async () => {
  const f = await fixture();
  for (const kind of ['seat', 'gap']) { const c = f.model.section.cells.find(c => c.kind === kind); await reject(f, nonSeatWrites(f, nonSeat(f, c, 'unset'))); }
  const c = f.model.section.cells.find(c => c.kind === 'unset');
  for (const kind of ['seat', 'gap']) await reject(f, nonSeatWrites(f, nonSeat(f, c, kind)));
  await assertSources(f); return { unsupportedSeatAndGapChangesDenied: 4, fullSeatEditIntegrationNotTested: true };
});
await record('O30', 'missed source edits remain detectable after a later slide', async () => {
  const f = await fixture(), cached = structuredClone(f.model), cachedHead = structuredClone(f.head), c = f.model.section.cells.find(c => c.kind === 'space');
  await publishNonSeat(f, nonSeat(f, c, 'aisle')); await publish(f, movement(f)); const current = data(await get(f, 'head/current', f.reader.token));
  assert.notEqual(current.sourceRevision, cachedHead.sourceRevision); assert.notDeepEqual(projectView(cached, current, context), projectView(f.model, current, context));
  await assertSources(f); return { missedEditDetectedBySourceRevision: true, staleSourceMustRefresh: true, fullReceiverNotImplemented: true };
});
const endSourceHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)]))); assert.deepEqual(endSourceHashes, sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({ project, runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceHashes, endSourceHashes,
  scope: 'preseeded single-section offsets and verified non-seat counter maintenance; not initialization, expansion, full seat edits, production projection, calendar, QR, SDK or IndexedDB', reports }, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);