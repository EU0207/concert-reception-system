import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend } from '../../GD91-07/planner.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { project as projectView, initialHead } from '../../GD91-10/projection.mjs';

const project = 'demo-concert-seat-gd91-11';
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
const relative = (f, suffix) => `initialShows/${f.show}/${suffix}`;
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
async function start(f) { ok(await commit(f, [update(f, 'head/current', f.head, undefined, false)])); }
function ingestion(f, chunk = f.chunks.find(c => c.value.row * f.head.columns + c.value.startColumn === f.head.cursor)) {
  assert(chunk); const after = structuredClone(f.head), c = chunk.value;
  after.cursor += c.cells.length; after.lastChunk = chunk.id;
  for (const cell of c.cells) {
    const delta = Number(cell.kind !== 'unset'); after.nonEmptyCount += delta;
    after.rowCounts[cell.row] = (after.rowCounts[cell.row] ?? 0) + delta;
    after.columnCounts[cell.column] = (after.columnCounts[cell.column] ?? 0) + delta;
  }
  return { chunk, after };
}
function ingestWrites(f, o) {
  const keys = ['cursor', 'lastChunk', 'nonEmptyCount', 'rowCounts', 'columnCounts'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true), update(f, `chunks/${o.chunk.id}`, o.chunk.value, undefined, false)];
}
async function ingest(f, o = ingestion(f)) { ok(await commit(f, ingestWrites(f, o))); f.head = o.after; }
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
  const before = await get(f, 'head/current'); denied(await commit(f, writes, token)); const after = await get(f, 'head/current');
  assert.equal(after.status, before.status); if (before.status === 200) assert.deepEqual(data(after), data(before));
}
async function assertCounts(f) {
  const h = data(await get(f, 'head/current'));
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
    await reject(f, [update(f, 'head/current', { ...f.head, ...patch }, undefined, false)]);
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
  await reject(f, ingestWrites(f, o)); f.head = stored; await fill(f); const finishOp = completion(f); await finish(f, finishOp);
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
    const writes = phase === 'start' ? [update(f, 'head/current', f.head, undefined, false)] : phase === 'ingest' ? ingestWrites(f, ingestion(f)) : finishWrites(f, completion(f));
    if (mutation === 'role') await seed(f, 'roles/FAKE-manager', { active: true, role: 'receptionist', revision: 2 });
    if (mutation === 'device') await seed(f, `devices/${f.owner.uid}`, { deviceUid: f.owner.uid, humanUid: 'FAKE-manager', active: false, preparedRoleRevision: 1 });
    if (mutation === 'session') await seed(f, `sessions/${f.owner.uid}`, { humanUid: 'FAKE-manager', active: true, emailVerified: true, expiresAt: { $timestamp: '2000-01-01T00:00:00Z' } });
    if (mutation === 'preparedRoleRevision') await seed(f, 'roles/FAKE-manager', { active: true, role: 'owner', revision: 2 });
    await reject(f, writes);
  }
  const f = await fixture(), other = await fixture(); await reject(f, [update(f, 'head/current', f.head, undefined, false)], f.reader.token);
  await reject(f, [update(f, 'head/current', f.head, undefined, false)], other.owner.token); await reject(f, [update(f, 'head/current', f.head, undefined, false)], null);
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
  resetCounts(f); const beforeChunks = structuredClone(f.chunks); await publishSlide(f); assert.deepEqual(f.chunks, beforeChunks);
  assert.deepEqual(projectView(restored, f.head, context), slide(f.model, { direction: 'right', amount: 1 }, context).after); await assertCounts(f);
  assert.equal(f.counts.requests, 1); assert.equal(f.counts.writes, 2); assert.equal(initialization.requests, 212); assert.equal(initialization.writes, 423);
  assert.equal(restored.seats.length, 900); assert.equal(restored.assignments.length, 500);
  return { cells: 930, seats: 900, chunks: 210, assignedReferences: 500, initialization, slide: f.counts, countsAndSourcesSeededByAdmin: false, prerequisiteAndVerificationIOExcluded: true };
});
await record('I27', 'committed source and counts cannot be edited through initialization paths', async () => {
  const f = await fixture(); await initialize(f); const c = f.chunks[0];
  for (const kind of ['unset', 'seat', 'gap', 'space', 'aisle']) { const value = structuredClone(c.value); value.cells[0].kind = kind; await reject(f, [update(f, `chunks/${c.id}`, value, undefined, true)]); }
  await reject(f, [update(f, 'head/current', { ...f.head, rowCounts: {}, columnCounts: {}, nonEmptyCount: 0 }, undefined, true)]);
  denied(await commit(f, [{ delete: name(f, `chunks/${c.id}`) }])); await reject(f, [update(f, 'head/current', { ...f.head, status: 'building', cursor: 0 }, undefined, true)]);
  await publishSlide(f); assert(!Object.hasOwn(data(await get(f, `events/${f.head.operationId}`, f.owner.token)), 'reason')); await assertCounts(f);
  return { sourceAndCounterResetDenied: true, allEditKindsRequireSeparateIntegration: true, slideReasonAbsent: true };
});
await record('I28', 'cross-chunk identity and numbering remain explicitly outside count proof', async () => {
  const f = await fixture({ columns: 11 }); await start(f); await ingest(f); const o = ingestion(f), sameId = f.chunks[0].value.cells[0].cellId;
  o.chunk.value.cells[0].cellId = sameId; o.chunk.value.cellIds[0] = sameId; await ingest(f, o); await fill(f); await finish(f);
  assert.equal(f.head.nonEmptyCount, f.expected.nonEmptyCount);
  assert.equal(data(await get(f, `chunks/${o.chunk.id}`)).cells[0].cellId, sameId);
  return { knownLimitation: 'cross-chunk cellId uniqueness, seatId identity and numbering are not validated; countReady is not production approval', countInvariantStillTrue: true, productionAdoptionBlocked: true };
});
const endSourceHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)]))); assert.deepEqual(endSourceHashes, sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({ project, runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceHashes, endSourceHashes,
  scope: 'untrusted initialization of row/column counts from up-to-5-cell chunks and connection to offsets; not cross-chunk IDs, seat numbering, full initialization, edits, expansion, production receiver, QR, SDK, IndexedDB or devices', reports }, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);
