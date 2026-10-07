import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend } from '../../GD91-07/planner.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { project as projectView, initialHead } from '../../GD91-10/projection.mjs';

const project = 'demo-concert-seat-gd91-12';
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9191');
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const sources = ['../firestore.rules', '../firebase.json', 'emulator.mjs', '../../GD91-10/projection.mjs', '../../GD91-07/planner.mjs', '../../GD91-08/slide.mjs'];
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
const relative = (f, suffix) => `identityShows/${f.show}/${suffix}`;
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
async function fixture({ axis = 'horizontal', order = 'forward', direction = 'right', rows = 4, columns = 4, large = false, empty = false, block = null, role = 'owner' } = {}) {
  const f = { show: `FAKE-${randomUUID()}`, owner: await actor(), other: await actor(), reader: await actor(), counts: { requests: 0, writes: 0, maxRequestBytes: 0 } };
  if (large) { rows = 30; columns = 30; }
  let m = createSection({ name: '架空集計区画', rows, columns, axis, seatOrder: order, stagePosition: axis === 'vertical' ? 'top' : 'left',
    lines: Array.from({ length: axis === 'horizontal' ? rows : columns }, (_, i) => ({ name: `L${i}` })) }, context);
  const selections = Object.fromEntries(m.section.cells.map(c => [`${c.row},${c.column}`, empty ? 'unset' : 'seat']));
  if (!large && !empty) {
    for (const c of m.section.cells) if (direction === 'up' ? c.row === 0 : direction === 'down' ? c.row === rows - 1 : direction === 'left' ? c.column === 0 : c.column === columns - 1) selections[`${c.row},${c.column}`] = 'unset';
    for (const [pos, kind] of [['1,1', 'gap'], ['1,2', 'space'], ['2,1', 'aisle']]) if (Object.hasOwn(selections, pos) && selections[pos] !== 'unset') selections[pos] = kind;
    if (block) { const pos = Object.keys(selections).find(k => selections[k] === 'unset'); selections[pos] = block; }
  }
  m = numberInitial(m, selections, context);
  if (large) m = extend(m, { dimension: 'columns', count: 1 }, context).after;
  m.assignments = m.seats.slice(0, large ? 500 : 3).map((s, i) => ({ seatId: s.seatId, attendeeId: `FAKE-person-${i}`, fixed: true }));
  m.ticketRefs = m.assignments.map(a => ({ attendeeId: a.attendeeId, ticketId: `FAKE-ticket-${a.attendeeId}`, credentialId: `FAKE-qr-${a.attendeeId}` }));
  m.receptionRefs = m.assignments.map(a => ({ attendeeId: a.attendeeId, receptionId: `FAKE-reception-${a.attendeeId}` }));
  if (m.seats.length) m.seats[0].emergencyChange = { kind: 'add', reason: '架空：補助席用途' };
  f.model = m; f.expected = initialHead(m); f.direction = direction;
  f.head = { ...f.expected, rowCounts: {}, columnCounts: {}, nonEmptyCount: 0, sourceRevision: 0, revision: 0, status: 'building', cursor: 0, lastChunk: '', controlRevision: 1, initializationId: randomUUID() };
  f.registry = { initializationId: f.head.initializationId, cursor: 0, usedIds: { [f.head.sectionId]: true } };
  f.chunks = [];
  for (let row = 0; row < m.section.rows; row++) for (let col = 0; col < m.section.columns; col += 5) {
    const cells = m.section.cells.filter(c => c.row === row && c.column >= col && c.column < col + 5).sort((a, b) => a.column - b.column)
      .map(c => ({ ...c, seatId: c.seatId ?? '', consumedNumber: c.consumedNumber ?? null }));
    f.chunks.push({ id: `${row}-${col}`, value: { row, startColumn: col, cells, cellIds: cells.map(c => c.cellId) } });
  }
  const writes = [update(f, 'control/current', { revision: 1, firstReceptionStartedAt: null }), update(f, 'roles/FAKE-manager', { active: true, role, revision: 1 }), update(f, 'roles/FAKE-reader', { active: true, role: 'receptionist', revision: 1 })];
  for (const [a, humanUid] of [[f.owner, 'FAKE-manager'], [f.other, 'FAKE-manager'], [f.reader, 'FAKE-reader']]) writes.push(
    update(f, `devices/${a.uid}`, { deviceUid: a.uid, humanUid, active: true, preparedRoleRevision: 1 }),
    update(f, `sessions/${a.uid}`, { humanUid, active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } }));
  writes.push(...m.section.lineSettings.map(l => update(f, `lines/${l.lineId}`, l)), update(f, 'seatReferences/current', { seats: m.seats, assignments: m.assignments, ticketRefs: m.ticketRefs, receptionRefs: m.receptionRefs }));
  ok(await commit(f, writes, 'owner')); return f;
}
function startWrites(f, head = f.head, registry = f.registry) {
  return [update(f, 'head/current', head, undefined, false), update(f, 'idRegistry/current', registry, undefined, false)];
}
async function start(f) { ok(await commit(f, startWrites(f))); }
function ingestion(f, chunk = f.chunks.find(c => c.value.row * f.head.columns + c.value.startColumn === f.head.cursor)) {
  assert(chunk); const after = structuredClone(f.head), c = chunk.value;
  after.cursor += c.cells.length; after.lastChunk = chunk.id;
  for (const cell of c.cells) {
    const delta = Number(cell.kind !== 'unset'); after.nonEmptyCount += delta;
    after.rowCounts[cell.row] = (after.rowCounts[cell.row] ?? 0) + delta;
    after.columnCounts[cell.column] = (after.columnCounts[cell.column] ?? 0) + delta;
  }
  const registry = structuredClone(f.registry); registry.cursor = after.cursor;
  const ids = [...new Set(c.cells.flatMap(cell => [cell.cellId, ...(cell.kind === 'seat' ? [cell.seatId] : [])]))];
  for (const id of ids) registry.usedIds[id] = true;
  return { chunk, after, registry, ids };
}
function ingestWrites(f, o) {
  const keys = ['cursor', 'lastChunk', 'nonEmptyCount', 'rowCounts', 'columnCounts'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true), update(f, `chunks/${o.chunk.id}`, o.chunk.value, undefined, false),
    update(f, 'idRegistry/current', { cursor: o.registry.cursor, usedIds: Object.fromEntries(o.ids.map(id => [id, true])) }, ['cursor', ...o.ids.map(id => `usedIds.\`${id}\``)], true)];
}
async function ingest(f, o = ingestion(f)) { ok(await commit(f, ingestWrites(f, o))); f.head = o.after; f.registry = o.registry; }
async function fill(f) { while (f.head.cursor < f.head.rows * f.head.columns) await ingest(f); }
function completion(f) {
  const id = randomUUID(); return { id, after: { ...f.head, status: 'countReady', revision: 1, sourceRevision: 1, operationId: id },
    history: { kind: 'initialCounterProof', deviceUid: f.owner.uid, initializationId: f.head.initializationId, controlRevision: 1 } };
}
function finishWrites(f, o) {
  const keys = ['status', 'revision', 'sourceRevision', 'operationId'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true), update(f, `events/${o.id}`, o.history, undefined, false)];
}
async function finish(f, o = completion(f)) { ok(await commit(f, finishWrites(f, o))); f.head = o.after; }
async function initialize(f) { await start(f); await fill(f); await finish(f); }
function movement(f, direction = f.direction, who = f.owner) {
  const [dr, dc] = deltas[direction], h = f.head, id = randomUUID();
  return { id, after: { ...h, revision: h.revision + 1, operationId: id, rowOffset: (h.rowOffset + dr + h.rows) % h.rows, columnOffset: (h.columnOffset + dc + h.columns) % h.columns },
    history: { kind: 'slide', deviceUid: who.uid, baseRevision: h.revision, revision: h.revision + 1, controlRevision: 1, dr, dc } };
}
function slideWrites(f, o) {
  const keys = ['revision', 'operationId', 'rowOffset', 'columnOffset'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true), update(f, `events/${o.id}`, o.history, undefined, false)];
}
async function publishSlide(f, o = movement(f)) { ok(await commit(f, slideWrites(f, o))); f.head = o.after; }
async function reject(f, writes, token = f.owner.token) {
  const beforeIds = await get(f, 'idRegistry/current'), before = await get(f, 'head/current'); denied(await commit(f, writes, token)); const after = await get(f, 'head/current');
  const afterIds = await get(f, 'idRegistry/current'); assert.equal(afterIds.status, beforeIds.status); if (beforeIds.status === 200) assert.deepEqual(data(afterIds), data(beforeIds));
  assert.equal(after.status, before.status); if (before.status === 200) assert.deepEqual(data(after), data(before));
}
async function assertCounts(f) {
  const h = data(await get(f, 'head/current'));
  assert.deepEqual(data(await get(f, 'idRegistry/current')), f.registry);
  for (const [row, count] of Object.entries(f.expected.rowCounts)) assert.equal(h.rowCounts[row] ?? 0, count);
  for (const [col, count] of Object.entries(f.expected.columnCounts)) assert.equal(h.columnCounts[col] ?? 0, count);
  assert.equal(h.nonEmptyCount, f.expected.nonEmptyCount); assert.equal(h.cursor, h.rows * h.columns);
  const fetched = [];
  for (const c of f.chunks) { const actual = data(await get(f, `chunks/${c.id}`)); assert.deepEqual(actual, c.value); fetched.push(...actual.cells); }
  // 文書間のセル配列順は契約に含めない。IDで全件照合して比較元の順へ戻す。
  const byId = new Map(fetched.map(c => [c.cellId, c])); assert.equal(byId.size, f.model.section.cells.length);
  const restored = structuredClone(f.model); restored.section.cells = f.model.section.cells.map(expected => {
    const c = byId.get(expected.cellId); assert(c, 'missing cell identity');
    const result = { ...c }; if (result.seatId === '') delete result.seatId; if (result.consumedNumber === null) delete result.consumedNumber; return result;
  });
  assert.deepEqual(restored, f.model); return restored;
}
const resetCounts = f => { f.counts = { requests: 0, writes: 0, maxRequestBytes: 0 }; };
async function record(id, label, action) { const result = await action(); reports.push({ id, label, status: 'passed', ...result }); console.log(`${id}: CHECKED ${label}`); }
let index = 0;
for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) for (const direction of Object.keys(deltas)) {
  await record(`I${String(++index).padStart(2, '0')}`, 'untrusted initialization counts connect to offset slide', async () => {
    const f = await fixture({ axis, order, direction }); await initialize(f); const restored = await assertCounts(f);
    const initialization = structuredClone(f.counts); resetCounts(f); await publishSlide(f);
    assert.deepEqual(projectView(restored, f.head, context), slide(f.model, { direction, amount: 1 }, context).after);
    assert.equal(f.counts.requests, 1); assert.equal(f.counts.writes, 2); await assertCounts(f);
    return { axis, order, direction, initialization, slide: f.counts, countsSeededByAdmin: false, sourcePreserved: true };
  });
}
await record('I17', 'initial nonzero counters and completed-state forgery are denied', async () => {
  const f = await fixture();
  for (const patch of [{ rowCounts: { 0: 1 } }, { columnCounts: { 0: 1 } }, { nonEmptyCount: 1 }, { cursor: 1 }, { status: 'countReady' }, { rowOffset: 1 },
    { lastChunk: '0-0' }, { revision: 1 }, { sourceRevision: 1 }, { controlRevision: 0 }, { columns: 0 }, { rows: 101 }, { axis: 'diagonal' }, { extra: true }])
    await reject(f, startWrites(f, { ...f.head, ...patch }));
  await start(f); await reject(f, [update(f, 'head/current', { ...f.head, initializationId: randomUUID() }, undefined, true)]);
  return { creationForgeries: 14, existingHeadResetDenied: true };
});
await record('I18', 'chunks reject omitted cells, wrong positions and invented types', async () => {
  const f = await fixture({ columns: 11 }); await start(f); const o = ingestion(f);
  const variants = [];
  for (let slot = 0; slot < o.chunk.value.cells.length; slot++) {
    const forged = structuredClone(o); forged.chunk.value.cells[slot].kind = 'unknown'; variants.push(forged);
  }
  for (const field of ['row', 'column', 'cellId', 'seatId', 'consumedNumber']) {
    const forged = structuredClone(o), c = forged.chunk.value.cells[0]; c[field] = field === 'cellId' ? randomUUID() : field === 'seatId' ? '' : -1; variants.push(forged);
  }
  for (const mode of ['short', 'long', 'duplicate', 'skip', 'wrongPath', 'idList', 'extra']) {
    const forged = structuredClone(o), c = forged.chunk.value;
    if (mode === 'short') { c.cells.pop(); c.cellIds.pop(); }
    if (mode === 'long') { c.cells.push(c.cells[0]); c.cellIds.push(c.cellIds[0]); }
    if (mode === 'duplicate') { c.cells[1].cellId = c.cells[0].cellId; c.cellIds[1] = c.cellIds[0]; }
    if (mode === 'skip') { c.startColumn = 1; }
    if (mode === 'wrongPath') forged.chunk.id = '0-1';
    if (mode === 'idList') c.cellIds[0] = randomUUID();
    if (mode === 'extra') c.extra = true;
    variants.push(forged);
  }
  for (const forged of variants) await reject(f, ingestWrites(f, forged)); await ingest(f, o); await fill(f); await finish(f); await assertCounts(f);
  return { malformedChunkVariants: variants.length, fullAndShortChunksChecked: true };
});
await record('I19', 'every counter and atomic half-write is checked', async () => {
  const f = await fixture({ columns: 11 }); await start(f); const o = ingestion(f), w = ingestWrites(f, o);
  await reject(f, [w[0]]); await reject(f, [w[1]]);
  const patches = [{ cursor: 2 }, { lastChunk: '9-9' }, { nonEmptyCount: 0 }, { rowCounts: { 0: 0 } }, { rowCounts: { ...o.after.rowCounts, 3: 10 } },
    { columnCounts: { ...o.after.columnCounts, 12: 1 } }, { rows: 5 }, { sourceRevision: 1 }, { columnOffset: 1 }];
  for (let col = 0; col < 5; col++) patches.push({ columnCounts: { ...o.after.columnCounts, [col]: -1 } });
  for (const patch of patches) { const forged = structuredClone(w); forged[0] = update(f, 'head/current', { ...o.after, ...patch }, undefined, true); await reject(f, forged); }
  await ingest(f, o); await ingest(f); const tail = ingestion(f), badTail = structuredClone(tail); badTail.after.columnCounts[11] = 0;
  await reject(f, ingestWrites(f, badTail)); await ingest(f, tail); await fill(f); await finish(f); await assertCounts(f);
  return { halfWritesDenied: 2, counterForgeries: patches.length, paddedColumnInjectionDenied: true };
});
await record('I20', 'incomplete initialization is private and cannot slide or finish', async () => {
  const f = await fixture(); await start(f); await ingest(f);
  denied(await get(f, 'head/current', f.reader.token)); denied(await get(f, `chunks/${f.chunks[0].id}`, f.reader.token));
  denied(await get(f, 'seatReferences/current', f.reader.token));
  await reject(f, finishWrites(f, completion(f))); await reject(f, slideWrites(f, movement(f)));
  await fill(f); const o = completion(f), w = finishWrites(f, o); await reject(f, [w[0]]); await reject(f, [w[1]]);
  for (const patch of [{ initializationId: randomUUID() }, { controlRevision: 0 }, { deviceUid: f.other.uid }, { reason: 'FAKE' }]) {
    const forged = structuredClone(w); forged[1] = update(f, `events/${o.id}`, { ...o.history, ...patch }, undefined, false); await reject(f, forged);
  }
  await finish(f, o); ok(await get(f, 'head/current', f.reader.token)); ok(await get(f, `chunks/${f.chunks[0].id}`, f.reader.token));
  await reject(f, w); denied(await commit(f, [update(f, `events/${o.id}`, { ...o.history, reason: 'FAKE' }, undefined, true)]));
  return { prematureFinishAndSlideDenied: true, incompleteReaderAccessDenied: true, finalHalfWritesDenied: true, finalReplayAndHistoryEditDenied: true };
});
await record('I21', 'interruptions resume from stored progress without a duplicate chunk', async () => {
  const f = await fixture({ columns: 11 }); await start(f); const o = ingestion(f); await ingest(f, o);
  const stored = data(await get(f, 'head/current', f.owner.token)); assert.equal(stored.lastChunk, o.chunk.id); assert.deepEqual(data(await get(f, `chunks/${o.chunk.id}`, f.owner.token)), o.chunk.value);
  await reject(f, ingestWrites(f, o)); f.head = stored; f.registry = data(await get(f, 'idRegistry/current', f.owner.token)); await fill(f); const finishOp = completion(f); await finish(f, finishOp);
  const result = data(await get(f, `events/${finishOp.id}`, f.owner.token)); assert.deepEqual(result, finishOp.history); await assertCounts(f);
  return { persistedProgressResumed: true, lostChunkResponseDetectable: true, lostFinalResponseQueryable: true, browserOutboxNotImplemented: true };
});
await record('I22', 'racing initial chunks and old control revisions cannot publish', async () => {
  const f = await fixture(); await start(f); const pending = ingestion(f); await ingest(f, ingestion(f)); await reject(f, ingestWrites(f, pending), f.other.token);
  await fill(f); const finalOp = completion(f); await seed(f, 'control/current', { revision: 2, firstReceptionStartedAt: null }); await reject(f, finishWrites(f, finalOp));
  const other = await fixture(); await start(other); const chunkOp = ingestion(other); await seed(other, 'control/current', { revision: 2, firstReceptionStartedAt: null }); await reject(other, ingestWrites(other, chunkOp));
  return { staleConcurrentChunkDenied: true, controlChangeBlocksContinuationAndFinish: true };
});
await record('I23', 'revoked devices and roles cannot initialize, continue or finish', async () => {
  for (const phase of ['start', 'ingest', 'finish']) for (const mutation of ['role', 'device', 'session', 'preparedRoleRevision']) {
    const f = await fixture(); if (phase !== 'start') await start(f); if (phase === 'finish') await fill(f);
    const writes = phase === 'start' ? startWrites(f) : phase === 'ingest' ? ingestWrites(f, ingestion(f)) : finishWrites(f, completion(f));
    if (mutation === 'role') await seed(f, 'roles/FAKE-manager', { active: true, role: 'receptionist', revision: 2 });
    if (mutation === 'device') await seed(f, `devices/${f.owner.uid}`, { deviceUid: f.owner.uid, humanUid: 'FAKE-manager', active: false, preparedRoleRevision: 1 });
    if (mutation === 'session') await seed(f, `sessions/${f.owner.uid}`, { humanUid: 'FAKE-manager', active: true, emailVerified: true, expiresAt: { $timestamp: '2000-01-01T00:00:00Z' } });
    if (mutation === 'preparedRoleRevision') await seed(f, 'roles/FAKE-manager', { active: true, role: 'owner', revision: 2 });
    await reject(f, writes);
  }
  const f = await fixture(), other = await fixture(); await reject(f, startWrites(f), f.reader.token);
  await reject(f, startWrites(f), other.owner.token); await reject(f, startWrites(f), null);
  const deputy = await fixture({ role: 'deputy' }); await initialize(deputy); await publishSlide(deputy);
  return { phaseRevocationsDenied: 12, readerCrossShowAnonymousDenied: true, deputyAllowed: true };
});
await record('I24', 'each occupied boundary kind blocks an offset after verified counting', async () => {
  for (const direction of Object.keys(deltas)) for (const block of ['seat', 'gap', 'space', 'aisle']) { const f = await fixture({ direction, block }); await initialize(f); await assertCounts(f); await reject(f, slideWrites(f, movement(f))); }
  const empty = await fixture({ empty: true }); await initialize(empty); await assertCounts(empty); await reject(empty, slideWrites(empty, movement(empty)));
  return { blockedBoundaryVariants: 16, emptyGridCountedButSlideDenied: true };
});
await record('I25', 'short dimensions and chunk boundaries retain every row and column', async () => {
  const dimensions = [[1, 1], [1, 10], [1, 11], [2, 19], [2, 20], [2, 21]];
  for (const [rows, columns] of dimensions) { const f = await fixture({ rows, columns, empty: true }); await initialize(f); await assertCounts(f); }
  return { dimensions, rowAndColumnTotalsChecked: true };
});
await record('I26', '930 source cells are counted by device writes before two-write sliding', async () => {
  const f = await fixture({ large: true }); await initialize(f); const restored = await assertCounts(f), initialization = structuredClone(f.counts);
  const registryBefore = data(await get(f, 'idRegistry/current')); const registryJsonBytes = Buffer.byteLength(JSON.stringify(registryBefore)); const headJsonBytes = Buffer.byteLength(JSON.stringify(f.head));
  assert.equal(Object.keys(registryBefore.usedIds).length, 1831);
  resetCounts(f); const beforeChunks = structuredClone(f.chunks); await publishSlide(f); assert.deepEqual(f.chunks, beforeChunks);
  assert.deepEqual(projectView(restored, f.head, context), slide(f.model, { direction: 'right', amount: 1 }, context).after); await assertCounts(f);
  assert.equal(f.counts.requests, 1); assert.equal(f.counts.writes, 2); assert.equal(initialization.requests, 212); assert.equal(initialization.writes, 634);
  assert.equal(restored.seats.length, 900); assert.equal(restored.assignments.length, 500);
  return { cells: 930, seats: 900, chunks: 210, assignedReferences: 500, initialization, slide: f.counts, countsSourcesAndRegistrySeededByAdmin: false, registryEntries: 1831, registryJsonBytes, headJsonBytes, registryUnchangedBySlide: true, prerequisiteAndVerificationIOExcluded: true };
});
await record('I27', 'committed source and counts cannot be edited through initialization paths', async () => {
  const f = await fixture(); await initialize(f); const c = f.chunks[0];
  for (const kind of ['unset', 'seat', 'gap', 'space', 'aisle']) { const value = structuredClone(c.value); value.cells[0].kind = kind; await reject(f, [update(f, `chunks/${c.id}`, value, undefined, true)]); }
  await reject(f, [update(f, 'head/current', { ...f.head, rowCounts: {}, columnCounts: {}, nonEmptyCount: 0 }, undefined, true)]);
  denied(await commit(f, [{ delete: name(f, `chunks/${c.id}`) }])); await reject(f, [update(f, 'head/current', { ...f.head, status: 'building', cursor: 0 }, undefined, true)]);
  await publishSlide(f); assert(!Object.hasOwn(data(await get(f, `events/${f.head.operationId}`, f.owner.token)), 'reason')); await assertCounts(f);
  return { sourceAndCounterResetDenied: true, allEditKindsRequireSeparateIntegration: true, slideReasonAbsent: true };
});
await record('I28', 'the earlier cross-chunk cellId reuse is now rejected', async () => {
  const f = await fixture({ columns: 11 }); await start(f); await ingest(f);
  const chunk = structuredClone(f.chunks[1]), oldId = f.chunks[0].value.cells[0].cellId;
  chunk.value.cells[0].cellId = oldId; chunk.value.cellIds[0] = oldId;
  await reject(f, ingestWrites(f, ingestion(f, chunk))); await fill(f); await finish(f); await assertCounts(f);
  return { previousI28GapClosedWithinSection: true, cellIdReuseDenied: true };
});
await record('I29', 'seatId duplicates within and across chunks are rejected', async () => {
  const f = await fixture({ columns: 11 }); await start(f); const chunk = structuredClone(f.chunks[0]);
  chunk.value.cells[1].seatId = chunk.value.cells[0].seatId;
  await reject(f, ingestWrites(f, ingestion(f, chunk))); await ingest(f);
  const next = structuredClone(f.chunks[1]); next.value.cells[0].seatId = f.chunks[0].value.cells[0].seatId;
  await reject(f, ingestWrites(f, ingestion(f, next))); await fill(f); await finish(f); await assertCounts(f);
  return { duplicateSeatIdVariantsDenied: 2 };
});
await record('I30', 'cell and seat identities cannot collide or use noncanonical IDs', async () => {
  const f = await fixture({ columns: 11 }); await start(f);
  const patches = [
    c => { c.cellId = c.seatId; }, c => { c.seatId = c.cellId; },
    c => { c.cellId = f.head.sectionId; }, c => { c.seatId = f.head.sectionId; },
    c => { c.cellId = 'invalid'; }, c => { c.seatId = 'invalid'; },
    c => { c.cellId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'; }, c => { c.seatId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'; }
  ];
  for (const patch of patches) { const chunk = structuredClone(f.chunks[0]); patch(chunk.value.cells[0]); chunk.value.cellIds[0] = chunk.value.cells[0].cellId; await reject(f, ingestWrites(f, ingestion(f, chunk))); }
  await ingest(f);
  for (const mode of ['cell-to-old-seat', 'seat-to-old-cell']) {
    const chunk = structuredClone(f.chunks[1]); if (mode === 'cell-to-old-seat') { chunk.value.cells[0].cellId = f.chunks[0].value.cells[0].seatId; chunk.value.cellIds[0] = chunk.value.cells[0].cellId; }
    else chunk.value.cells[0].seatId = f.chunks[0].value.cells[0].cellId;
    await reject(f, ingestWrites(f, ingestion(f, chunk)));
  }
  await fill(f); await finish(f); await assertCounts(f); return { identityCollisionAndFormatVariantsDenied: 10, lowercaseUuidV4Required: true };
});
await record('I31', 'head, source and registry require one atomic commit', async () => {
  const f = await fixture(); const initial = startWrites(f); await reject(f, [initial[0]]); await reject(f, [initial[1]]); await start(f);
  const o = ingestion(f), writes = ingestWrites(f, o);
  for (let bits = 1; bits < 7; bits++) await reject(f, writes.filter((_, i) => bits & (1 << i)));
  await ingest(f, o); await fill(f); await finish(f); await assertCounts(f);
  return { initialHalfWritesDenied: 2, partialThreeWriteSubsetsDenied: 6 };
});
await record('I32', 'registry membership cannot be omitted, invented or reset', async () => {
  const f = await fixture({ columns: 11 });
  for (const patch of [{ usedIds: {} }, { usedIds: { [randomUUID()]: true } }, { usedIds: { [f.head.sectionId]: false } }, { cursor: 1 }, { initializationId: randomUUID() }, { extra: true }])
    await reject(f, startWrites(f, f.head, { ...f.registry, ...patch }));
  await start(f); await ingest(f); const o = ingestion(f), writes = ingestWrites(f, o);
  const missing = structuredClone(o.registry); delete missing.usedIds[o.ids[0]];
  const removed = structuredClone(o.registry); delete removed.usedIds[f.head.sectionId];
  const changed = structuredClone(o.registry); changed.usedIds[f.head.sectionId] = false;
  const falseValue = structuredClone(o.registry); falseValue.usedIds[o.ids[0]] = false;
  const extra = structuredClone(o.registry); extra.usedIds[randomUUID()] = true;
  const values = [missing, removed, changed, falseValue, extra, { ...o.registry, cursor: f.head.cursor }, { ...o.registry, cursor: o.registry.cursor + 1 }, { ...o.registry, initializationId: randomUUID() }, { ...o.registry, extra: true }];
  for (const value of values) { const forged = structuredClone(writes); forged[2] = update(f, 'idRegistry/current', value, undefined, true); await reject(f, forged); }
  await ingest(f, o); await fill(f); await finish(f); await assertCounts(f);
  return { initialRegistryForgeriesDenied: 6, registryUpdateForgeriesDenied: 9 };
});
await record('I33', 'registry stays private and frozen after initialization', async () => {
  const f = await fixture(), other = await fixture(); await initialize(f); const before = data(await get(f, 'idRegistry/current'));
  denied(await get(f, 'idRegistry/current', f.reader.token)); denied(await get(f, 'idRegistry/current', other.owner.token)); denied(await get(f, 'idRegistry/current', null));
  await reject(f, [update(f, 'idRegistry/current', { ...f.registry, cursor: 0, usedIds: {} }, undefined, true)]);
  denied(await commit(f, [{ delete: name(f, 'idRegistry/current') }]));
  const o = movement(f), extra = update(f, 'idRegistry/current', f.registry, undefined, true); await reject(f, [...slideWrites(f, o), extra]);
  resetCounts(f); await publishSlide(f, o); assert.deepEqual(data(await get(f, 'idRegistry/current')), before); assert.equal(f.counts.writes, 2);
  return { unauthorizedRegistryReadsDenied: 3, registryResetAndDeleteDenied: true, extraRegistryWriteDuringSlideDenied: true, registryUnchangedBySlide: true };
});
await record('I34', 'registry writes send only the new IDs and preserve old membership', async () => {
  const f = await fixture({ columns: 11 }); await start(f); await ingest(f); const before = structuredClone(f.registry), o = ingestion(f), writes = ingestWrites(f, o), last = writes[2];
  const payload = decode({ mapValue: { fields: last.update.fields } }); assert.equal(Object.keys(payload.usedIds).length, o.ids.length);
  assert.equal(last.updateMask.fieldPaths.filter(x => x.startsWith('usedIds.')).length, o.ids.length); assert(!last.updateMask.fieldPaths.includes('usedIds'));
  assert(Object.keys(o.registry.usedIds).length > Object.keys(payload.usedIds).length); await ingest(f, o);
  const stored = data(await get(f, 'idRegistry/current')); for (const id of Object.keys(before.usedIds)) assert.equal(stored.usedIds[id], true);
  await fill(f); await finish(f); await assertCounts(f);
  return { maskedRegistryFieldCount: o.ids.length, fullRegistryNotSent: true, oldMembershipPreserved: true };
});
await record('I35', 'unique seatId still requires a formal Seat record before production', async () => {
  const f = await fixture({ columns: 11 }); await start(f); const chunk = structuredClone(f.chunks[0]), newSeatId = randomUUID();
  chunk.value.cells[0].seatId = newSeatId; await ingest(f, ingestion(f, chunk)); await fill(f); await finish(f);
  assert.equal(f.head.nonEmptyCount, f.expected.nonEmptyCount); assert.equal(data(await get(f, 'idRegistry/current')).usedIds[newSeatId], true);
  const inconsistent = structuredClone(f.model); inconsistent.section.cells.find(c => c.cellId === chunk.value.cells[0].cellId).seatId = newSeatId;
  assert.throws(() => projectView(inconsistent, f.head, context), /invalid seat reference/);
  return { knownLimitation: 'the initialization of formal Seat records, numbering and line IDs is not validated by this identity proof', unknownSeatReferenceAcceptedByProof: true, projectionRejectsInvalidReference: true, productionAdoptionBlocked: true };
});
const endSourceHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)]))); assert.deepEqual(endSourceHashes, sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({ project, runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceHashes, endSourceHashes,
  scope: 'single-section cellId and seatId uniqueness registry with initial row/column counters and offsets; not formal Seat/line initialization, numbering, full edits, expansion, multiple sections, QR, SDK, IndexedDB, production receiver or devices', reports }, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);
