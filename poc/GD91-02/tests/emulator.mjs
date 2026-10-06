import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// 検証先はlocalhostと架空demoプロジェクトに固定する。
const project = 'demo-concert-seat-gd91-02';
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
const relative = (f, suffix) => `aggregateShows/${f.show}/${suffix}`;
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
const documentData = r => decode({ mapValue: { fields: r.body.fields } });
const update = (f, suffix, data, mask, exists) => ({ update: { name: name(f, suffix), fields: fields(data) }, ...(mask ? { updateMask: { fieldPaths: mask } } : {}), ...(exists === undefined ? {} : { currentDocument: { exists } }) });
async function commit(f, writes, token = f.owner.token) { return request(`${base}:commit`, token, 'POST', { writes }); }
async function fixture(seats = 900, occupants = 0, lockedSeatIds = []) {
  const f = { show: `FAKE-${randomUUID()}`, owner: await actor(), other: await actor(), reader: await actor() };
  for (const [a, humanUid] of [[f.owner, 'FAKE-manager'], [f.other, 'FAKE-manager'], [f.reader, 'FAKE-reader']]) {
    await seed(f, `devices/${a.uid}`, { deviceUid: a.uid, humanUid, active: true });
    await seed(f, `sessions/${a.uid}`, { humanUid, active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } });
  }
  await seed(f, 'roles/FAKE-manager', { role: 'owner', active: true });
  await seed(f, 'roles/FAKE-reader', { role: 'receptionist', active: true });
  const seatIds = Array.from({ length: seats }, (_, i) => `S${i}`);
  await seed(f, 'catalog/current', { revision: 1, seatIds, lockedSeatIds });
  await seed(f, 'eligibility/current', { revision: 1, attendeeIds: Array.from({ length: 500 }, (_, i) => `A${i}`) });
  await seed(f, 'control/current', { revision: 0, firstReceptionStartedAt: null });
  f.state = { revision: 0, operationId: '', catalogRevision: 1, eligibilityRevision: 1, controlRevision: 0, assignments: Object.fromEntries(seatIds.map((s, i) => [s, i < occupants ? `A${i}` : ''])) };
  await seed(f, 'assignmentState/current', f.state);
  return f;
}
function operation(f, assignments, { mode = 'bulk', kind = 'assign', seat1, seat2 = '', reason = '', actor = f.owner } = {}) {
  const op = `FAKE-${randomUUID()}`;
  const after = { ...f.state, revision: f.state.revision + 1, operationId: op, assignments };
  const history = { mode, kind, deviceUid: actor.uid, baseRevision: f.state.revision, revision: after.revision, reason,
    ...(mode === 'bulk' ? { before: f.state.assignments, after: assignments } : { seat1, seat2, before1: f.state.assignments[seat1], before2: f.state.assignments[seat2] ?? '', after1: assignments[seat1], after2: assignments[seat2] ?? '' }) };
  const changed = Object.keys(assignments).filter(s => assignments[s] !== f.state.assignments[s]);
  const mask = mode === 'small' ? ['revision', 'operationId', 'catalogRevision', 'eligibilityRevision', 'controlRevision', ...changed.map(s => 'assignments.`' + s + '`')] : undefined;
  const statePayload = mode === 'small' ? { ...after, assignments: Object.fromEntries(changed.map(s => [s, assignments[s]])) } : after;
  return { op, after, history, writes: [update(f, 'assignmentState/current', statePayload, mask), update(f, `operations/${op}`, history, undefined, false)] };
}
async function publish(f, o, token = f.owner.token) {
  const result = await commit(f, o.writes, token);
  if (result.status === 200) f.state = o.after;
  return result;
}
async function denied(f, writes, token = f.owner.token) {
  const before = documentData(await get(f, 'assignmentState/current'));
  const result = await commit(f, writes, token);
  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.deepEqual(documentData(await get(f, 'assignmentState/current')), before);
}
async function record(id, label, fn) {
  const result = await fn(); reports.push({ id, label, ...result }); console.log(`${id}: CHECKED ${label}`);
}
const assigned500 = f => Object.fromEntries(Object.keys(f.state.assignments).map((s, i) => [s, i < 500 ? `A${i}` : '']));
const swap = f => ({ ...f.state.assignments, S0: f.state.assignments.S1, S1: f.state.assignments.S0 });

for (const seats of [500, 900]) await record(`GD91-E${seats === 500 ? '01' : '02'}`, `${seats} seats with 500 unique occupants in one commit`, async () => {
  const f = await fixture(seats); const o = operation(f, assigned500(f)); const r = await publish(f, o);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const current = await get(f, 'assignmentState/current', f.reader.token); assert.equal(current.status, 200);
  assert.deepEqual(documentData(current), o.after);
  assert.equal((await get(f, `operations/${o.op}`, f.reader.token)).status, 403);
  return { seats, occupants: 500, mutations: 1, documentWrites: 2, requestBodyBytes: Buffer.byteLength(JSON.stringify({ writes: o.writes })), inverseDerived: true };
});
await record('GD91-E03', 'move then swap use the same canonical map and small payload', async () => {
  const f = await fixture(900, 500);
  const move = operation(f, { ...f.state.assignments, S0: '', S800: 'A0' }, { mode: 'small', kind: 'move', seat1: 'S0', seat2: 'S800' });
  assert.equal((await publish(f, move)).status, 200);
  const exchange = operation(f, { ...f.state.assignments, S1: 'A0', S800: 'A1' }, { mode: 'small', kind: 'swap', seat1: 'S1', seat2: 'S800' });
  assert.equal((await publish(f, exchange)).status, 200);
  const inverse = Object.fromEntries(Object.entries(f.state.assignments).filter(([, a]) => a).map(([s, a]) => [a, s]));
  assert.equal(inverse.A0, 'S1'); assert.equal(inverse.A1, 'S800'); assert.equal(inverse.A499, 'S499');
  assert.equal(documentData(await get(f, 'assignmentState/current')).assignments.S2, 'A2');
  return { documentWritesPerOperation: 2, mapEntries: 900, changedSeatsPerOperation: 2, requestBodyBytes: { move: Buffer.byteLength(JSON.stringify({ writes: move.writes })), swap: Buffer.byteLength(JSON.stringify({ writes: exchange.writes })) } };
});
await record('GD91-E04', 'duplicate unknown and omitted occupant are rejected', async () => {
  const f = await fixture(900, 500);
  for (const changes of [{ S1: 'A0' }, { S1: 'FAKE-unknown' }, { S0: '' }, { S800: 123 }, { S800: null }]) await denied(f, operation(f, { ...f.state.assignments, ...changes }).writes);
  return { attacks: 5, unchanged: true };
});
await record('GD91-E05', 'seat addition deletion and locked seat change are rejected', async () => {
  const f = await fixture(900, 500, ['S0']);
  const missing = { ...f.state.assignments }; delete missing.S899;
  for (const map of [missing, { ...f.state.assignments, 'FAKE-seat': '' }, swap(f)]) await denied(f, operation(f, map).writes);
  await denied(f, operation(f, swap(f), { mode: 'small', kind: 'swap', seat1: 'S0', seat2: 'S1' }).writes);
  return { attacks: 4, unchanged: true };
});
await record('GD91-E06', 'missing orphan and fabricated history cannot commit', async () => {
  const f = await fixture(900, 500); const o = operation(f, swap(f));
  await denied(f, [o.writes[0]]); await denied(f, [o.writes[1]]);
  await denied(f, [o.writes[0], update(f, `operations/${o.op}`, { ...o.history, before: { S0: '' } })]);
  await denied(f, [o.writes[0], update(f, `operations/${o.op}`, { ...o.history, after: { S0: 'A1' } })]);
  await denied(f, [o.writes[0], update(f, `operations/${o.op}`, { ...o.history, kind: 'move' })]);
  return { attacks: 5, unchanged: true };
});
await record('GD91-E07', 'small history cannot hide extra changes or mislabel commands', async () => {
  const f = await fixture(900, 500);
  const o = operation(f, { ...swap(f), S2: 'A3', S3: 'A2' }, { mode: 'small', kind: 'swap', seat1: 'S0', seat2: 'S1' });
  await denied(f, o.writes);
  const valid = operation(f, swap(f), { mode: 'small', kind: 'swap', seat1: 'S0', seat2: 'S1' });
  for (const changes of [{ before1: 'A99' }, { after1: 'A99' }, { kind: 'move' }, { seat2: 'S0' }]) await denied(f, [valid.writes[0], update(f, `operations/${valid.op}`, { ...valid.history, ...changes })]);
  return { attacks: 5, unchanged: true };
});
await record('GD91-E08', 'concurrent updates to different seats have one winner', async () => {
  const f = await fixture(900); const a = operation(f, { ...f.state.assignments, S0: 'A0' }, { mode: 'small', seat1: 'S0' });
  const b = operation(f, { ...f.state.assignments, S1: 'A1' }, { mode: 'small', seat1: 'S1', actor: f.other });
  const results = await Promise.all([commit(f, a.writes), commit(f, b.writes, f.other.token)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 403]);
  assert.equal(documentData(await get(f, 'assignmentState/current')).revision, 1);
  return { statuses: results.map(r => r.status), revision: 1, globalConflictBoundary: true };
});
await record('GD91-E09', 'catalog eligibility and performance version races are rejected', async () => {
  for (const source of ['catalog', 'eligibility', 'control']) {
    const f = await fixture(900, 500); const o = operation(f, swap(f));
    const old = documentData(await get(f, `${source}/current`)); await seed(f, `${source}/current`, { ...old, revision: old.revision + 1 });
    await denied(f, o.writes);
  }
  return { sources: 3, unchanged: true };
});
await record('GD91-E10', 'reason required after first real reception start', async () => {
  const f = await fixture(900, 500);
  await seed(f, 'control/current', { revision: 1, firstReceptionStartedAt: { $timestamp: new Date().toISOString() } });
  f.state.controlRevision = 1;
  for (const reason of ['', '   ', '\n\t']) await denied(f, operation(f, swap(f), { mode: 'small', kind: 'swap', seat1: 'S0', seat2: 'S1', reason }).writes);
  assert.equal((await publish(f, operation(f, swap(f), { mode: 'small', kind: 'swap', seat1: 'S0', seat2: 'S1', reason: 'FAKE: customer\nrequest' }))).status, 200);
  return { reasonlessRejected: 3, multilineReasonAccepted: true };
});
await record('GD91-E11', 'stopped expired reader and unauthenticated requests are denied', async () => {
  const f = await fixture(900, 500); const o = operation(f, swap(f));
  await denied(f, o.writes, null); await denied(f, o.writes, f.reader.token);
  const d = documentData(await get(f, `devices/${f.owner.uid}`)); await seed(f, `devices/${f.owner.uid}`, { ...d, active: false }); await denied(f, o.writes);
  await seed(f, `devices/${f.owner.uid}`, d);
  const session = documentData(await get(f, `sessions/${f.owner.uid}`)); await seed(f, `sessions/${f.owner.uid}`, { ...session, expiresAt: { $timestamp: new Date(0).toISOString() } }); await denied(f, o.writes);
  return { attacks: 4, unchanged: true };
});
await record('GD91-E12', 'lost response resolves by same operation and history is immutable', async () => {
  const f = await fixture(900, 500); const o = operation(f, swap(f)); assert.equal((await publish(f, o)).status, 200);
  // 送信結果を捨てた後の照会を再現。実SDKの再試行やIndexedDB復帰は対象外。
  const result = await get(f, `operations/${o.op}`, f.owner.token); assert.equal(result.status, 200); assert.deepEqual(documentData(result), o.history);
  await denied(f, o.writes);
  await denied(f, [update(f, `operations/${o.op}`, { ...o.history, reason: 'FAKE: rewrite' })]);
  const changed = { ...o, history: { ...o.history, reason: 'FAKE: different payload' } }; assert.notDeepEqual(documentData(result), changed.history);
  assert.equal(documentData(await get(f, 'assignmentState/current')).revision, 1);
  return { resultMatched: true, retriesCreateNothing: true, changedPayloadDetected: true };
});
await record('GD91-E13', 'no change and metadata injection cannot bump the revision', async () => {
  const f = await fixture(900, 500); await denied(f, operation(f, { ...f.state.assignments }).writes);
  const o = operation(f, swap(f)); await denied(f, [update(f, 'assignmentState/current', { ...o.after, layout: 'FAKE-change' }), o.writes[1]]);
  return { attacks: 2, unchanged: true };
});
await record('GD91-E14', 'client cannot change trusted eligibility or seat catalog', async () => {
  const f = await fixture(900, 500);
  for (const suffix of ['eligibility/current', 'catalog/current', 'control/current']) await denied(f, [update(f, suffix, { revision: 99 })]);
  assert.equal((await get(f, 'eligibility/current', f.reader.token)).status, 403);
  return { attacks: 3, readerEligibilityDenied: true };
});
await record('GD91-E15', 'another performance does not accept the first performance device', async () => {
  const first = await fixture(900, 500); const second = await fixture(900, 500);
  const o = operation(second, swap(second), { actor: first.owner });
  await denied(second, o.writes, first.owner.token);
  assert.equal((await get(second, 'assignmentState/current', first.owner.token)).status, 403);
  return { crossPerformanceWriteDenied: true, crossPerformanceReadDenied: true };
});
await record('GD91-E16', '501 occupants are rejected even with a trusted candidate list', async () => {
  const f = await fixture(900);
  await seed(f, 'eligibility/current', { revision: 1, attendeeIds: Array.from({ length: 501 }, (_, i) => `A${i}`) });
  const map = { ...assigned500(f), S500: 'A500' }; await denied(f, operation(f, map).writes);
  return { occupants: 501, http: 403, unchanged: true };
});
await record('GD91-E17', 'ten occupants use the same canonical map as single and bulk changes', async () => {
  const f = await fixture(900);
  const assignments = Object.fromEntries(Object.keys(f.state.assignments).map((s, i) => [s, i < 10 ? `A${i}` : '']));
  const o = operation(f, assignments); assert.equal((await publish(f, o)).status, 200);
  assert.equal(Object.values(documentData(await get(f, 'assignmentState/current')).assignments).filter(Boolean).length, 10);
  return { occupants: 10, mutations: 1, documentWrites: 2 };
});
await record('GD91-E18', 'UUID keys support full publication followed by quoted field-mask move', async () => {
  const f = await fixture(0);
  const seatIds = Array.from({ length: 900 }, () => randomUUID());
  const attendeeIds = Array.from({ length: 500 }, () => randomUUID());
  await seed(f, 'catalog/current', { revision: 1, seatIds, lockedSeatIds: [] });
  await seed(f, 'eligibility/current', { revision: 1, attendeeIds });
  f.state.assignments = Object.fromEntries(seatIds.map(s => [s, ''])); await seed(f, 'assignmentState/current', f.state);
  const map = Object.fromEntries(seatIds.map((s, i) => [s, i < 500 ? attendeeIds[i] : '']));
  const bulk = operation(f, map); assert.equal((await publish(f, bulk)).status, 200);
  const move = operation(f, { ...map, [seatIds[0]]: '', [seatIds[899]]: attendeeIds[0] }, { mode: 'small', kind: 'move', seat1: seatIds[0], seat2: seatIds[899] });
  assert.equal((await publish(f, move)).status, 200);
  const current = documentData(await get(f, 'assignmentState/current', f.reader.token));
  assert.equal(current.assignments[seatIds[899]], attendeeIds[0]); assert.equal(current.assignments[seatIds[499]], attendeeIds[499]);
  return { seats: 900, occupants: 500, idLength: 36, mutationsPerOperation: 1, documentWritesPerOperation: 2, requestBodyBytes: { initial500: Buffer.byteLength(JSON.stringify({ writes: bulk.writes })), move: Buffer.byteLength(JSON.stringify({ writes: move.writes })) } };
});
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const hashes = {};
for (const file of ['../firestore.rules', '../firebase.json', 'emulator.mjs']) hashes[file] = createHash('sha256').update((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({ project, runtime: process.version, executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceSha256: hashes, scope: 'fixed seat assignment map only; not production acceptance', reports }, null, 2) + '\n');
console.log(`${reports.length} scenarios executed`);
