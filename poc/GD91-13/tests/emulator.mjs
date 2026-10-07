import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend, validate } from '../../GD91-07/planner.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { project as projectView, initialHead } from '../../GD91-10/projection.mjs';

const project = 'demo-concert-seat-gd91-13';
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
const relative = (f, suffix) => `seatContractShows/${f.show}/${suffix}`;
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
async function fixture({ axis = 'horizontal', order = 'forward', direction = 'right', rows = 4, columns = 4, large = false, empty = false, block = null, role = 'owner', chunkSize = 1 } = {}) {
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
  f.head = { ...f.expected, rowCounts: {}, columnCounts: {}, nonEmptyCount: 0, sourceRevision: 0, revision: 0, status: 'building', cursor: 0, lastChunk: '', controlRevision: 1, initializationId: randomUUID(), chunkSize };
  f.registry = { initializationId: f.head.initializationId, cursor: 0, usedIds: Object.fromEntries([f.head.sectionId, ...m.section.lineSettings.map(l => l.lineId)].map(id => [id, true])), usedNumbers: {} };
  f.chunks = [];
  for (let row = 0; row < m.section.rows; row++) for (let col = 0; col < m.section.columns; col += chunkSize) {
    const cells = m.section.cells.filter(c => c.row === row && c.column >= col && c.column < col + chunkSize).sort((a, b) => a.column - b.column)
      .map(c => ({ ...c, seatId: c.seatId ?? '', consumedNumber: c.consumedNumber ?? null }));
    const seats = cells.map(c => c.kind === 'seat' ? structuredClone(m.seats.find(s => s.seatId === c.seatId)) : null);
    const numberKeys = cells.map((c, i) => {
      const line = m.section.lineSettings[axis === 'horizontal' ? c.row : c.column];
      return ['seat', 'gap'].includes(c.kind) ? line.lineId + ':' + (seats[i]?.number ?? c.consumedNumber) : '';
    });
    f.chunks.push({ id: `${row}-${col}`, value: { row, startColumn: col, cells, cellIds: cells.map(c => c.cellId), seats, numberKeys } });
  }
  const writes = [update(f, 'control/current', { revision: 1, firstReceptionStartedAt: null }), update(f, 'roles/FAKE-manager', { active: true, role, revision: 1 }), update(f, 'roles/FAKE-reader', { active: true, role: 'receptionist', revision: 1 })];
  for (const [a, humanUid] of [[f.owner, 'FAKE-manager'], [f.other, 'FAKE-manager'], [f.reader, 'FAKE-reader']]) writes.push(
    update(f, `devices/${a.uid}`, { deviceUid: a.uid, humanUid, active: true, preparedRoleRevision: 1 }),
    update(f, `sessions/${a.uid}`, { humanUid, active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } }));
  writes.push(update(f, 'lineCatalog/current', { sectionId: m.section.sectionId, lines: Object.fromEntries(m.section.lineSettings.map(l => [l.index, l])), lineIds: m.section.lineSettings.map(l => l.lineId) }), ...m.section.lineSettings.map(l => update(f, `lines/${l.lineId}`, l)), update(f, 'seatReferences/current', { assignments: m.assignments, ticketRefs: m.ticketRefs, receptionRefs: m.receptionRefs }));
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
  const numbers = [...new Set(c.numberKeys.filter(Boolean))]; for (const key of numbers) registry.usedNumbers[key] = true;
  return { chunk, after, registry, ids, numbers };
}
function ingestWrites(f, o) {
  const keys = ['cursor', 'lastChunk', 'nonEmptyCount', 'rowCounts', 'columnCounts'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true), update(f, `chunks/${o.chunk.id}`, o.chunk.value, undefined, false),
    update(f, 'idRegistry/current', { cursor: o.registry.cursor, usedIds: Object.fromEntries(o.ids.map(id => [id, true])), usedNumbers: Object.fromEntries(o.numbers.map(key => [key, true])) }, ['cursor', ...o.ids.map(id => 'usedIds.`' + id + '`'), ...o.numbers.map(key => 'usedNumbers.`' + key + '`')], true)];
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
  const fetched = [], seats = [];
  for (const c of f.chunks) { const actual = data(await get(f, `chunks/${c.id}`)); assert.deepEqual(actual, c.value); fetched.push(...actual.cells); seats.push(...actual.seats.filter(Boolean)); }
  // 文書間のセル配列順は契約に含めない。IDで全件照合して比較元の順へ戻す。
  const byId = new Map(fetched.map(c => [c.cellId, c])); assert.equal(byId.size, f.model.section.cells.length);
  const restored = structuredClone(f.model); restored.section.cells = f.model.section.cells.map(expected => {
    const c = byId.get(expected.cellId); assert(c, 'missing cell identity');
    const result = { ...c }; if (result.seatId === '') delete result.seatId; if (result.consumedNumber === null) delete result.consumedNumber; return result;
  });
  const seatMap = new Map(seats.map(s => [s.seatId, s])); assert.equal(seatMap.size, f.model.seats.length);
  restored.seats = f.model.seats.map(s => { const found = seatMap.get(s.seatId); assert(found); return found; });
  const refs = data(await get(f, 'seatReferences/current')); for (const key of ['assignments', 'ticketRefs', 'receptionRefs']) restored[key] = refs[key];
  const catalog = data(await get(f, 'lineCatalog/current')); restored.section.lineSettings = Object.values(catalog.lines).sort((a, b) => a.index - b.index);
  assert.deepEqual(restored, f.model); validate(restored, context); return restored;
}
const resetCounts = f => { f.counts = { requests: 0, writes: 0, maxRequestBytes: 0 }; };
async function record(id, label, action) { const result = await action(); reports.push({ id, label, status: 'passed', ...result }); console.log(`${id}: CHECKED ${label}`); }
let index = 0;
for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) for (const direction of Object.keys(deltas)) {
  await record(`S${String(++index).padStart(2, '0')}`, 'automatic Seat records restore and offset sliding preserves all references', async () => {
    const f = await fixture({ axis, order, direction }); await initialize(f); const restored = await assertCounts(f);
    assert(!Object.hasOwn(data(await get(f, 'seatReferences/current')), 'seats'));
    const initialization = structuredClone(f.counts); resetCounts(f); await publishSlide(f);
    assert.deepEqual(projectView(restored, f.head, context), slide(f.model, { direction, amount: 1 }, context).after); await assertCounts(f);
    assert.equal(f.counts.requests, 1); assert.equal(f.counts.writes, 2);
    return { axis, order, direction, initialization, slide: f.counts, seatsCellsAndLedgersSeededByAdmin: false, trustedLineCatalogSeededByAdmin: true };
  });
}
await record('S17', 'missing or mismatched Seat records and field forgeries are denied', async () => {
  let variants = 0;
  for (const axis of ['horizontal', 'vertical']) {
    const f = await fixture({ axis, columns: 11 }); await start(f);
    const patches = [c => c.cells[0].seatId = randomUUID(), c => c.seats[0] = null, c => c.seats[0].seatId = randomUUID(),
      c => c.seats.push(c.seats[0]), c => c.seats[0].sectionId = randomUUID(), c => c.seats[0].lineId = randomUUID(),
      c => c.seats[0].lineId = f.model.section.lineSettings[axis === 'horizontal' ? 1 : 2].lineId,
      c => c.seats[0].numberingMode = 'manual', c => c.seats[0].prefix = 'forged-', c => c.seats[0].number = 0,
      c => c.seats[0].number = 999999, c => c.seats[0].category = 'invented', c => c.seats[0].usable = 'true',
      c => c.seats[0].reservedLabel = 0, c => c.seats[0].displayOrder = -1,
      c => c.seats[0].emergencyChange = { kind: 'add', reason: '   ' },
      c => c.seats[0].emergencyChange = { kind: 'swap', reason: 'FAKE' }, c => c.seats[0].extra = true,
      c => c.cells[0].consumedNumber = 1, c => c.numberKeys[0] = 'invented'];
    for (const patch of patches) { const chunk = structuredClone(f.chunks[0]); patch(chunk.value); await reject(f, ingestWrites(f, ingestion(f, chunk))); variants++; }
    await fill(f); await finish(f); await assertCounts(f);
  }
  return { previousGD12I35GapClosedForAutomaticSeats: true, forgedSeatVariantsDenied: variants };
});
await record('S18', 'non-seat records and duplicate number consumption are denied', async () => {
  const f = await fixture({ columns: 11 }); await start(f); await ingest(f);
  const next = structuredClone(f.chunks[1]); next.value.seats[0].number = f.chunks[0].value.seats[0].number; next.value.numberKeys[0] = f.chunks[0].value.numberKeys[0];
  await reject(f, ingestWrites(f, ingestion(f, next))); await ingest(f);
  while (f.head.cursor < 12) await ingest(f);
  const gap = structuredClone(f.chunks.find(c => c.value.row === 1 && c.value.startColumn === 1));
  const missing = structuredClone(gap); missing.value.cells[0].consumedNumber = null; await reject(f, ingestWrites(f, ingestion(f, missing)));
  const withSeat = structuredClone(gap); withSeat.value.seats[0] = f.chunks[0].value.seats[0]; await reject(f, ingestWrites(f, ingestion(f, withSeat)));
  const duplicate = structuredClone(gap), prior = f.chunks.find(c => c.value.row === 1 && c.value.startColumn === 0);
  duplicate.value.cells[0].consumedNumber = prior.value.seats[0].number; duplicate.value.numberKeys[0] = prior.value.numberKeys[0];
  await reject(f, ingestWrites(f, ingestion(f, duplicate))); await ingest(f);
  const space = structuredClone(f.chunks.find(c => c.value.row === 1 && c.value.startColumn === 2)); space.value.seats[0] = prior.value.seats[0];
  await reject(f, ingestWrites(f, ingestion(f, space))); await fill(f); await finish(f); await assertCounts(f);
  return { duplicateConsumptionVariantsDenied: 2, nonSeatAndGapForgeriesDenied: 3 };
});
await record('S19', 'source, summary and both ledgers are atomic and private', async () => {
  const f = await fixture({ columns: 11 }); const first = startWrites(f); await reject(f, [first[0]]); await reject(f, [first[1]]); await start(f);
  const o = ingestion(f), writes = ingestWrites(f, o); for (let bits = 1; bits < 7; bits++) await reject(f, writes.filter((_, i) => bits & (1 << i)));
  denied(await get(f, 'head/current', f.reader.token)); denied(await get(f, 'chunks/0-0', f.reader.token)); denied(await get(f, 'lineCatalog/current', f.reader.token));
  await ingest(f); const next = ingestion(f), normal = ingestWrites(f, next);
  for (const mode of ['missing', 'extra', 'changed', 'removed', 'false']) {
    const reg = structuredClone(next.registry), key = next.numbers[0], old = Object.keys(f.registry.usedNumbers)[0];
    if (mode === 'missing') delete reg.usedNumbers[key]; if (mode === 'extra') reg.usedNumbers.invented = true;
    if (mode === 'changed') reg.usedNumbers[old] = false; if (mode === 'removed') delete reg.usedNumbers[old]; if (mode === 'false') reg.usedNumbers[key] = false;
    const bad = structuredClone(normal); bad[2] = update(f, 'idRegistry/current', reg, undefined, true); await reject(f, bad);
  }
  for (const reusedId of [f.head.sectionId, f.model.section.lineSettings[0].lineId, f.chunks[0].value.cells[0].cellId, f.chunks[0].value.cells[0].seatId]) {
    const bad = structuredClone(next.chunk); bad.value.cells[0].cellId = reusedId; bad.value.cellIds[0] = reusedId; await reject(f, ingestWrites(f, ingestion(f, bad)));
  }
  await fill(f); const end = finishWrites(f, completion(f)); await reject(f, [end[0]]); await reject(f, [end[1]]); await finish(f); await assertCounts(f);
  denied(await get(f, 'idRegistry/current', f.reader.token)); ok(await get(f, 'chunks/0-0', f.reader.token));
  await reject(f, [update(f, 'chunks/0-0', f.chunks[0].value, undefined, true)]);
  return { partialThreeWriteSubsetsDenied: 6, initialAndFinalHalfWritesDenied: 4, ledgerForgeriesDenied: 5, identityReuseDenied: 4, privateDuringBuild: true };
});
await record('S20', 'saved progress, lost responses and racing requests preserve state', async () => {
  const f = await fixture({ columns: 11 }); await start(f); const o = ingestion(f); await ingest(f, o);
  await reject(f, ingestWrites(f, o), f.other.token); f.head = data(await get(f, 'head/current', f.owner.token)); f.registry = data(await get(f, 'idRegistry/current', f.owner.token));
  assert.deepEqual(data(await get(f, 'chunks/0-0', f.owner.token)), o.chunk.value);
  await fill(f); const end = completion(f); await finish(f, end); assert.deepEqual(data(await get(f, `events/${end.id}`, f.owner.token)), end.history); await reject(f, finishWrites(f, end)); await assertCounts(f);
  const stale = await fixture(); await start(stale); await fill(stale); await seed(stale, 'control/current', { revision: 2, firstReceptionStartedAt: null }); await reject(stale, finishWrites(stale, completion(stale)));
  return { progressResumed: true, duplicateChunkAndFinalCommitDenied: true, lostResponseQueryable: true, controlRevisionChecked: true, browserOutboxNotImplemented: true };
});
await record('S21', 'revoked devices and roles cannot initialize, continue or finish', async () => {
  for (const phase of ['start', 'ingest', 'finish']) for (const mutation of ['role', 'device', 'session', 'preparedRoleRevision']) {
    const f = await fixture(); if (phase !== 'start') await start(f); if (phase === 'finish') await fill(f);
    const writes = phase === 'start' ? startWrites(f) : phase === 'ingest' ? ingestWrites(f, ingestion(f)) : finishWrites(f, completion(f));
    if (mutation === 'role') await seed(f, 'roles/FAKE-manager', { active: true, role: 'receptionist', revision: 2 });
    if (mutation === 'device') await seed(f, `devices/${f.owner.uid}`, { deviceUid: f.owner.uid, humanUid: 'FAKE-manager', active: false, preparedRoleRevision: 1 });
    if (mutation === 'session') await seed(f, `sessions/${f.owner.uid}`, { humanUid: 'FAKE-manager', active: true, emailVerified: true, expiresAt: { $timestamp: '2000-01-01T00:00:00Z' } });
    if (mutation === 'preparedRoleRevision') await seed(f, 'roles/FAKE-manager', { active: true, role: 'owner', revision: 2 });
    await reject(f, writes);
  }
  const f = await fixture(), other = await fixture(); await reject(f, startWrites(f), f.reader.token); await reject(f, startWrites(f), other.owner.token); await reject(f, startWrites(f), null);
  const deputy = await fixture({ role: 'deputy' }); await initialize(deputy); await publishSlide(deputy);
  return { phaseRevocationsDenied: 12, readerCrossShowAnonymousDenied: true, deputyAllowed: true };
});
await record('S22', 'occupied boundaries and empty grids still refuse sliding', async () => {
  for (const direction of Object.keys(deltas)) for (const block of ['seat', 'gap', 'space', 'aisle']) { const f = await fixture({ direction, block }); await initialize(f); await assertCounts(f); await reject(f, slideWrites(f, movement(f))); }
  const empty = await fixture({ empty: true }); await initialize(empty); await assertCounts(empty); await reject(empty, slideWrites(empty, movement(empty)));
  return { blockedBoundaryVariants: 16, emptyGridSlideDenied: true };
});
await record('S23', 'trusted catalog binding, custom starts and Seat metadata are preserved', async () => {
  const f = await fixture({ columns: 11 });
  for (const line of f.model.section.lineSettings) { line.startNumber += 10; line.nextAutomaticNumber += 10; line.prefix = '架空列/'; }
  for (const s of f.model.seats) { s.number += 10; s.prefix = '架空列/'; s.category = 'reserved'; s.usable = false; s.reservedLabel = '架空確保'; s.displayOrder = 1; }
  for (const c of f.model.section.cells) if (c.kind === 'gap') c.consumedNumber += 10;
  for (const chunk of f.chunks) { const c = chunk.value.cells[0]; if (c.kind === 'gap') c.consumedNumber += 10; if (c.kind === 'seat') chunk.value.seats[0] = structuredClone(f.model.seats.find(s => s.seatId === c.seatId));
    if (chunk.value.numberKeys[0]) chunk.value.numberKeys[0] = f.model.section.lineSettings[c.row].lineId + ':' + (chunk.value.seats[0]?.number ?? c.consumedNumber); }
  const catalog = { sectionId: f.head.sectionId, lines: Object.fromEntries(f.model.section.lineSettings.map(l => [l.index, l])), lineIds: f.model.section.lineSettings.map(l => l.lineId) };
  await seed(f, 'lineCatalog/current', catalog); denied(await commit(f, [update(f, 'lineCatalog/current', catalog, undefined, true)]));
  await start(f); const missing = structuredClone(catalog); delete missing.lines['0']; await seed(f, 'lineCatalog/current', missing); await reject(f, ingestWrites(f, ingestion(f))); await seed(f, 'lineCatalog/current', catalog);
  await fill(f); await finish(f); await assertCounts(f); await publishSlide(f); await assertCounts(f);
  assert(!Object.hasOwn(data(await get(f, `events/${f.head.operationId}`)), 'reason'));
  return { customStartAndPrefix: true, reservedMetadataAndOldEmergencyReasonPreserved: true, catalogClientEditAndMissingLineDenied: true, slideReasonAbsent: true };
});
await record('S24', '930 source cells and 900 Seats restore before two-write sliding', async () => {
  const f = await fixture({ large: true }); await initialize(f); const restored = await assertCounts(f), initialization = structuredClone(f.counts);
  const ledger = data(await get(f, 'idRegistry/current')); assert.equal(Object.keys(ledger.usedIds).length, 1861); assert.equal(Object.keys(ledger.usedNumbers).length, 900);
  const registryJsonBytes = Buffer.byteLength(JSON.stringify(ledger)), headJsonBytes = Buffer.byteLength(JSON.stringify(f.head)); resetCounts(f); await publishSlide(f);
  assert.deepEqual(projectView(restored, f.head, context), slide(f.model, { direction: 'right', amount: 1 }, context).after); await assertCounts(f);
  assert.deepEqual(data(await get(f, 'idRegistry/current')), ledger); assert.equal(initialization.requests, 932); assert.equal(initialization.writes, 2794); assert.equal(f.counts.requests, 1); assert.equal(f.counts.writes, 2);
  return { cells: 930, seats: 900, chunks: 930, assignedReferences: 500, initialization, slide: f.counts, registryEntries: 1861, consumedNumberEntries: 900, registryJsonBytes, headJsonBytes, seatsCellsAndLedgersSeededByAdmin: false, prerequisiteAndVerificationIOExcluded: true };
});
await record('S25', 'trusted next-number data does not prove the initial numbering sequence', async () => {
  const f = await fixture({ columns: 11 }); await start(f);
  for (const [index, number] of [[0, 2], [1, 1]]) { const chunk = structuredClone(f.chunks[index]); chunk.value.seats[0].number = number; chunk.value.numberKeys[0] = chunk.value.seats[0].lineId + ':' + number; await ingest(f, ingestion(f, chunk)); }
  await fill(f); await finish(f); assert.equal(data(await get(f, 'chunks/0-0')).seats[0].number, 2); assert.equal(data(await get(f, 'chunks/0-1')).seats[0].number, 1);
  return { knownLimitation: 'trusted line catalog generation and automatic numbering order are not proven', uniqueInRangeButReorderedNumbersAccepted: true, productionAdoptionBlocked: true };
});
await record('S26', 'two, three and five rich cells reach the Rules expression limit atomically', async () => {
  const capacities = [];
  for (const chunkSize of [2, 3, 5]) {
    const f = await fixture({ columns: 11, chunkSize }); await start(f); const before = data(await get(f, 'head/current')), beforeIds = data(await get(f, 'idRegistry/current'));
    const r = await commit(f, ingestWrites(f, ingestion(f))); denied(r); assert.match(r.body.error.message, /maximum of 1000 expressions/);
    assert.deepEqual(data(await get(f, 'head/current')), before); assert.deepEqual(data(await get(f, 'idRegistry/current')), beforeIds); assert.equal((await get(f, 'chunks/0-0')).status, 404);
    capacities.push({ chunkSize, status: r.status, expressionLimit: true, noPartialWrite: true });
  }
  return { capacities, singleCellProofPassed: true, naiveSingleCellProductionAdoptionNotRecommended: true };
});
const endSourceHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)]))); assert.deepEqual(endSourceHashes, sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({ project, runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceHashes, endSourceHashes,
  scope: 'single-section automatic Seat records stored with cells, trusted line catalog correspondence, unique IDs and consumed numbers with initial counters and offsets; single-cell production storage not recommended; not catalog initialization or numbering sequence, manual seats, full edits, multiple sections, QR, SDK, IndexedDB, production receiver or devices', reports }, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);
