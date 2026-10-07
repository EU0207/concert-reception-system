import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend } from '../../GD91-07/planner.mjs';
import { slide } from '../../GD91-08/slide.mjs';

const project = 'demo-concert-seat-gd91-09';
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9191');
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const sources = ['../firestore.rules', '../firebase.json', 'emulator.mjs', '../../GD91-07/planner.mjs', '../../GD91-08/slide.mjs'];
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
const relative = (f, suffix) => `slideShows/${f.show}/${suffix}`;
const name = (f, suffix) => `projects/${project}/databases/(default)/documents/${relative(f, suffix)}`;
const update = (f, suffix, value, exists) => ({ update: { name: name(f, suffix), fields: fields(value) }, ...(exists === undefined ? {} : { currentDocument: { exists } }) });
const get = (f, suffix, token = 'owner') => request(`${base}/${relative(f, suffix)}`, token);
const data = r => decode({ mapValue: { fields: r.body.fields } });
async function commit(f, writes, token = f.owner.token) {
  const result = await request(`${base}:commit`, token, 'POST', { writes });
  if (token !== 'owner') { f.counts.requests++; f.counts.writes += writes.length; f.counts.maxRequestBytes = Math.max(f.counts.maxRequestBytes, Buffer.byteLength(JSON.stringify({ writes }))); }
  return result;
}
async function seed(f, suffix, value) { const r = await commit(f, [update(f, suffix, value)], 'owner'); assert.equal(r.status, 200); }
const expectOK = r => assert.equal(r.status, 200, JSON.stringify(r.body));
const expectDenied = r => assert.equal(r.status, 403, JSON.stringify(r.body));
function records(model, originalLines = model.section.lineSettings) {
  const seats = new Map(model.seats.map(s => [s.seatId, s]));
  const assignments = new Map(model.assignments.map(a => [a.seatId, a]));
  return [...model.section.cells.map(c => ({ type: 'cell', id: c.cellId, row: c.row, column: c.column, kind: c.kind, consumedNumber: c.consumedNumber ?? null,
    seat: c.seatId ? { ...seats.get(c.seatId), assignment: assignments.get(c.seatId) ?? null,
      ticketReference: assignments.has(c.seatId) ? `FAKE-ticket-${assignments.get(c.seatId).attendeeId}` : null,
      receptionReference: assignments.has(c.seatId) ? `FAKE-reception-${assignments.get(c.seatId).attendeeId}` : null } : null })),
    ...originalLines.map(old => ({ type: 'line', ...model.section.lineSettings.find(l => l.lineId === old.lineId) }))];
}
async function fixture({ axis = 'horizontal', order = 'forward', direction = 'right', large = false, block = null, role = 'owner' } = {}) {
  const f = { show: `FAKE-${randomUUID()}`, owner: await actor(), other: await actor(), reader: await actor(), counts: { requests: 0, writes: 0, maxRequestBytes: 0 } };
  let m = createSection({ name: '架空区画', rows: large ? 30 : 4, columns: large ? 30 : 4, axis, seatOrder: order,
    lines: Array.from({ length: large ? 30 : 4 }, (_, i) => ({ name: `L${i}` })) }, context);
  const selections = Object.fromEntries(m.section.cells.map(c => [`${c.row},${c.column}`, 'seat']));
  if (!large) {
    m.section.cells.filter(c => direction === 'up' ? c.row === 0 : direction === 'down' ? c.row === 3 : direction === 'left' ? c.column === 0 : c.column === 3).forEach(c => { selections[`${c.row},${c.column}`] = 'unset'; });
    Object.assign(selections, { '1,1': 'gap', '1,2': 'space', '2,1': 'aisle' });
    if (block) { const c = m.section.cells.find(c => selections[`${c.row},${c.column}`] === 'unset'); selections[`${c.row},${c.column}`] = block; }
  }
  m = numberInitial(m, selections, context);
  if (large) m = extend(m, { dimension: 'columns', count: 1, selections: {} }, context).after;
  m.assignments = m.seats.slice(0, large ? 500 : 3).map((s, i) => ({ seatId: s.seatId, attendeeId: `FAKE-person-${i}`, fixed: true }));
  if (m.seats.length) Object.assign(m.seats[0], { category: 'reserved', reservedLabel: '架空用途', emergencyChange: { kind: 'add', reason: '架空：補助席用途' } });
  f.model = m; f.before = records(m); f.direction = direction; const [dr, dc] = deltas[direction];
  f.head = { generation: randomUUID(), revision: 1, operationId: '', sectionId: m.section.sectionId, sectionName: m.section.name,
    rows: m.section.rows, columns: m.section.columns, axis, seatOrder: order, stagePosition: m.section.stagePosition, cellCount: m.section.cells.length, lineCount: m.section.lineSettings.length };
  f.opId = randomUUID(); f.operation = { kind: 'slide', deviceUid: f.owner.uid, baseGeneration: f.head.generation, baseRevision: 1, controlRevision: 1, dr, dc, processed: 0, phase: 'preparing' };
  f.expected = block ? null : records(slide(m, { direction, amount: 1 }, context).after, m.section.lineSettings);
  const prerequisites = [update(f, 'head/current', f.head), update(f, 'control/current', { revision: 1, firstReceptionStartedAt: null }),
    update(f, 'roles/FAKE-manager', { active: true, role, revision: 1 }), update(f, 'roles/FAKE-reader', { active: true, role: 'receptionist', revision: 1 })];
  for (const [a, humanUid] of [[f.owner, 'FAKE-manager'], [f.other, 'FAKE-manager'], [f.reader, 'FAKE-reader']]) {
    prerequisites.push(update(f, `devices/${a.uid}`, { deviceUid: a.uid, humanUid, active: true, preparedRoleRevision: 1 }),
      update(f, `sessions/${a.uid}`, { humanUid, active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } }));
  }
  prerequisites.push(...f.before.map((r, i) => update(f, `generations/${f.head.generation}/records/${i}`, r)));
  for (let i = 0; i < prerequisites.length; i += 200) expectOK(await commit(f, prerequisites.slice(i, i + 200), 'owner'));
  return f;
}
const start = f => commit(f, [update(f, `operations/${f.opId}`, f.operation, false)]);
function stepWrites(f, value = f.expected[f.operation.processed]) {
  return [update(f, `generations/${f.opId}/records/${f.operation.processed}`, value, false), update(f, `operations/${f.opId}`, { ...f.operation, processed: f.operation.processed + 1 }, true)];
}
async function append(f) { expectOK(await commit(f, stepWrites(f))); f.operation.processed++; }
async function ready(f) { expectOK(await commit(f, [update(f, `operations/${f.opId}`, { ...f.operation, phase: 'ready' }, true)])); f.operation.phase = 'ready'; }
async function prepare(f) { expectOK(await start(f)); while (f.operation.processed < f.before.length) await append(f); await ready(f); }
function publication(f) {
  return [update(f, 'head/current', { ...f.head, generation: f.opId, revision: f.head.revision + 1, operationId: f.opId }, true),
    update(f, `operations/${f.opId}`, { ...f.operation, phase: 'published' }, true),
    update(f, `events/${f.opId}`, { kind: 'slide', deviceUid: f.owner.uid, baseGeneration: f.head.generation, generation: f.opId, revision: f.head.revision + 1, dr: f.operation.dr, dc: f.operation.dc }, false)];
}
async function unchanged(f, action) {
  const before = data(await get(f, 'head/current')); expectDenied(await action()); assert.deepEqual(data(await get(f, 'head/current')), before);
}
async function verifyPublished(f) {
  const h = data(await get(f, 'head/current', f.reader.token)); assert.equal(h.generation, f.opId); assert.equal(h.revision, f.head.revision + 1);
  const response = await request(`${base}:batchGet`, f.owner.token, 'POST', { documents: f.expected.map((_, i) => name(f, `generations/${f.opId}/records/${i}`)) }); expectOK(response);
  const all = new Map(response.body.map(r => [Number(r.found.name.split('/').at(-1)), decode({ mapValue: { fields: r.found.fields } })]));
  assert.equal(all.size, f.expected.length); f.expected.forEach((r, i) => assert.deepEqual(all.get(i), r));
  assert.equal(Object.hasOwn(data(await get(f, `events/${f.opId}`, f.owner.token)), 'reason'), false);
  assert.equal(Object.hasOwn(data(await get(f, `operations/${f.opId}`, f.owner.token)), 'reason'), false);
  assert.equal((await get(f, `events/${f.opId}`, f.reader.token)).status, 403);
  return all;
}
async function record(id, label, action) { const result = await action(); reports.push({ id, label, status: 'passed', ...result }); console.log(`${id}: CHECKED ${label}`); }

let index = 0;
for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) for (const direction of Object.keys(deltas)) {
  await record(`G${String(++index).padStart(2, '0')}`, 'direction and numbering profiles publish matching records', async () => {
    const f = await fixture({ axis, order, direction }); await prepare(f); assert.deepEqual(data(await get(f, 'head/current')), f.head);
    expectOK(await commit(f, publication(f))); await verifyPublished(f); return { axis, order, direction, records: f.before.length, counts: f.counts };
  });
}
await record('G17', 'cannot skip validation or alter command, records and line correspondence', async () => {
  const f = await fixture();
  for (const extra of [{ reason: '' }, { reason: 'FAKE' }, { dr: 1, dc: 1 }, { dc: 2 }, { processed: f.before.length }, { phase: 'ready' }, { baseRevision: 0 }, { controlRevision: 0 }]) await unchanged(f, () => commit(f, [update(f, `operations/${f.opId}`, { ...f.operation, ...extra }, false)]));
  expectOK(await start(f));
  for (const extra of [{ processed: 2 }, { processed: f.before.length, phase: 'ready' }, { phase: 'ready' }, { dr: -1 }]) await unchanged(f, () => commit(f, [update(f, `operations/${f.opId}`, { ...f.operation, ...extra }, true)]));
  const cell = f.expected[0];
  for (const extra of [{ id: randomUUID() }, { row: cell.row + 1 }, { column: cell.column + 1 }, { kind: 'unset' }, { seat: null }]) await unchanged(f, () => commit(f, stepWrites(f, { ...cell, ...extra })));
  for (const key of ['seatId', 'lineId', 'number', 'category', 'usable', 'reservedLabel', 'assignment', 'ticketReference', 'receptionReference', 'emergencyChange']) {
    const changed = structuredClone(cell); changed.seat[key] = key === 'usable' ? false : `FAKE-tamper-${key}`; await unchanged(f, () => commit(f, stepWrites(f, changed)));
  }
  await unchanged(f, () => commit(f, [stepWrites(f)[0]])); await unchanged(f, () => commit(f, [stepWrites(f)[1]]));
  const wrongOrdinal = stepWrites(f); wrongOrdinal[0].update.name = name(f, `generations/${f.opId}/records/1`); await unchanged(f, () => commit(f, wrongOrdinal));
  while (f.operation.processed < f.head.cellCount) await append(f);
  const line = f.expected[f.operation.processed];
  for (const extra of [{ lineId: randomUUID() }, { name: 'FAKE-change' }, { nextAutomaticNumber: 999 }, { index: (line.index + 1) % f.head.lineCount }]) await unchanged(f, () => commit(f, stepWrites(f, { ...line, ...extra })));
  while (f.operation.processed < f.before.length) await append(f); await ready(f); expectOK(await commit(f, publication(f))); await verifyPublished(f);
  return { invalidCommands: 8, skippedOrChangedProgress: 4, cellMutations: 15, detachedOrWrongOrdinal: 3, lineMutations: 4 };
});
await record('G18', 'every occupied boundary type prevents publication', async () => {
  for (const block of ['seat', 'gap', 'space', 'aisle']) {
    const f = await fixture({ block }); expectOK(await start(f));
    f.expected = f.before.map(r => r.type === 'cell' ? { ...r, column: (r.column + 1) % f.head.columns } : r);
    const outside = f.before.findIndex(r => r.type === 'cell' && r.column === f.head.columns - 1 && r.kind !== 'unset');
    while (f.operation.processed < outside) await append(f);
    await unchanged(f, () => commit(f, stepWrites(f))); assert.equal((await get(f, `generations/${f.opId}/records/${outside}`)).status, 404);
    await unchanged(f, () => commit(f, publication(f)));
  }
  return { boundaryTypesRejected: 4, partialCandidateInvisible: true };
});
await record('G19', 'all incomplete publication subsets and forged event rejected', async () => {
  const f = await fixture(); await prepare(f); const w = publication(f);
  for (let bits = 1; bits < 7; bits++) await unchanged(f, () => commit(f, w.filter((_, i) => bits & (1 << i))));
  for (const key of ['reason', 'dr', 'revision', 'baseGeneration']) { const forged = structuredClone(w); forged[2] = update(f, `events/${f.opId}`, { ...decode({ mapValue: { fields: forged[2].update.fields } }), [key]: key === 'dr' ? -1 : 'FAKE-wrong' }, false); await unchanged(f, () => commit(f, forged)); }
  const shape = structuredClone(w); shape[0].update.fields.rows = encode(99); await unchanged(f, () => commit(f, shape));
  expectOK(await commit(f, w)); await verifyPublished(f); return { rejectedSubsets: 6, forgedHistoryOrHead: 5 };
});
await record('G20', 'interruption, read isolation, immutable candidate and unknown reply', async () => {
  const f = await fixture(); expectOK(await start(f)); await append(f);
  assert.deepEqual(data(await get(f, 'head/current', f.reader.token)), f.head);
  expectDenied(await get(f, `generations/${f.opId}/records/0`, f.reader.token)); expectOK(await get(f, `generations/${f.head.generation}/records/0`, f.reader.token));
  expectDenied(await commit(f, [update(f, `generations/${f.opId}/records/0`, { ...f.expected[0], row: 99 }, true)]));
  expectDenied(await commit(f, [{ delete: name(f, `generations/${f.opId}/records/0`) }]));
  const saved = data(await get(f, `operations/${f.opId}`, f.owner.token)); assert.equal(saved.processed, 1);
  f.operation = saved; while (f.operation.processed < f.before.length) await append(f); await ready(f); const w = publication(f); expectOK(await commit(f, w));
  assert.equal(data(await get(f, `operations/${f.opId}`, f.owner.token)).phase, 'published'); expectDenied(await commit(f, w)); await verifyPublished(f);
  return { oldVersionDuringPreparation: true, candidatePrivateAndImmutable: true, sameOperationResume: true, simulatedLostReply: true, doublePublicationDenied: true, indexedDBNotTested: true };
});
await record('G21', 'stale concurrent preparation cannot overwrite winner', async () => {
  const f = await fixture(), other = { ...f, owner: f.other, opId: randomUUID(), operation: { ...f.operation, deviceUid: f.other.uid }, counts: { requests: 0, writes: 0, maxRequestBytes: 0 } };
  await prepare(f); await prepare(other); expectOK(await commit(f, publication(f))); await unchanged(other, () => commit(other, publication(other)));
  assert.equal(data(await get(f, 'head/current')).generation, f.opId); assert.equal((await get(f, `events/${other.opId}`)).status, 404);
  return { independentPreparedCandidates: 2, winnerPublished: 1, stalePublicationDenied: true };
});
await record('G22', 'revocation and control changes fence preparation and publication', async () => {
  for (const phase of ['preparing', 'ready']) for (const mutation of ['role', 'device', 'session', 'control']) {
    const f = await fixture(); if (phase === 'ready') await prepare(f); else expectOK(await start(f));
    if (mutation === 'role') await seed(f, 'roles/FAKE-manager', { active: true, role: 'receptionist', revision: 2 });
    if (mutation === 'device') await seed(f, `devices/${f.owner.uid}`, { deviceUid: f.owner.uid, humanUid: 'FAKE-manager', active: false, preparedRoleRevision: 1 });
    if (mutation === 'session') await seed(f, `sessions/${f.owner.uid}`, { humanUid: 'FAKE-manager', active: true, emailVerified: true, expiresAt: { $timestamp: '2000-01-01T00:00:00Z' } });
    if (mutation === 'control') await seed(f, 'control/current', { revision: 2, firstReceptionStartedAt: { $timestamp: new Date().toISOString() } });
    await unchanged(f, () => commit(f, phase === 'ready' ? publication(f) : stepWrites(f)));
  }
  return { phaseAndRevocationVariants: 8, latestControlRequired: true, calendarAndFirstStartIssuanceNotTested: true };
});
await record('G23', 'role and performance separation and direct head forgery', async () => {
  const f = await fixture(), other = await fixture();
  expectDenied(await start({ ...f, owner: f.reader, operation: { ...f.operation, deviceUid: f.reader.uid } }));
  expectDenied(await commit(f, [update(f, `operations/${f.opId}`, f.operation, false)], other.owner.token));
  expectDenied(await get(f, 'head/current', null)); expectDenied(await commit(f, [update(f, 'head/current', { ...f.head, generation: randomUUID(), revision: 2 }, true)]));
  const deputy = await fixture({ role: 'deputy' }); await prepare(deputy); expectOK(await commit(deputy, publication(deputy))); await verifyPublished(deputy);
  return { receptionistAndCrossPerformanceAndAnonymousDenied: true, unvalidatedHeadDenied: true, deputyAccepted: true };
});
await record('G24', '930 cells and 900 seats retain 500 references without reason', async () => {
  const began = performance.now(), f = await fixture({ large: true }); await prepare(f);
  assert.deepEqual(data(await get(f, 'head/current', f.reader.token)), f.head); expectOK(await commit(f, publication(f))); const all = await verifyPublished(f);
  const cells = [...all.values()].filter(r => r.type === 'cell'); assert.equal(cells.length, 930); assert.equal(cells.filter(r => r.seat).length, 900); assert.equal(cells.filter(r => r.seat?.assignment).length, 500);
  assert.equal(cells.find(r => r.seat?.emergencyChange).seat.emergencyChange.reason, '架空：補助席用途');
  assert.equal(f.counts.requests, 963); assert.equal(f.counts.writes, 1925);
  return { cells: 930, seats: 900, lines: 30, assignedReferences: 500, ticketReferences: 500, receptionReferences: 500, noSlideReason: true,
    counts: f.counts, elapsedMs: Math.round(performance.now() - began), prerequisiteWritesExcluded: true };
});
const endSourceHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)]))); assert.deepEqual(endSourceHashes, sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({ project, runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceHashes, endSourceHashes,
  scope: 'preseeded single-section slide generation; not initial creation, growth, multi-section, real QR, complete authorization, calendar, SDK or IndexedDB', reports }, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);