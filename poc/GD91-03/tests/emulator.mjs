import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const project = 'demo-concert-seat-gd91-03';
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
const relative = (f, suffix) => `layoutShows/${f.show}/${suffix}`;
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
async function fixture({ axis = 'horizontal', reverse = false } = {}) {
  const f = { show: `FAKE-${randomUUID()}`, owner: await actor(), other: await actor(), reader: await actor(), cellIds: [], seatIds: [], lineIds: [] };
  for (const [a, humanUid] of [[f.owner, 'FAKE-manager'], [f.other, 'FAKE-manager'], [f.reader, 'FAKE-reader']]) {
    await seed(f, `devices/${a.uid}`, { deviceUid: a.uid, humanUid, active: true });
    await seed(f, `sessions/${a.uid}`, { humanUid, active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } });
  }
  await seed(f, 'roles/FAKE-manager', { role: 'owner', active: true });
  await seed(f, 'roles/FAKE-reader', { role: 'receptionist', active: true });
  const sectionId = randomUUID(), cells = {}, seats = {}, numberOwners = {}, lines = {};
  for (let line = 0; line < 30; line++) {
    const lineId = randomUUID(); f.lineIds.push(lineId); lines[lineId] = { name: `L${line}`, nextAutomaticNumber: 23 };
    for (let index = 0; index < 30; index++) {
      const cellId = randomUUID(); f.cellIds.push(cellId);
      const seatId = index < 20 ? randomUUID() : '';
      const kind = seatId ? 'seat' : ['unset', 'space', 'aisle', 'gap'][(index - 20) % 4];
      const consumption = [...Array.from({ length: 20 }, (_, i) => i), 23, 27];
      const ordinal = consumption.indexOf(index);
      const number = ordinal < 0 ? null : reverse ? 22 - ordinal : ordinal + 1;
      cells[cellId] = { sectionId, lineId, row: axis === 'horizontal' ? line : index, column: axis === 'horizontal' ? index : line, kind, seatId, consumedNumber: kind === 'gap' ? number : null };
      if (seatId) {
        f.seatIds.push(seatId);
        seats[seatId] = { cellId, lineId, displayNumber: `L${line}-${number}`, numberingMode: 'automatic', category: 'general', usable: true, reservedLabel: '', emergencyChange: null };
        numberOwners[`${lineId}|L${line}-${number}`] = seatId;
      }
    }
  }
  f.catalog = { revision: 1, operationId: '', sectionId, rows: 30, columns: 30, axis, reverse, stagePosition: 'left', lines, cells, seats, numberOwners };
  f.state = { revision: 0, operationId: '', catalogRevision: 1, controlRevision: 0, assignments: Object.fromEntries(f.seatIds.map((s, i) => [s, i < 500 ? randomUUID() : ''])) };
  await seed(f, 'catalog/current', f.catalog); await seed(f, 'assignmentState/current', f.state);
  await seed(f, 'control/current', { revision: 0, firstReceptionStartedAt: null });
  return f;
}
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
  const op = randomUUID(), catalog = structuredClone(f.catalog), state = structuredClone(f.state);
  const old = f.catalog.seats[seatId] ?? null, sourceCell = old?.cellId ?? '';
  const marker = { kind, operationId: op, reason };
  let next;
  if (kind === 'add') {
    next = { cellId: targetCell, lineId: catalog.cells[targetCell].lineId, displayNumber: number, numberingMode: 'manual', category: 'general', usable: true, reservedLabel: '', emergencyChange: marker };
    catalog.cells[targetCell].kind = 'seat'; catalog.cells[targetCell].seatId = seatId;
    catalog.numberOwners[`${next.lineId}|${number}`] = seatId; state.assignments[seatId] = '';
  } else if (kind === 'renumber') {
    targetCell = sourceCell;
    next = { ...old, displayNumber: number, numberingMode: 'manual', emergencyChange: marker };
    delete catalog.numberOwners[`${old.lineId}|${old.displayNumber}`]; catalog.numberOwners[`${old.lineId}|${number}`] = seatId;
  } else {
    next = { ...old, cellId: targetCell, emergencyChange: marker };
    catalog.cells[sourceCell].kind = 'unset'; catalog.cells[sourceCell].seatId = '';
    catalog.cells[targetCell].kind = 'seat'; catalog.cells[targetCell].seatId = seatId;
  }
  catalog.seats[seatId] = next; catalog.revision++; catalog.operationId = op;
  state.revision++; state.catalogRevision = catalog.revision; state.operationId = op;
  const history = { kind, deviceUid: actor.uid, baseRevision: f.catalog.revision, revision: catalog.revision, baseAssignmentRevision: f.state.revision, controlRevision: state.controlRevision,
    seatId, sourceCell, targetCell, reason, beforeSeat: old, afterSeat: next,
    beforeSource: sourceCell ? f.catalog.cells[sourceCell] : null, afterSource: sourceCell ? catalog.cells[sourceCell] : null,
    beforeTarget: f.catalog.cells[targetCell], afterTarget: catalog.cells[targetCell] };
  return { op, catalog, state, history: structuredClone(history) };
}
function writes(f, o, masked = true) {
  const c = changedPayload(f.catalog, o.catalog, ['cells', 'seats', 'numberOwners']);
  const s = changedPayload(f.state, o.state, ['assignments']);
  return [update(f, 'catalog/current', masked ? c.payload : o.catalog, masked ? c.mask : undefined), update(f, 'assignmentState/current', masked ? s.payload : o.state, masked ? s.mask : undefined), update(f, `operations/${o.op}`, o.history, undefined, false)];
}
async function publish(f, o) {
  const result = await commit(f, writes(f, o)); assert.equal(result.status, 200, JSON.stringify(result.body));
  f.catalog = o.catalog; f.state = o.state; return result;
}
async function denied(f, o, token = f.owner.token, customWrites) {
  const before = [data(await get(f, 'catalog/current')), data(await get(f, 'assignmentState/current'))];
  const result = await commit(f, customWrites ?? writes(f, o, false), token); assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.deepEqual([data(await get(f, 'catalog/current')), data(await get(f, 'assignmentState/current'))], before);
  assert.equal((await get(f, `operations/${o.op}`)).status, 404);
}
async function record(id, label, fn) { const result = await fn(); reports.push({ id, label, ...result }); console.log(`${id}: CHECKED ${label}`); }
const emptySeat = f => f.seatIds[500];
const emptyCell = f => f.cellIds[25 * 30 + 20];

await record('GD91-L01', 'four non-seat kinds become manual seats without renumbering', async () => {
  const f = await fixture(), assignments = structuredClone(f.state.assignments), lines = structuredClone(f.catalog.lines);
  const consumed = f.catalog.cells[f.cellIds[23]].consumedNumber;
  const bytes = [];
  for (let i = 0; i < 4; i++) {
    const o = operation(f, { targetCell: f.cellIds[20 + i], number: `追加-${i + 1}` }); bytes.push(Buffer.byteLength(JSON.stringify({ writes: writes(f, o) })));
    await publish(f, o);
  }
  assert.deepEqual(f.catalog.lines, lines); assert.deepEqual(Object.fromEntries(Object.entries(f.state.assignments).filter(([s]) => Object.hasOwn(assignments, s))), assignments);
  assert.equal(f.catalog.cells[f.cellIds[23]].consumedNumber, consumed);
  return { cells: 900, initialSeats: 600, occupants: 500, addedSeats: 4, requestsPerOperation: 1, writesPerOperation: 3, maskedRequestBytes: bytes, unchangedCursorAndExistingAssignments: true };
});
await record('GD91-L02', 'unassigned renumber and move retain seat identity and protected fields', async () => {
  const f = await fixture(), s = emptySeat(f), original = structuredClone(f.catalog.seats[s]), assignments = structuredClone(f.state.assignments);
  await publish(f, operation(f, { kind: 'renumber', seatId: s, number: 'A-2-臨' }));
  await publish(f, operation(f, { kind: 'move', seatId: s, targetCell: emptyCell(f) }));
  assert.equal(f.catalog.seats[s].cellId, emptyCell(f)); assert.equal(f.catalog.seats[s].displayNumber, 'A-2-臨');
  assert.equal(f.catalog.seats[s].category, original.category); assert.deepEqual(f.state.assignments, assignments);
  return { identityRetained: true, latestMarker: 'move', assignmentsUnchanged: true };
});
await record('GD91-L03', 'duplicate displayed number including automatic seats is rejected', async () => {
  const f = await fixture();
  await denied(f, operation(f, { number: 'L0-1' }));
  const s = emptySeat(f); await denied(f, operation(f, { kind: 'renumber', seatId: s, number: 'L25-2' }));
  return { attacks: 2, atomicRejection: true };
});
await record('GD91-L04', 'occupied seat cannot be renumbered moved or implicitly released', async () => {
  const f = await fixture(), s = f.seatIds[0];
  await denied(f, operation(f, { kind: 'renumber', seatId: s }));
  await denied(f, operation(f, { kind: 'move', seatId: s }));
  const o = operation(f, { kind: 'renumber', seatId: s }); o.state.assignments[s] = ''; await denied(f, o);
  return { attacks: 3, atomicRejection: true };
});
await record('GD91-L05', 'occupied destination existing seat and cross-line move are rejected', async () => {
  const f = await fixture();
  await denied(f, operation(f, { targetCell: f.cellIds[0] }));
  await denied(f, operation(f, { seatId: f.seatIds[0] }));
  await denied(f, operation(f, { kind: 'move', seatId: emptySeat(f), targetCell: f.cellIds[0] }));
  await denied(f, operation(f, { kind: 'move', seatId: emptySeat(f), targetCell: f.cellIds[20] }));
  return { attacks: 4, crossLineMoveOutsideProof: true };
});
await record('GD91-L06', 'hidden cell seat number index line and grid edits are rejected', async () => {
  const f = await fixture();
  const attacks = [o => { o.catalog.cells[f.cellIds[1]].kind = 'gap'; }, o => { o.catalog.seats[f.seatIds[1]].displayNumber = 'FAKE'; }, o => { o.catalog.numberOwners['FAKE|unknown'] = f.seatIds[0]; }, o => { o.catalog.lines[f.lineIds[0]].nextAutomaticNumber++; }, o => { o.catalog.rows++; }, o => { o.catalog.stagePosition = 'top'; }, o => { o.catalog.cells[o.history.targetCell].row++; }, o => { delete o.catalog.cells[f.cellIds[899]]; }];
  for (const mutate of attacks) { const o = operation(f); mutate(o); await denied(f, o); }
  return { attacks: attacks.length, atomicRejection: true };
});
await record('GD91-L07', 'reserved unusable fields and existing number mode cannot be silently changed', async () => {
  const f = await fixture(), s = emptySeat(f);
  const special = { ...f.catalog.seats[s], category: 'reserved', usable: false, reservedLabel: 'FAKE: orchestra' };
  f.catalog.seats[s] = special; await seed(f, 'catalog/current', f.catalog);
  for (const key of ['category', 'usable', 'reservedLabel']) {
    const o = operation(f, { kind: 'renumber', seatId: s }); o.catalog.seats[s][key] = key === 'usable' ? true : ''; o.history.afterSeat = o.catalog.seats[s]; await denied(f, o);
  }
  await publish(f, operation(f, { kind: 'renumber', seatId: s, number: '確保-臨' }));
  assert.equal(f.catalog.seats[s].category, 'reserved'); assert.equal(f.catalog.seats[s].usable, false);
  return { attacks: 3, categoryAndAvailabilityRetained: true };
});
await record('GD91-L08', 'reason marker and history must match actual before and after cells', async () => {
  const f = await fixture();
  for (const reason of ['', '  ', '\n\t']) await denied(f, operation(f, { reason }));
  const attacks = [o => { o.history.reason = 'FAKE mismatch'; }, o => { o.history.beforeTarget.kind = 'seat'; }, o => { o.history.afterTarget.seatId = 'FAKE'; }, o => { o.history.beforeSeat = {}; }, o => { o.catalog.seats[o.history.seatId].emergencyChange.kind = 'renumber'; }];
  for (const mutate of attacks) { const o = operation(f); mutate(o); await denied(f, o); }
  await publish(f, operation(f, { reason: 'FAKE: chair\nplacement' }));
  return { blankReasons: 3, forgedHistories: 5, multilineReasonAccepted: true };
});
await record('GD91-L09', 'missing orphan and partial commits cannot change any current state', async () => {
  const f = await fixture(), o = operation(f), w = writes(f, o);
  for (const subset of [[w[0]], [w[1]], [w[2]], [w[0], w[1]], [w[0], w[2]], [w[1], w[2]]]) await denied(f, o, f.owner.token, subset);
  return { attacks: 6, atomicRejection: true };
});
await record('GD91-L10', 'parallel edits on different cells have one winner', async () => {
  const f = await fixture(), a = operation(f), b = operation(f, { targetCell: f.cellIds[21], number: '追加-2', actor: f.other });
  const results = await Promise.all([commit(f, writes(f, a)), commit(f, writes(f, b), f.other.token)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 403]);
  assert.equal(data(await get(f, 'catalog/current')).revision, 2); assert.equal(data(await get(f, 'assignmentState/current')).revision, 1);
  return { statuses: results.map(r => r.status), globalConflictBoundary: true };
});
await record('GD91-L11', 'assignment and performance changes after confirmation invalidate edit', async () => {
  for (const source of ['assignment', 'control']) {
    const f = await fixture(), o = operation(f, { kind: 'renumber', seatId: emptySeat(f) });
    // 前提版の競合を管理経路で再現。GD91-02との合同Rulesは未検証。
    if (source === 'assignment') { const state = structuredClone(f.state); state.revision++; state.assignments[emptySeat(f)] = randomUUID(); await seed(f, 'assignmentState/current', state); }
    else await seed(f, 'control/current', { revision: 1, firstReceptionStartedAt: { $timestamp: new Date().toISOString() } });
    await denied(f, o);
  }
  return { racedSources: 2, staleRequestDenied: true };
});
await record('GD91-L12', 'reader revoked stopped expired and unauthenticated writes are denied', async () => {
  const f = await fixture(), o = operation(f);
  await denied(f, o, null); await denied(f, o, f.reader.token);
  await seed(f, 'roles/FAKE-manager', { role: 'receptionist', active: true }); await denied(f, o);
  await seed(f, 'roles/FAKE-manager', { role: 'owner', active: true });
  const d = data(await get(f, `devices/${f.owner.uid}`)); await seed(f, `devices/${f.owner.uid}`, { ...d, active: false }); await denied(f, o); await seed(f, `devices/${f.owner.uid}`, d);
  const s = data(await get(f, `sessions/${f.owner.uid}`)); await seed(f, `sessions/${f.owner.uid}`, { ...s, expiresAt: { $timestamp: new Date(0).toISOString() } }); await denied(f, o);
  return { attacks: 5, atomicRejection: true };
});
await record('GD91-L13', 'reception reader gets latest reason but no actor or past history', async () => {
  const f = await fixture(), o = operation(f); await publish(f, o);
  const catalog = data(await get(f, 'catalog/current', f.reader.token));
  assert.deepEqual(catalog.seats[o.history.seatId].emergencyChange, { kind: 'add', operationId: o.op, reason: o.history.reason });
  assert(!JSON.stringify(catalog).includes(f.owner.uid)); assert.equal((await get(f, `operations/${o.op}`, f.reader.token)).status, 403);
  return { currentReasonVisible: true, actorAndHistoryDenied: true, deltaDeliveryNotTested: true };
});
await record('GD91-L14', 'horizontal vertical and reverse profiles preserve coordinates and cursor', async () => {
  for (const axis of ['horizontal', 'vertical']) for (const reverse of [false, true]) {
    const f = await fixture({ axis, reverse }), coordinates = Object.fromEntries(Object.entries(f.catalog.cells).map(([id, c]) => [id, [c.row, c.column, c.consumedNumber]])), lines = structuredClone(f.catalog.lines);
    await publish(f, operation(f)); assert.deepEqual(f.catalog.lines, lines);
    assert.deepEqual(Object.fromEntries(Object.entries(f.catalog.cells).map(([id, c]) => [id, [c.row, c.column, c.consumedNumber]])), coordinates);
  }
  return { profiles: 4, automaticNumberingAndGridExpansionNotTested: true };
});
await record('GD91-L15', 'same operation result can be queried and immutable history rejects replay', async () => {
  const f = await fixture(), o = operation(f), originalWrites = writes(f, o); await publish(f, o);
  assert.deepEqual(data(await get(f, `operations/${o.op}`, f.owner.token)), o.history);
  const replay = await commit(f, originalWrites); assert.equal(replay.status, 403);
  assert.equal(f.catalog.revision, data(await get(f, 'catalog/current')).revision);
  assert.equal((await commit(f, [update(f, `operations/${o.op}`, { ...o.history, reason: 'FAKE alteration' })])).status, 403);
  return { resultQueryAccepted: true, replayAndHistoryRewriteDenied: true, actualSdkAndRestartNotTested: true };
});
await record('GD91-L16', 'another performance cannot be read or edited', async () => {
  const a = await fixture(), b = await fixture(), o = operation(b, { actor: a.owner }); await denied(b, o, a.owner.token);
  assert.equal((await get(b, 'catalog/current', a.owner.token)).status, 403); return { crossPerformanceDenied: true };
});
await record('GD91-L17', 'manual addition cannot forge automatic mode index or occupancy', async () => {
  const f = await fixture();
  const attacks = [
    o => { o.catalog.seats[o.history.seatId].numberingMode = 'automatic'; o.history.afterSeat = structuredClone(o.catalog.seats[o.history.seatId]); },
    o => { delete o.catalog.numberOwners[`${o.history.afterSeat.lineId}|${o.history.afterSeat.displayNumber}`]; },
    o => { o.catalog.numberOwners[`${o.history.afterSeat.lineId}|${o.history.afterSeat.displayNumber}`] = f.seatIds[0]; },
    o => { o.state.assignments[o.history.seatId] = f.state.assignments[f.seatIds[0]]; },
    o => { o.catalog.cells[o.history.targetCell].consumedNumber = 99; o.history.afterTarget = structuredClone(o.catalog.cells[o.history.targetCell]); }
  ];
  for (const mutate of attacks) { const o = operation(f, { targetCell: f.cellIds[23] }); mutate(o); await denied(f, o); }
  for (const number of ['', '  ', 'A\nB', 'A'.repeat(65)]) await denied(f, operation(f, { number }));
  return { forgedAdditions: 5, invalidNumbers: 4, inputLimitsAreProofOnly: true };
});
await record('GD91-L18', 'equal displayed numbers on different lines remain distinct', async () => {
  const f = await fixture();
  const a = operation(f, { number: '自由-枝番' }); await publish(f, a);
  const b = operation(f, { targetCell: f.cellIds[50], number: '自由-枝番' }); await publish(f, b);
  assert.equal(f.catalog.numberOwners[`${f.lineIds[0]}|自由-枝番`], a.history.seatId);
  assert.equal(f.catalog.numberOwners[`${f.lineIds[1]}|自由-枝番`], b.history.seatId);
  return { freeNumbersAccepted: true, uniquenessScopedToLine: true, crossSectionAndUnicodeNormalizationNotTested: true };
});
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const hashes = {};
for (const file of ['../firestore.rules', '../firebase.json', 'emulator.mjs']) hashes[file] = createHash('sha256').update((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({ project, runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceSha256: hashes, scope: 'single existing-cell layout edits only; not production acceptance or integrated assignment Rules', callsWithoutCache: { catalog: 7, assignmentState: 5, history: 5, commit: 17 }, reports }, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);
const documentData = r => decode({ mapValue: { fields: r.body.fields } });
