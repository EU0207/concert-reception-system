import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, mkdir, readFile } from 'node:fs/promises';

// 検証先を固定し、実サービスへ接続できる設定引数を持たせない。
const project = 'demo-concert-seat-gd91-01';
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const authBase = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const reports = [];
const encode = value => value === null ? { nullValue: null }
  : typeof value === 'boolean' ? { booleanValue: value }
  : typeof value === 'number' ? { integerValue: String(value) }
  : typeof value === 'string' ? { stringValue: value }
  : Object.hasOwn(value, '$timestamp') ? { timestampValue: value.$timestamp }
  : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
const fields = value => encode(value).mapValue.fields;
const path = (show, suffix) => `proofShows/${show}/${suffix}`;
const document = (show, suffix) => `projects/${project}/databases/(default)/documents/${path(show, suffix)}`;

async function request(url, token, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}
async function anonymous() {
  const response = await request(`${authBase}/accounts:signUp?key=demo-api-key`, null, 'POST', { returnSecureToken: true });
  assert.equal(response.status, 200);
  assert.equal(typeof response.body.idToken, 'string');
  const claims = JSON.parse(Buffer.from(response.body.idToken.split('.')[1], 'base64url'));
  assert.equal(claims.aud, project, 'Auth emulator project mismatch');
  return { uid: response.body.localId, token: response.body.idToken };
}
async function seed(show, suffix, value) {
  const response = await request(`${base}/${path(show, suffix)}`, 'owner', 'PATCH', { fields: fields(value) });
  assert.equal(response.status, 200);
}
async function get(show, suffix) {
  return request(`${base}/${path(show, suffix)}`, 'owner');
}
function update(show, suffix, value, precondition) {
  return { update: { name: document(show, suffix), fields: fields(value) }, ...(precondition ? { currentDocument: precondition } : {}) };
}
async function commit(token, writes) {
  return request(`${base}:commit`, token, 'POST', { writes });
}
async function fixture(count = 2) {
  const show = `FAKE-${randomUUID()}`;
  const actor = await anonymous();
  const other = await anonymous();
  for (const device of [actor, other]) {
    await seed(show, `devices/${device.uid}`, { deviceUid: device.uid, humanUid: 'FAKE-human', active: true });
    await seed(show, `sessions/${device.uid}`, { humanUid: 'FAKE-human', active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } });
  }
  await seed(show, 'roles/FAKE-human', { role: 'owner', active: true });
  await seed(show, 'state/head', { revision: 0, operationId: '' });
  await seed(show, 'control/state', { revision: 0, firstReceptionStartedAt: null });
  const writes = [];
  for (let i = 0; i < count; i++) {
    writes.push(update(show, `seats/S${i}`, { label: `A-${i + 1}`, attendeeId: '', revision: 0, operationId: '' }));
    writes.push(update(show, `assignments/A${i}`, { seatId: '', revision: 0, operationId: '' }));
  }
  // 初期値だけはエミュレーター専用の管理経路で投入する。
  for (let i = 0; i < writes.length; i += 200) assert.equal((await commit('owner', writes.slice(i, i + 200))).status, 200);
  return { show, actor, other, count };
}
async function assignmentWrites(f, count, op = `FAKE-${randomUUID()}`, actor = f.actor, kind = 'assign') {
  const head = await get(f.show, 'state/head');
  const writes = [
    update(f.show, 'state/head', { revision: 1, operationId: op }, { updateTime: head.body.updateTime }),
    update(f.show, `events/${op}`, { revision: 1, deviceUid: actor.uid, kind }, { exists: false })
  ];
  for (let i = 0; i < count; i++) {
    writes.push(update(f.show, `seats/S${i}`, { label: `A-${i + 1}`, attendeeId: `A${i}`, revision: 1, operationId: op }));
    writes.push(update(f.show, `assignments/A${i}`, { seatId: `S${i}`, revision: 1, operationId: op }));
  }
  return writes;
}
async function record(id, name, fn) {
  const result = await fn();
  reports.push({ id, name, ...result });
  console.log(`${id}: CHECKED ${name}`);
}

await record('GD91-P01', 'one paired assignment and history', async () => {
  const f = await fixture();
  const result = await commit(f.actor.token, await assignmentWrites(f, 1));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await get(f.show, 'seats/S0')).body.fields.attendeeId.stringValue, 'A0');
  return { writes: 4, http: result.status };
});
await record('GD91-P02', 'one-sided assignment denied with no partial commit', async () => {
  const f = await fixture();
  const writes = await assignmentWrites(f, 1);
  writes.pop();
  const result = await commit(f.actor.token, writes);
  assert.equal(result.status, 403);
  assert.equal((await get(f.show, 'state/head')).body.fields.revision.integerValue, '0');
  assert.equal((await get(f.show, 'seats/S0')).body.fields.attendeeId.stringValue, '');
  return { http: result.status, stateUnchanged: true };
});
await record('GD91-P03', 'simultaneous assignment commits only once', async () => {
  const f = await fixture();
  const a = await assignmentWrites(f, 1);
  const b = await assignmentWrites(f, 1, `FAKE-${randomUUID()}`, f.other);
  const results = await Promise.all([commit(f.actor.token, a), commit(f.other.token, b)]);
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal((await get(f.show, 'state/head')).body.fields.revision.integerValue, '1');
  return { http: results.map(r => r.status).sort(), finalRevision: 1 };
});
for (const count of [2, 5, 10, 500]) {
  await record(`GD91-P${count === 2 ? '04' : count === 5 ? '05' : count === 10 ? '06' : '07'}`, `paired assignment count ${count}`, async () => {
    const f = await fixture(count);
    const result = await commit(f.actor.token, await assignmentWrites(f, count));
    // 成否を測定し、500件の成功を前提にしない。
    assert.ok([200, 403].includes(result.status), JSON.stringify(result.body));
    const expectedRevision = result.status === 200 ? '1' : '0';
    assert.equal((await get(f.show, 'state/head')).body.fields.revision.integerValue, expectedRevision);
    const first = (await get(f.show, 'assignments/A0')).body.fields.seatId.stringValue;
    const last = (await get(f.show, `assignments/A${count - 1}`)).body.fields.seatId.stringValue;
    assert.equal(first, result.status === 200 ? 'S0' : '');
    assert.equal(last, result.status === 200 ? `S${count - 1}` : '');
    return { count, writes: 2 * count + 2, http: result.status, accepted: result.status === 200, partialUpdate: false };
  });
}
await record('GD91-P08', 'stopped device cannot impersonate another device', async () => {
  const f = await fixture();
  await seed(f.show, `devices/${f.actor.uid}`, { deviceUid: f.actor.uid, humanUid: 'FAKE-human', active: false });
  const result = await commit(f.actor.token, await assignmentWrites(f, 1, `FAKE-${randomUUID()}`, f.other));
  assert.equal(result.status, 403);
  return { http: result.status };
});
await record('GD91-P09', 'first reception timestamp cannot be cleared or backdated', async () => {
  const f = await fixture();
  await seed(f.show, 'control/state', { revision: 1, firstReceptionStartedAt: { $timestamp: new Date(Date.now() - 60000).toISOString() } });
  for (const value of [null, { $timestamp: '2000-01-01T00:00:00Z' }]) {
    const result = await commit(f.actor.token, [update(f.show, 'control/state', { revision: 2, firstReceptionStartedAt: value })]);
    assert.equal(result.status, 403);
  }
  return { attempts: 2, http: 403 };
});
await record('GD91-P12', 'server timestamp initializes once and survives stop-like revision update', async () => {
  const f = await fixture();
  const write = update(f.show, 'control/state', { revision: 1, firstReceptionStartedAt: null });
  write.updateTransforms = [{ fieldPath: 'firstReceptionStartedAt', setToServerValue: 'REQUEST_TIME' }];
  assert.equal((await commit(f.actor.token, [write])).status, 200);
  const first = (await get(f.show, 'control/state')).body.fields.firstReceptionStartedAt.timestampValue;
  assert.equal((await commit(f.actor.token, [update(f.show, 'control/state', { revision: 2, firstReceptionStartedAt: { $timestamp: first } })])).status, 200);
  assert.equal((await get(f.show, 'control/state')).body.fields.firstReceptionStartedAt.timestampValue, first);
  return { serverTimestamp: true, preserved: true, receptionStartWorkflowNotImplemented: true };
});
for (const swap of [false, true]) {
  await record(swap ? 'GD91-P11' : 'GD91-P10', swap ? 'two-person swap retains paired references' : 'move retains paired references', async () => {
    const f = await fixture();
    await seed(f.show, 'seats/S0', { label: 'A-1', attendeeId: 'A0', revision: 0, operationId: '' });
    await seed(f.show, 'assignments/A0', { seatId: 'S0', revision: 0, operationId: '' });
    if (swap) {
      await seed(f.show, 'seats/S1', { label: 'A-2', attendeeId: 'A1', revision: 0, operationId: '' });
      await seed(f.show, 'assignments/A1', { seatId: 'S1', revision: 0, operationId: '' });
    }
    const op = `FAKE-${randomUUID()}`;
    const writes = (await assignmentWrites(f, 0, op, f.actor, swap ? 'swap' : 'move')).concat([
      update(f.show, 'seats/S0', { label: 'A-1', attendeeId: swap ? 'A1' : '', revision: 1, operationId: op }),
      update(f.show, 'seats/S1', { label: 'A-2', attendeeId: 'A0', revision: 1, operationId: op }),
      update(f.show, 'assignments/A0', { seatId: 'S1', revision: 1, operationId: op }),
      ...(swap ? [update(f.show, 'assignments/A1', { seatId: 'S0', revision: 1, operationId: op })] : [])
    ]);
    assert.equal((await commit(f.actor.token, writes)).status, 200);
    assert.equal((await get(f.show, 'assignments/A0')).body.fields.seatId.stringValue, 'S1');
    assert.equal((await get(f.show, 'seats/S0')).body.fields.attendeeId.stringValue, swap ? 'A1' : '');
    return { writes: writes.length, paired: true };
  });
}

async function bulkFixture(count, occupied = false, fixed = false) {
  const f = await fixture(0);
  f.baseGeneration = 'FAKE-base';
  f.count = count;
  f.entries = Array.from({ length: count }, (_, i) => ({ seatId: `S${i}`, label: `A-${i + 1}`, attendeeId: occupied ? `A${i}` : '', fixed, emergencyKind: i === 0 ? 'added' : '', reason: i === 0 ? 'FAKE: portable chair added' : '' }));
  await seed(f.show, 'generationHead/state', { generationId: f.baseGeneration, revision: 0, count });
  const writes = f.entries.map((entry, i) => update(f.show, `generations/${f.baseGeneration}/entries/${i}`, entry));
  for (let i = 0; i < writes.length; i += 200) assert.equal((await commit('owner', writes.slice(i, i + 200))).status, 200);
  return f;
}
function bulkData(f) {
  return { baseGeneration: f.baseGeneration, baseRevision: 0, controlRevision: 0, expectedCount: f.count, processed: 0, verified: 0, phase: 'preparing', deviceUid: f.actor.uid };
}
async function startBulk(f, changes = {}) {
  f.op = `FAKE-${randomUUID()}`;
  f.operation = { ...bulkData(f), ...changes };
  return commit(f.actor.token, [update(f.show, `bulkOperations/${f.op}`, f.operation, { exists: false })]);
}
function appendWrites(f, aid, entryChanges = {}, countStep = 1, includeEntry = true, includeMember = true) {
  const i = f.operation.processed;
  return [
    update(f.show, `bulkOperations/${f.op}`, { ...f.operation, processed: i + countStep }),
    ...(includeEntry ? [update(f.show, `generations/${f.op}/entries/${i}`, { ...f.entries[i], attendeeId: aid, ...entryChanges }, { exists: false })] : []),
    ...(aid && includeMember ? [update(f.show, `generations/${f.op}/members/${aid}`, { ordinal: String(i) }, { exists: false })] : [])
  ];
}
async function appendBulk(f, aid) {
  const result = await commit(f.actor.token, appendWrites(f, aid));
  if (result.status === 200) f.operation.processed++;
  return result;
}
async function phaseBulk(f, phase, verified = f.operation.verified) {
  const operation = { ...f.operation, phase, verified };
  const result = await commit(f.actor.token, [update(f.show, `bulkOperations/${f.op}`, operation)]);
  if (result.status === 200) f.operation = operation;
  return result;
}
function publishWrites(f) {
  return [
    update(f.show, `generationHead/state`, { generationId: f.op, revision: 1, count: f.count }),
    update(f.show, `bulkOperations/${f.op}`, { ...f.operation, phase: 'published' }),
    update(f.show, `bulkEvents/${f.op}`, { revision: 1, deviceUid: f.actor.uid, kind: 'assign' }, { exists: false })
  ];
}
async function prepareBulk(f, aidForOrdinal = i => `A${i}`) {
  assert.equal((await startBulk(f)).status, 200);
  for (let i = 0; i < f.count; i++) assert.equal((await appendBulk(f, aidForOrdinal(i))).status, 200);
  assert.equal((await phaseBulk(f, 'verifying')).status, 200);
  for (let i = 0; i < f.count; i++) assert.equal((await phaseBulk(f, 'verifying', i + 1)).status, 200);
  assert.equal((await phaseBulk(f, 'ready')).status, 200);
}
await record('GD91-B01', '500-entry staged publication hides partial generation', async () => {
  const started = performance.now();
  const f = await bulkFixture(500);
  assert.equal((await startBulk(f)).status, 200);
  for (let i = 0; i < f.count; i++) {
    const result = await appendBulk(f, `A${i}`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    if (i === 0) {
      assert.equal((await request(`${base}/${path(f.show, `generations/${f.op}/entries/0`)}`, f.actor.token)).status, 403);
      assert.equal((await request(`${base}/${path(f.show, `generations/${f.baseGeneration}/entries/0`)}`, f.actor.token)).status, 200);
    }
  }
  assert.equal((await phaseBulk(f, 'verifying')).status, 200);
  for (let i = 0; i < f.count; i++) assert.equal((await phaseBulk(f, 'verifying', i + 1)).status, 200);
  assert.equal((await phaseBulk(f, 'ready')).status, 200);
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 200);
  assert.equal((await get(f.show, 'generationHead/state')).body.fields.generationId.stringValue, f.op);
  assert.equal((await request(`${base}/${path(f.show, `generations/${f.op}/entries/499`)}`, f.actor.token)).status, 200);
  assert.equal((await request(`${base}/${path(f.show, `generations/${f.baseGeneration}/entries/0`)}`, f.actor.token)).status, 403);
  return { entries: 500, mutations: 1004, documentWrites: 2006, elapsedMs: Math.round(performance.now() - started), partialReadDenied: true };
});
await record('GD91-B02', 'forged count and missing entry cannot advance preparation', async () => {
  const f = await bulkFixture(2);
  assert.equal((await startBulk(f, { expectedCount: 1 })).status, 403);
  assert.equal((await startBulk(f)).status, 200);
  for (const writes of [appendWrites(f, 'A0', {}, 2), appendWrites(f, 'A0', {}, 1, false), appendWrites(f, 'A0', {}, 1, true, false)]) {
    assert.equal((await commit(f.actor.token, writes)).status, 403);
    assert.equal((await get(f.show, `bulkOperations/${f.op}`)).body.fields.processed.integerValue, '0');
  }
  assert.equal((await phaseBulk(f, 'ready')).status, 403);
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 403);
  return { attacks: 6, http: 403, unchanged: true };
});
await record('GD91-B03', 'duplicate attendee and altered seat identity are denied', async () => {
  const f = await bulkFixture(2);
  assert.equal((await startBulk(f)).status, 200);
  for (const changes of [{ seatId: 'S-other' }, { label: 'A-99' }, { reason: 'changed' }, { emergencyKind: '' }]) assert.equal((await commit(f.actor.token, appendWrites(f, 'A0', changes))).status, 403);
  assert.equal((await appendBulk(f, 'A0')).status, 200);
  assert.notEqual((await appendBulk(f, 'A0')).status, 200);
  assert.equal((await get(f.show, `bulkOperations/${f.op}`)).body.fields.processed.integerValue, '1');
  return { protectedFields: 4, duplicateDenied: true };
});
await record('GD91-B04', 'immutable prepared entries cannot be altered', async () => {
  const f = await bulkFixture(1);
  await prepareBulk(f);
  assert.equal((await commit(f.actor.token, [update(f.show, `generations/${f.op}/entries/0`, { ...f.entries[0], attendeeId: 'A-other' })])).status, 403);
  return { http: 403 };
});
await record('GD91-B05', 'stale reception control and stopped device block publication', async () => {
  const f = await bulkFixture(1);
  await prepareBulk(f);
  await seed(f.show, 'control/state', { revision: 1, firstReceptionStartedAt: { $timestamp: new Date().toISOString() } });
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 403);
  await seed(f.show, 'control/state', { revision: 0, firstReceptionStartedAt: null });
  await seed(f.show, `devices/${f.actor.uid}`, { deviceUid: f.actor.uid, humanUid: 'FAKE-human', active: false });
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 403);
  assert.equal((await get(f.show, 'generationHead/state')).body.fields.revision.integerValue, '0');
  return { attacks: 2, unchanged: true };
});
await record('GD91-B06', 'simultaneous ready generations publish only once', async () => {
  const f = await bulkFixture(2);
  const second = { ...f };
  await prepareBulk(f);
  await prepareBulk(second, i => `A-other-${i}`);
  const results = await Promise.all([commit(f.actor.token, publishWrites(f)), commit(second.actor.token, publishWrites(second))]);
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal((await get(f.show, 'generationHead/state')).body.fields.revision.integerValue, '1');
  return { http: results.map(r => r.status).sort(), finalRevision: 1 };
});
await record('GD91-B07', 'existing occupants must all remain and fixed seat cannot move', async () => {
  const f = await bulkFixture(2, true);
  assert.equal((await startBulk(f)).status, 200);
  assert.equal((await appendBulk(f, 'A0')).status, 200);
  assert.equal((await appendBulk(f, '')).status, 200);
  assert.equal((await phaseBulk(f, 'verifying')).status, 200);
  assert.equal((await phaseBulk(f, 'verifying', 1)).status, 200);
  assert.equal((await phaseBulk(f, 'verifying', 2)).status, 403);
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 403);
  const fixed = await bulkFixture(1, true, true);
  assert.equal((await startBulk(fixed)).status, 200);
  assert.equal((await appendBulk(fixed, 'A-other')).status, 403);
  return { releaseDenied: true, fixedMoveDenied: true };
});
await record('GD91-B08', 'general reception reads current reason but cannot read management history', async () => {
  const f = await bulkFixture(1);
  await prepareBulk(f);
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 200);
  await seed(f.show, 'roles/FAKE-human', { role: 'reception', active: true });
  const read = await request(`${base}/${path(f.show, `generations/${f.op}/entries/0`)}`, f.actor.token);
  assert.equal(read.status, 200);
  assert.equal(read.body.fields.reason.stringValue, f.entries[0].reason);
  for (const suffix of [`bulkOperations/${f.op}`, `bulkEvents/${f.op}`, `devices/${f.actor.uid}`]) assert.equal((await request(`${base}/${path(f.show, suffix)}`, f.actor.token)).status, 403);
  assert.equal(Object.hasOwn(read.body.fields, 'deviceUid'), false);
  return { currentReasonReadable: true, privateDocumentsDenied: 3 };
});
await record('GD91-B09', 'skipped verification and missing publication history are denied', async () => {
  const f = await bulkFixture(2);
  assert.equal((await startBulk(f)).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await appendBulk(f, `A${i}`)).status, 200);
  assert.equal((await phaseBulk(f, 'verifying')).status, 200);
  assert.equal((await phaseBulk(f, 'verifying', 2)).status, 403);
  assert.equal((await phaseBulk(f, 'ready')).status, 403);
  for (let i = 0; i < 2; i++) assert.equal((await phaseBulk(f, 'verifying', i + 1)).status, 200);
  assert.equal((await phaseBulk(f, 'ready')).status, 200);
  assert.equal((await commit(f.actor.token, publishWrites(f).slice(0, 2))).status, 403);
  assert.equal((await get(f.show, 'generationHead/state')).body.fields.revision.integerValue, '0');
  return { attacks: 3, publicationUnchanged: true };
});
await record('GD91-B10', 'interrupted preparation and replay do not publish twice', async () => {
  const f = await bulkFixture(2);
  assert.equal((await startBulk(f)).status, 200);
  const originalWrites = appendWrites(f, 'A0');
  assert.equal((await appendBulk(f, 'A0')).status, 200);
  assert.equal((await commit(f.actor.token, originalWrites)).status, 403);
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 403);
  assert.equal((await get(f.show, 'generationHead/state')).body.fields.revision.integerValue, '0');
  assert.equal((await appendBulk(f, 'A1')).status, 200);
  assert.equal((await phaseBulk(f, 'verifying')).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await phaseBulk(f, 'verifying', i + 1)).status, 200);
  assert.equal((await phaseBulk(f, 'ready')).status, 200);
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 200);
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 403);
  assert.equal((await get(f.show, 'generationHead/state')).body.fields.revision.integerValue, '1');
  const result = await request(`${base}/${path(f.show, `bulkOperations/${f.op}`)}`, f.actor.token);
  assert.equal(result.body.fields.phase.stringValue, 'published');
  return { resultCanBeQueried: true, replayDoesNotIncrement: true, adapterIdempotenceNotImplemented: true };
});
await record('GD91-B11', 'expired session and non-manager cannot prepare', async () => {
  const f = await bulkFixture(1);
  await seed(f.show, `sessions/${f.actor.uid}`, { humanUid: 'FAKE-human', active: true, emailVerified: true, expiresAt: { $timestamp: '2000-01-01T00:00:00Z' } });
  assert.equal((await startBulk(f)).status, 403);
  const reception = await bulkFixture(1);
  await seed(reception.show, 'roles/FAKE-human', { role: 'reception', active: true });
  assert.equal((await startBulk(reception)).status, 403);
  assert.equal((await request(`${base}/${path(f.show, 'generationHead/state')}`, null)).status, 403);
  return { attacks: 3, http: 403 };
});
await record('GD91-B12', '900-record collection publishes 500 assignments and 400 empty seats', async () => {
  const started = performance.now();
  const f = await bulkFixture(900);
  await prepareBulk(f, i => i < 500 ? `A${i}` : '');
  assert.equal((await commit(f.actor.token, publishWrites(f))).status, 200);
  assert.equal((await get(f.show, `generations/${f.op}/entries/499`)).body.fields.attendeeId.stringValue, 'A499');
  assert.equal((await get(f.show, `generations/${f.op}/entries/899`)).body.fields.attendeeId.stringValue, '');
  return { entries: 900, assigned: 500, empty: 400, mutations: 1804, documentWrites: 3206, elapsedMs: Math.round(performance.now() - started), geometryNotValidated: true };
});
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const digest = async url => createHash('sha256').update(await readFile(url)).digest('hex');
await writeFile(new URL('../artifacts/emulator-summary.json', import.meta.url), JSON.stringify({
  project, runtime: process.version, executedAt: new Date().toISOString(),
  rulesSha256: await digest(new URL('../firestore.rules', import.meta.url)),
  testsSha256: await digest(new URL(import.meta.url)),
  reports
}, null, 2) + '\n');
