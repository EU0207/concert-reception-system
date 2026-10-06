import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const project = 'demo-concert-seat-gd91-04';
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const authBase = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const reports = [];
const encode = value => value === null ? { nullValue: null }
  : typeof value === 'boolean' ? { booleanValue: value }
  : typeof value === 'number' ? { integerValue: String(value) }
  : typeof value === 'string' ? { stringValue: value }
  : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
  : Object.hasOwn(value, '$timestamp') ? { timestampValue: value.$timestamp }
  : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
const decode = value => Object.hasOwn(value, 'nullValue') ? null
  : Object.hasOwn(value, 'integerValue') ? Number(value.integerValue)
  : Object.hasOwn(value, 'booleanValue') ? value.booleanValue
  : Object.hasOwn(value, 'stringValue') ? value.stringValue
  : Object.hasOwn(value, 'timestampValue') ? { $timestamp: value.timestampValue }
  : Object.hasOwn(value, 'arrayValue') ? (value.arrayValue.values ?? []).map(decode)
  : Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, decode(v)]));
const fields = value => encode(value).mapValue.fields;
const relative = (f, suffix) => `partitionShows/${f.show}/${suffix}`;
const name = (f, suffix) => `projects/${project}/databases/(default)/documents/${relative(f, suffix)}`;
async function request(url, token, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function actor() {
  const r = await request(`${authBase}/accounts:signUp?key=demo-api-key`, null, 'POST', { returnSecureToken: true });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(Buffer.from(r.body.idToken.split('.')[1], 'base64url')).aud, project);
  return { uid: r.body.localId, token: r.body.idToken };
}
async function seed(f, suffix, value) {
  const r = await request(`${base}/${relative(f, suffix)}`, 'owner', 'PATCH', { fields: fields(value) });
  assert.equal(r.status, 200);
}
async function get(f, suffix, token = 'owner') { return request(`${base}/${relative(f, suffix)}`, token); }
const data = r => decode({ mapValue: { fields: r.body.fields } });
const update = (f, suffix, value, mask, exists) => ({ update: { name: name(f, suffix), fields: fields(value) }, ...(mask ? { updateMask: { fieldPaths: mask } } : {}), ...(exists === undefined ? {} : { currentDocument: { exists } }) });
const commit = (f, writes, token = f.owner.token) => request(`${base}:commit`, token, 'POST', { writes });
async function fixture({ axis = 'horizontal', reverse = false, singleLine = false } = {}) {
  const f = { show: `FAKE-${randomUUID()}`, owner: await actor(), other: await actor(), reader: await actor(), cellIds: [], seatIds: [], lineIds: [] };
  for (const [a, humanUid] of [[f.owner, 'FAKE-manager'], [f.other, 'FAKE-manager'], [f.reader, 'FAKE-reader']]) {
    await seed(f, `devices/${a.uid}`, { deviceUid: a.uid, humanUid, active: true });
    await seed(f, `sessions/${a.uid}`, { humanUid, active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } });
  }
  await seed(f, 'roles/FAKE-manager', { role: 'owner', active: true });
  await seed(f, 'roles/FAKE-reader', { role: 'receptionist', active: true });
  const sectionId = randomUUID(), cells = {}, seats = {}, numberOwners = {}, lines = {};
  const sharedLine = randomUUID(); f.chunkIds = [];
  for (let line = 0; line < 30; line++) {
    const lineId = singleLine ? sharedLine : randomUUID(); f.lineIds.push(lineId); f.chunkIds.push(randomUUID()); lines[lineId] = { name: `L${line}`, nextAutomaticNumber: singleLine ? 661 : 23 };
    for (let index = 0; index < 30; index++) {
      const cellId = randomUUID(); f.cellIds.push(cellId);
      const seatId = index < 20 ? randomUUID() : '';
      const kind = seatId ? 'seat' : ['unset', 'space', 'aisle', 'gap'][(index - 20) % 4];
      const consumption = [...Array.from({ length: 20 }, (_, i) => i), 23, 27];
      const ordinal = consumption.indexOf(index);
      const number = ordinal < 0 ? null : (reverse ? 22 - ordinal : ordinal + 1) + (singleLine ? line * 22 : 0);
      cells[cellId] = { sectionId, lineId, row: singleLine ? 0 : axis === 'horizontal' ? line : index, column: singleLine ? line * 30 + index : axis === 'horizontal' ? index : line, kind, seatId, consumedNumber: kind === 'gap' ? number : null };
      if (seatId) {
        f.seatIds.push(seatId);
        const displayNumber = `L${singleLine ? 0 : line}-${number}`;
        seats[seatId] = { cellId, lineId, displayNumber, numberingMode: 'automatic', category: 'general', usable: true, reservedLabel: '', emergencyChange: null };
        numberOwners[`${lineId}|${displayNumber}`] = seatId;
      }
    }
  }
  f.chunks = {};
  for (let i = 0; i < 30; i++) {
    const chunkId = f.chunkIds[i], lineId = f.lineIds[i], cellIds = new Set(f.cellIds.slice(i * 30, i * 30 + 30));
    f.chunks[chunkId] = { revision: 1, operationId: '', sectionId, lineId, chunkId, nextAutomaticNumber: lines[lineId].nextAutomaticNumber,
      cells: Object.fromEntries(Object.entries(cells).filter(([c]) => cellIds.has(c))),
      seats: Object.fromEntries(Object.entries(seats).filter(([, s]) => cellIds.has(s.cellId))) };
    await seed(f, `chunks/${chunkId}`, f.chunks[chunkId]);
  }
  f.head = { revision: 1, operationId: '', chunkId: f.chunkIds[0], chunkIds: f.chunkIds, numberOwners, sectionId, rows: singleLine ? 1 : 30, columns: singleLine ? 900 : 30, axis, reverse, stagePosition: 'left' };
  selectChunk(f, 0);
  f.state = { revision: 0, operationId: '', catalogRevision: 1, controlRevision: 0, assignments: Object.fromEntries(f.seatIds.map((s, i) => [s, i < 500 ? randomUUID() : ''])) };
  await seed(f, 'head/current', f.head); await seed(f, 'assignmentState/current', f.state);
  await seed(f, 'control/current', { revision: 0, firstReceptionStartedAt: null });
  return f;
}
function selectChunk(f, index) { f.chunkId = f.chunkIds[index]; f.catalog = f.chunks[f.chunkId]; }
function changedPayload(before, after, maps) {
  const payload = {}, mask = [];
  for (const [key, value] of Object.entries(after)) {
    if (maps.includes(key)) {
      const keys = [...new Set([...Object.keys(before[key]), ...Object.keys(value)])].filter(k => JSON.stringify(before[key][k]) !== JSON.stringify(value[k]));
      if (keys.length) payload[key] = Object.fromEntries(keys.filter(k => Object.hasOwn(value, k)).map(k => [k, value[k]]));
      mask.push(...keys.map(k => `${key}.\`${k}\``));
    } else if (JSON.stringify(before[key]) !== JSON.stringify(value)) { payload[key] = value; mask.push(key); }
  }
  return { payload, mask };
}
function operation(f, { kind = 'add', seatId = randomUUID(), targetCell = f.cellIds[20], number = '追加-1', reason = 'FAKE: chair placement', actor = f.owner } = {}) {
  const op = randomUUID(), catalog = structuredClone(f.catalog), state = structuredClone(f.state), head = { ...structuredClone(f.head), revision: f.head.revision + 1, operationId: op, chunkId: f.chunkId };
  const old = f.catalog.seats[seatId] ?? null, sourceCell = old?.cellId ?? '';
  const marker = { kind, operationId: op, reason };
  let next;
  if (kind === 'add') {
    next = { cellId: targetCell, lineId: catalog.cells[targetCell].lineId, displayNumber: number, numberingMode: 'manual', category: 'general', usable: true, reservedLabel: '', emergencyChange: marker };
    catalog.cells[targetCell].kind = 'seat'; catalog.cells[targetCell].seatId = seatId;
    head.numberOwners[`${next.lineId}|${number}`] = seatId; state.assignments[seatId] = '';
  } else if (kind === 'renumber') {
    targetCell = sourceCell;
    next = { ...old, displayNumber: number, numberingMode: 'manual', emergencyChange: marker };
    delete head.numberOwners[`${old.lineId}|${old.displayNumber}`]; head.numberOwners[`${old.lineId}|${number}`] = seatId;
  } else {
    next = { ...old, cellId: targetCell, emergencyChange: marker };
    catalog.cells[sourceCell].kind = 'unset'; catalog.cells[sourceCell].seatId = '';
    catalog.cells[targetCell].kind = 'seat'; catalog.cells[targetCell].seatId = seatId;
  }
  catalog.seats[seatId] = next; catalog.revision++; catalog.operationId = op;
  state.revision++; state.catalogRevision = head.revision; state.operationId = op;
  const history = { kind, deviceUid: actor.uid, baseLayoutRevision: f.head.revision, layoutRevision: head.revision, chunkId: f.chunkId, baseRevision: f.catalog.revision, revision: catalog.revision, baseAssignmentRevision: f.state.revision, controlRevision: state.controlRevision,
    seatId, sourceCell, targetCell, reason, beforeSeat: old, afterSeat: next,
    beforeSource: sourceCell ? f.catalog.cells[sourceCell] : null, afterSource: sourceCell ? catalog.cells[sourceCell] : null,
    beforeTarget: f.catalog.cells[targetCell], afterTarget: catalog.cells[targetCell] };
  return { op, catalog, state, head, history: structuredClone(history) };
}
function writes(f, o, masked = true) {
  const c = changedPayload(f.catalog, o.catalog, ['cells', 'seats']);
  const s = changedPayload(f.state, o.state, ['assignments']);
  const h = changedPayload(f.head, o.head, ['numberOwners']);
  return [update(f, 'head/current', masked ? h.payload : o.head, masked ? h.mask : undefined), update(f, `chunks/${o.history.chunkId}`, masked ? c.payload : o.catalog, masked ? c.mask : undefined), update(f, 'assignmentState/current', masked ? s.payload : o.state, masked ? s.mask : undefined), update(f, `operations/${o.op}`, o.history, undefined, false)];
}
async function publish(f, o) {
  const result = await commit(f, writes(f, o)); assert.equal(result.status, 200, JSON.stringify(result.body));
  f.catalog = o.catalog; f.chunks[o.history.chunkId] = o.catalog; f.state = o.state; f.head = o.head; return result;
}
async function denied(f, o, token = f.owner.token, customWrites) {
  const paths = ['head/current', `chunks/${f.chunkId}`, 'assignmentState/current'];
  const before = await Promise.all(paths.map(async p => data(await get(f, p))));
  const result = await commit(f, customWrites ?? writes(f, o, false), token); assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.deepEqual(await Promise.all(paths.map(async p => data(await get(f, p)))), before);
  assert.equal((await get(f, `operations/${o.op}`)).status, 404);
}
async function record(id, label, fn) { const result = await fn(); reports.push({ id, label, ...result }); console.log(`${id}: CHECKED ${label}`); }
const emptySeat = f => f.seatIds[500];
const emptyCell = f => f.cellIds[25 * 30 + 20];
await record('GD91-C01', 'four kinds of addition update one chunk and preserve other chunks', async () => {
  const f = await fixture(), other = data(await get(f, `chunks/${f.chunkIds[1]}`)), assignments = structuredClone(f.state.assignments), cursor = f.catalog.nextAutomaticNumber, bytes = [];
  for (let i = 0; i < 4; i++) {
    const o = operation(f, { targetCell: f.cellIds[20 + i], number: `追加-${i + 1}` }); bytes.push(Buffer.byteLength(JSON.stringify({ writes: writes(f, o) }))); await publish(f, o);
  }
  assert.deepEqual(data(await get(f, `chunks/${f.chunkIds[1]}`)), other);
  assert.equal(f.catalog.nextAutomaticNumber, cursor); assert.equal(f.catalog.cells[f.cellIds[23]].consumedNumber, 21);
  assert.deepEqual(Object.fromEntries(Object.entries(f.state.assignments).filter(([s]) => Object.hasOwn(assignments, s))), assignments);
  return { chunks: 30, cellsPerChunk: 30, occupants: 500, requestsPerOperation: 1, writesPerOperation: 4, maskedRequestBytes: bytes, otherChunksAndExistingAssignmentsUnchanged: true };
});
await record('GD91-C02', 'unassigned renumber and move keep identity under global version', async () => {
  const f = await fixture(); selectChunk(f, 25); const s = emptySeat(f), assignments = structuredClone(f.state.assignments);
  await publish(f, operation(f, { kind: 'renumber', seatId: s, number: '追加-枝番' }));
  await publish(f, operation(f, { kind: 'move', seatId: s, targetCell: emptyCell(f) }));
  assert.equal(f.catalog.seats[s].cellId, emptyCell(f)); assert.deepEqual(f.state.assignments, assignments);
  assert.equal(f.head.revision, 3); return { sameIdentity: true, assignmentsUnchanged: true };
});
await record('GD91-C03', 'four linked documents reject every incomplete subset', async () => {
  const f = await fixture(), o = operation(f), w = writes(f, o);
  for (let bits = 1; bits < 15; bits++) await denied(f, o, f.owner.token, w.filter((_, i) => bits & (1 << i)));
  return { rejectedSubsets: 14, currentStateAndHistoryUnchanged: true };
});
await record('GD91-C04', 'another chunk extra history and unknown chunk cannot ride on valid head', async () => {
  const f = await fixture(), otherId = f.chunkIds[1], other = data(await get(f, `chunks/${otherId}`)), o = operation(f);
  await denied(f, o, f.owner.token, [...writes(f, o), update(f, `chunks/${otherId}`, { ...other, operationId: o.op, revision: other.revision + 1 })]);
  assert.deepEqual(data(await get(f, `chunks/${otherId}`)), other);
  await denied(f, o, f.owner.token, [...writes(f, o), update(f, `operations/${randomUUID()}`, o.history, undefined, false)]);
  const fake = operation(f); fake.head.chunkId = randomUUID(); await denied(f, fake);
  const list = operation(f); list.head.chunkIds = [...list.head.chunkIds, randomUUID()]; await denied(f, list);
  return { attacks: 4, arbitraryLinkedWritesDenied: true };
});
await record('GD91-C05', 'satellite writes cannot bypass reader revoked stopped expired or absent auth', async () => {
  const f = await fixture(), o = operation(f);
  await denied(f, o, null); await denied(f, o, f.reader.token);
  await seed(f, 'roles/FAKE-manager', { role: 'receptionist', active: true }); await denied(f, o);
  await seed(f, 'roles/FAKE-manager', { role: 'owner', active: true });
  const d = data(await get(f, `devices/${f.owner.uid}`)); await seed(f, `devices/${f.owner.uid}`, { ...d, active: false }); await denied(f, o); await seed(f, `devices/${f.owner.uid}`, d);
  const s = data(await get(f, `sessions/${f.owner.uid}`)); await seed(f, `sessions/${f.owner.uid}`, { ...s, expiresAt: { $timestamp: new Date(0).toISOString() } }); await denied(f, o);
  return { attacks: 5, headAuthorizationRequired: true };
});
await record('GD91-C06', 'duplicates and forged index automatic numbering or hidden changes are rejected', async () => {
  const f = await fixture(); await denied(f, operation(f, { number: 'L0-1' }));
  const attacks = [o => { o.head.numberOwners['FAKE|other'] = f.seatIds[0]; }, o => { o.catalog.nextAutomaticNumber++; }, o => { o.catalog.cells[f.cellIds[0]].row++; }, o => { o.catalog.seats[f.seatIds[1]].displayNumber = 'FAKE'; }, o => { o.catalog.seats[o.history.seatId].numberingMode = 'automatic'; o.history.afterSeat = structuredClone(o.catalog.seats[o.history.seatId]); }, o => { o.state.assignments[f.seatIds[0]] = ''; }, o => { o.state.assignments[o.history.seatId] = randomUUID(); }];
  for (const mutate of attacks) { const o = operation(f); mutate(o); await denied(f, o); }
  return { attacks: 8, atomicRejection: true };
});
await record('GD91-C07', 'global seat identity cannot be reused from a different chunk', async () => {
  const f = await fixture(); await denied(f, operation(f, { seatId: f.seatIds[500] }));
  await denied(f, operation(f, { targetCell: f.cellIds[0] }));
  return { attacks: 2, assignmentMapProtectsGlobalIdentity: true };
});
await record('GD91-C08', 'occupied seat cannot be changed or implicitly released', async () => {
  const f = await fixture(), s = f.seatIds[0];
  await denied(f, operation(f, { kind: 'renumber', seatId: s })); await denied(f, operation(f, { kind: 'move', seatId: s }));
  const o = operation(f, { kind: 'renumber', seatId: s }); o.state.assignments[s] = ''; await denied(f, o);
  return { attacks: 3, atomicRejection: true };
});
await record('GD91-C09', 'two simultaneous different chunks still have one global winner', async () => {
  const f = await fixture(), a = operation(f); selectChunk(f, 1); const b = operation(f, { targetCell: f.cellIds[50], actor: f.other });
  selectChunk(f, 0); const wa = writes(f, a); selectChunk(f, 1); const wb = writes(f, b);
  const results = await Promise.all([commit(f, wa), commit(f, wb, f.other.token)]); assert.deepEqual(results.map(r => r.status).sort(), [200, 403]);
  assert.equal(data(await get(f, 'head/current')).revision, 2); assert.equal(data(await get(f, 'assignmentState/current')).revision, 1);
  const revisions = await Promise.all(f.chunkIds.slice(0, 2).map(async id => data(await get(f, `chunks/${id}`)).revision)); assert.deepEqual(revisions.sort(), [1, 2]);
  return { statuses: results.map(r => r.status), globalConflictBoundary: true };
});
await record('GD91-C10', 'latest assignment control and stale head or chunk version reject edit', async () => {
  for (const source of ['assignment', 'control', 'head', 'chunk']) {
    const f = await fixture(); selectChunk(f, 25); const o = operation(f, { kind: 'renumber', seatId: emptySeat(f) });
    if (source === 'assignment') { const s = structuredClone(f.state); s.revision++; s.assignments[emptySeat(f)] = randomUUID(); await seed(f, 'assignmentState/current', s); }
    else if (source === 'control') await seed(f, 'control/current', { revision: 1, firstReceptionStartedAt: { $timestamp: new Date().toISOString() } });
    else if (source === 'head') await seed(f, 'head/current', { ...f.head, revision: f.head.revision + 1 });
    else await seed(f, `chunks/${f.chunkId}`, { ...f.catalog, revision: f.catalog.revision + 1 });
    await denied(f, o);
  }
  return { staleSources: 4, trustedSourceRacesOnly: true };
});
await record('GD91-C11', 'history reason marker and actual cells must agree', async () => {
  const f = await fixture();
  for (const reason of ['', ' ', '\n\t']) await denied(f, operation(f, { reason }));
  for (const mutate of [o => { o.history.beforeTarget.kind = 'seat'; }, o => { o.history.reason = 'FAKE altered'; }, o => { o.history.deviceUid = f.other.uid; }, o => { o.history.chunkId = f.lineIds[1]; }]) { const o = operation(f); mutate(o); await denied(f, o); }
  await publish(f, operation(f, { reason: 'FAKE: chair\nplacement' })); return { rejectedReasons: 3, forgedHistory: 4, multilineReasonAccepted: true };
});
await record('GD91-C12', 'reader sees current reason but cannot fetch actor history', async () => {
  const f = await fixture(), o = operation(f); await publish(f, o);
  const head = data(await get(f, 'head/current', f.reader.token)), chunk = data(await get(f, `chunks/${f.chunkId}`, f.reader.token));
  assert(!JSON.stringify([head, chunk]).includes(f.owner.uid)); assert.equal(chunk.seats[o.history.seatId].emergencyChange.reason, o.history.reason);
  assert.equal((await get(f, `operations/${o.op}`, f.reader.token)).status, 403);
  return { currentReasonVisible: true, actorHistoryDenied: true, fullDeltaDeliveryNotTested: true };
});
await record('GD91-C13', 'same displayed number can exist in different chunks without collision', async () => {
  const f = await fixture(), a = operation(f, { number: '自由-枝番' }); await publish(f, a); selectChunk(f, 1);
  const b = operation(f, { targetCell: f.cellIds[50], number: '自由-枝番' }); await publish(f, b);
  assert.equal(f.head.numberOwners[`${f.lineIds[0]}|自由-枝番`], a.history.seatId);
  assert.equal(f.head.numberOwners[`${f.lineIds[1]}|自由-枝番`], b.history.seatId);
  return { uniquenessScopedToLine: true };
});
await record('GD91-C14', 'reply loss uses immutable history and later direct replay cannot use previous head', async () => {
  const f = await fixture(), o = operation(f), original = writes(f, o); await publish(f, o);
  assert.deepEqual(data(await get(f, `operations/${o.op}`, f.owner.token)), o.history);
  assert.equal((await commit(f, original)).status, 403);
  for (const write of original.slice(1)) assert.equal((await commit(f, [write])).status, 403);
  assert.equal(data(await get(f, 'head/current')).revision, 2); return { replayAndOrphanAfterPreviousCommitDenied: true, sdkAndLocalRestartNotTested: true };
});
await record('GD91-C15', 'performance isolation applies to head and every satellite write', async () => {
  const a = await fixture(), b = await fixture(), o = operation(b, { actor: a.owner }); await denied(b, o, a.owner.token);
  assert.equal((await get(b, 'head/current', a.owner.token)).status, 403); assert.equal((await get(b, `chunks/${b.chunkId}`, a.owner.token)).status, 403); return { crossPerformanceDenied: true };
});
await record('GD91-C16', 'horizontal vertical forward and reverse partitions preserve cursor and coordinates', async () => {
  for (const axis of ['horizontal', 'vertical']) for (const reverse of [false, true]) {
    const f = await fixture({ axis, reverse }), before = structuredClone(f.catalog), o = operation(f); await publish(f, o);
    assert.equal(f.catalog.nextAutomaticNumber, before.nextAutomaticNumber);
    for (const [id, c] of Object.entries(before.cells)) { assert.equal(f.catalog.cells[id].row, c.row); assert.equal(f.catalog.cells[id].column, c.column); assert.equal(f.catalog.cells[id].consumedNumber, c.consumedNumber); }
  }
  return { profiles: 4, gridExpansionAndAutomaticNumberingNotTested: true };
});
await record('GD91-C17', 'one long line split into chunks rejects duplicate in a different chunk', async () => {
  const f = await fixture({ singleLine: true }), o = operation(f); await publish(f, o);
  selectChunk(f, 1); await denied(f, operation(f, { targetCell: f.cellIds[50], number: o.history.afterSeat.displayNumber }));
  await publish(f, operation(f, { targetCell: f.cellIds[50], number: '長列-枝番' }));
  return { cellsInOneLine: 900, chunks: 30, crossChunkDuplicateDenied: true };
});
await record('GD91-C18', 'occupied reserved fields cannot be changed and released chunk cannot bypass head', async () => {
  const f = await fixture(); selectChunk(f, 25); const s = emptySeat(f);
  f.catalog.seats[s].category = 'reserved'; f.catalog.seats[s].usable = false; f.catalog.seats[s].reservedLabel = 'FAKE reserved'; await seed(f, `chunks/${f.chunkId}`, f.catalog);
  const o = operation(f, { kind: 'renumber', seatId: s, number: '確保-臨' }); o.catalog.seats[s].category = 'general'; o.history.afterSeat = structuredClone(o.catalog.seats[s]); await denied(f, o);
  await publish(f, operation(f, { kind: 'renumber', seatId: s, number: '確保-臨' })); assert.equal(f.catalog.seats[s].category, 'reserved');
  return { reservedCategoryAndAvailabilityRetained: true };
});
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const hashes = {};
for (const file of ['../firestore.rules', '../firebase.json', 'emulator.mjs']) hashes[file] = createHash('sha256').update((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({ project, runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceSha256: hashes, scope: 'single existing-cell edit in one preseeded 30-cell group with global number index; not production acceptance or integrated assignment Rules', callsWithoutCache: { head: 9, chunk: 2, assignmentState: 2, history: 2, commit: 15 }, reports }, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);
