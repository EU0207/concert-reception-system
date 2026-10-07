import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend, validate } from '../../GD91-07/planner.mjs';
import { pack, unpack } from '../codec.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { project as projectView, initialHead } from '../../GD91-10/projection.mjs';

const project = 'demo-concert-seat-gd91-14';
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9191');
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const sources = ['../firestore.rules', '../firebase.json', '../codec.mjs', 'emulator.mjs', '../../GD91-10/projection.mjs', '../../GD91-07/planner.mjs', '../../GD91-08/slide.mjs'];
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
const relative = (f, suffix) => `splitSeatShows/${f.show}/${suffix}`;
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
const createConflict = r => { if (r.status === 409) assert.equal(r.body.error.status, 'ALREADY_EXISTS'); else denied(r); };
async function seed(f, suffix, value) { ok(await commit(f, [update(f, suffix, value)], 'owner')); }
async function fixture({ axis = 'horizontal', order = 'forward', direction = 'right', rows = 4, columns = 4, large = false, empty = false, block = null, role = 'owner', chunkSize = 4, rich = false, startNumber = 1, prefix } = {}) {
  const f = { show: `FAKE-${randomUUID()}`, owner: await actor(), other: await actor(), reader: await actor(), counts: { requests: 0, writes: 0, maxRequestBytes: 0 } };
  if (large) { rows = 30; columns = 30; }
  let m = createSection({ name: '架空集計区画', rows, columns, axis, seatOrder: order, stagePosition: axis === 'vertical' ? 'top' : 'left',
    lines: Array.from({ length: axis === 'horizontal' ? rows : columns }, (_, i) => ({ name: `L${i}`, startNumber, ...(prefix === undefined ? {} : { prefix }) })) }, context);
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
  if (rich) for (const s of m.seats) Object.assign(s, {category:'reserved',usable:false,reservedLabel:'架空確保',displayOrder:1,emergencyChange:{kind:'add',reason:'架空用途'}});
  f.model = m; f.expected = initialHead(m); f.direction = direction;
  f.head = { ...f.expected, rowCounts: {}, columnCounts: {}, nonEmptyCount: 0, sourceRevision: 0, revision: 0, status: 'building', cursor: 0, lastChunk: '', controlRevision: 1, initializationId: randomUUID(), chunkSize };
  f.registry = { initializationId: f.head.initializationId, cursor: 0, usedIds: Object.fromEntries([f.head.sectionId, ...m.section.lineSettings.map(l => l.lineId)].map(id => [id, true])), usedNumbers: {} };
  f.chunks = pack(m, chunkSize, context);
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
function stageWrites(f, chunk) { return [update(f, `chunks/${chunk.id}`, chunk.value, undefined, false)]; }
function attributeWrites(f, chunk) { return [update(f, `attributes/${chunk.id}`, chunk.attributes, undefined, false)]; }
function ingestWrites(f, o) {
  const keys = ['cursor', 'lastChunk', 'nonEmptyCount', 'rowCounts', 'columnCounts'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true),
    update(f, 'idRegistry/current', { cursor: o.registry.cursor, usedIds: Object.fromEntries(o.ids.map(id => [id,true])), usedNumbers: Object.fromEntries(o.numbers.map(key=>[key,true])) },
      ['cursor', ...o.ids.map(id=>'usedIds.`'+id+'`'), ...o.numbers.map(key=>'usedNumbers.`'+key+'`')], true)];
}
async function stage(f, chunk) { ok(await commit(f, stageWrites(f, chunk))); }
async function stageAttributes(f, chunk) { ok(await commit(f, attributeWrites(f, chunk))); }
async function consume(f, o = ingestion(f)) { ok(await commit(f, ingestWrites(f, o))); f.head=o.after; f.registry=o.registry; }
async function ingest(f, o = ingestion(f)) { await stage(f,o.chunk); await stageAttributes(f,o.chunk); await consume(f,o); }
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
async function reject(f, writes, token = f.owner.token, check = denied) {
  const beforeIds = await get(f, 'idRegistry/current'), before = await get(f, 'head/current'); check(await commit(f, writes, token)); const after = await get(f, 'head/current');
  const afterIds = await get(f, 'idRegistry/current'); assert.equal(afterIds.status, beforeIds.status); if (beforeIds.status === 200) assert.deepEqual(data(afterIds), data(beforeIds));
  assert.equal(after.status, before.status); if (before.status === 200) assert.deepEqual(data(after), data(before));
}
async function assertCounts(f) {
  const h = data(await get(f, 'head/current'));
  assert.deepEqual(data(await get(f, 'idRegistry/current')), f.registry);
  for (const [row, count] of Object.entries(f.expected.rowCounts)) assert.equal(h.rowCounts[row] ?? 0, count);
  for (const [col, count] of Object.entries(f.expected.columnCounts)) assert.equal(h.columnCounts[col] ?? 0, count);
  assert.equal(h.nonEmptyCount, f.expected.nonEmptyCount); assert.equal(h.cursor, h.rows * h.columns);
  const fetched = [], seats = [], catalog = data(await get(f, 'lineCatalog/current'));
  for (const c of f.chunks) {
    const layout = data(await get(f, `chunks/${c.id}`)), attributes = data(await get(f, `attributes/${c.id}`));
    assert.deepEqual(layout,c.value); assert.deepEqual(attributes,c.attributes); const restored = unpack(h,catalog,layout,attributes); fetched.push(...restored.cells); seats.push(...restored.seats);
  }
  // 文書間のセル配列順は契約に含めない。IDで全件照合して比較元の順へ戻す。
  const byId = new Map(fetched.map(c => [c.cellId, c])); assert.equal(byId.size, f.model.section.cells.length);
  const restored = structuredClone(f.model); restored.section.cells = f.model.section.cells.map(expected => {
    const c = byId.get(expected.cellId); assert(c, 'missing cell identity');
    return c;
  });
  const seatMap = new Map(seats.map(s => [s.seatId, s])); assert.equal(seatMap.size, f.model.seats.length);
  restored.seats = f.model.seats.map(s => { const found = seatMap.get(s.seatId); assert(found); return found; });
  const refs = data(await get(f, 'seatReferences/current')); for (const key of ['assignments', 'ticketRefs', 'receptionRefs']) restored[key] = refs[key];
  restored.section.lineSettings = Object.values(catalog.lines).sort((a, b) => a.index - b.index);
  assert.deepEqual(restored, f.model); validate(restored, context); return restored;
}
const resetCounts = f => { f.counts = {requests:0,writes:0,maxRequestBytes:0}; };
async function record(id,label,action) { const result=await action();reports.push({id,label,status:'passed',...result});console.log(`${id}: CHECKED ${label}`); }
let index=0;
for(const axis of ['horizontal','vertical']) for(const order of ['forward','reverse']) for(const direction of Object.keys(deltas)) {
  await record(`V${String(++index).padStart(2,'0')}`,'split fragments restore before offset sliding',async()=>{
    const f=await fixture({axis,order,direction});await initialize(f);const restored=await assertCounts(f),initialization=structuredClone(f.counts);resetCounts(f);await publishSlide(f);
    assert.deepEqual(projectView(restored,f.head,context),slide(f.model,{direction,amount:1},context).after);await assertCounts(f);assert.equal(f.counts.requests,1);assert.equal(f.counts.writes,2);
    return {axis,order,direction,initialization,slide:f.counts,sourceAndLedgersSeededByAdmin:false,trustedCatalogSeededByAdmin:true};
  });
}
await record('V17','cell fragment rejects malformed positions, IDs and number values',async()=>{
  const f=await fixture({columns:11});await start(f);let variants=0;
  for(let slot=0;slot<4;slot++) for(const field of ['kind','row','column','seatId','numberValue']) {
    const c=structuredClone(f.chunks[0]);c.value.cells[slot][field]=field==='kind'?'unknown':field==='seatId'?'':-1;
    await reject(f,stageWrites(f,c));assert.equal((await get(f,'chunks/0-0')).status,404);variants++;
  }
  const patches=[c=>c.value.cellIds[0]=randomUUID(),c=>{c.value.cells[1].cellId=c.value.cells[0].cellId;c.value.cellIds[1]=c.value.cellIds[0];},
    c=>c.value.cells.pop(),c=>c.value.numberKeys[0]='invented',c=>c.value.cells[0].extra=true,c=>c.value.extra=true,c=>c.id='0-1'];
  for(const patch of patches){const c=structuredClone(f.chunks[0]);patch(c);await reject(f,stageWrites(f,c));variants++;}
  await fill(f);await finish(f);await assertCounts(f);return {cellForgeriesDenied:variants};
});
await record('V18','attributes reject missing seats and unapproved field overrides',async()=>{
  const f=await fixture({columns:11});await start(f);const c=f.chunks[0];await stage(f,c);let variants=0;
  for(let slot=0;slot<4;slot++) {
    const missing=structuredClone(c);missing.attributes.values[slot]=null;await reject(f,attributeWrites(f,missing));variants++;
    const bad=structuredClone(c);bad.attributes.values[slot].usable='true';await reject(f,attributeWrites(f,bad));variants++;
  }
  for(const [key,value] of Object.entries({seatId:randomUUID(),sectionId:randomUUID(),lineId:randomUUID(),numberingMode:'manual',prefix:'forged',number:1,category:'invented',reservedLabel:0,displayOrder:-1,extra:true,
    emergencyChange:{kind:'add',reason:'   '}})) {
    const bad=structuredClone(c);bad.attributes.values[0][key]=value;await reject(f,attributeWrites(f,bad));variants++;
  }
  for(const patch of [a=>a.values.pop(),a=>a.row=1,a=>a.startColumn=1,a=>a.extra=true]) {const bad=structuredClone(c);patch(bad.attributes);await reject(f,attributeWrites(f,bad));variants++;}
  assert.deepEqual(data(await get(f,'chunks/0-0')),c.value);assert.equal((await get(f,'attributes/0-0')).status,404);
  await stageAttributes(f,c);await consume(f);await fill(f);await finish(f);await assertCounts(f);return {attributeForgeriesDenied:variants,cellSourcePreserved:true};
});
await record('V19','prepared fragments stay private and ingestion is atomic',async()=>{
  const f=await fixture();await start(f);const c=f.chunks[0],o=ingestion(f),w=ingestWrites(f,o);
  await reject(f,attributeWrites(f,c));await reject(f,[...stageWrites(f,c),...attributeWrites(f,c)]);assert.equal((await get(f,'chunks/0-0')).status,404);
  await stage(f,c);assert.equal(data(await get(f,'head/current')).cursor,0);await reject(f,w);denied(await get(f,'chunks/0-0',f.reader.token));
  await stageAttributes(f,c);denied(await get(f,'attributes/0-0',f.reader.token));denied(await get(f,'head/current',f.reader.token));
  await reject(f,[w[0]]);await reject(f,[w[1]]);await consume(f,o);await fill(f);const end=finishWrites(f,completion(f));await reject(f,[end[0]]);await reject(f,[end[1]]);
  await finish(f);await assertCounts(f);ok(await get(f,'chunks/0-0',f.reader.token));ok(await get(f,'attributes/0-0',f.reader.token));
  await reject(f,stageWrites(f,c));await reject(f,attributeWrites(f,c));await reject(f,[update(f,'attributes/0-0',c.attributes,undefined,true)]);
  denied(await commit(f,[{delete:name(f,'chunks/0-0')}]));denied(await commit(f,[{delete:name(f,'attributes/0-0')}]));
  return {missingAttributesBlocksIngestion:true,preparedDataPrivate:true,ingestionAndFinalHalfWritesDenied:4,sourceImmutable:true};
});
await record('V20','cross-fragment identity and consumption conflicts cannot enter counters',async()=>{
  const modes=['cellId','seatId','numberValue','lineIdReuse'];
  for(const mode of modes){const f=await fixture({columns:11});await start(f);await ingest(f);const c=structuredClone(f.chunks[1]),first=f.chunks[0].value;
    if(mode==='cellId'){c.value.cells[0].cellId=first.cells[0].cellId;c.value.cellIds[0]=first.cellIds[0];}
    if(mode==='seatId')c.value.cells[0].seatId=first.cells[0].seatId;
    if(mode==='numberValue'){c.value.cells[0].numberValue=first.cells[0].numberValue;c.value.numberKeys[0]=first.numberKeys[0];}
    if(mode==='lineIdReuse'){c.value.cells[0].cellId=f.model.section.lineSettings[0].lineId;c.value.cellIds[0]=c.value.cells[0].cellId;}
    await stage(f,c);await stageAttributes(f,c);await reject(f,ingestWrites(f,ingestion(f,c)));denied(await get(f,'chunks/'+c.id,f.reader.token));await reject(f,finishWrites(f,completion(f)));
  }
  return {crossFragmentConflictsDeniedAtIngestion:4,privateInvalidPreparationNotPublished:true,abortOrRebuildNotImplemented:true};
});
await record('V21','ledger membership and initial head cannot be forged',async()=>{
  const f=await fixture({columns:11});const initial=startWrites(f);await reject(f,[initial[0]]);await reject(f,[initial[1]]);
  await reject(f,startWrites(f,{...f.head,rowCounts:{0:1}}));await start(f);await ingest(f);const o=ingestion(f);await stage(f,o.chunk);await stageAttributes(f,o.chunk);const w=ingestWrites(f,o);
  for(const mode of ['missing','extra','changed','removed','false']) {
    const reg=structuredClone(o.registry),key=o.numbers[0],old=Object.keys(f.registry.usedNumbers)[0];
    if(mode==='missing')delete reg.usedNumbers[key];if(mode==='extra')reg.usedNumbers.invented=true;if(mode==='changed')reg.usedNumbers[old]=false;if(mode==='removed')delete reg.usedNumbers[old];if(mode==='false')reg.usedNumbers[key]=false;
    await reject(f,[w[0],update(f,'idRegistry/current',reg,undefined,true)]);
  }
  for(const patch of [{cursor:f.head.cursor},{nonEmptyCount:0},{rowCounts:{0:0}},{columnCounts:{...o.after.columnCounts,99:1}},{rows:99}])await reject(f,[update(f,'head/current',{...o.after,...patch},undefined,true),w[1]]);
  await consume(f,o);await fill(f);await finish(f);await assertCounts(f);denied(await get(f,'idRegistry/current',f.reader.token));return {initialHalfWritesDenied:2,ledgerForgeriesDenied:5,counterForgeriesDenied:5};
});
await record('V22','lost preparation, ingestion and final responses can be queried',async()=>{
  const f=await fixture({columns:11});await start(f);const c=f.chunks[0];await stage(f,c);assert.deepEqual(data(await get(f,'chunks/0-0',f.owner.token)),c.value);await reject(f,stageWrites(f,c),f.owner.token,createConflict);
  await stageAttributes(f,c);assert.deepEqual(data(await get(f,'attributes/0-0',f.owner.token)),c.attributes);await reject(f,attributeWrites(f,c),f.owner.token,createConflict);const o=ingestion(f);await consume(f,o);
  f.head=data(await get(f,'head/current',f.owner.token));f.registry=data(await get(f,'idRegistry/current',f.owner.token));assert.equal(f.head.lastChunk,c.id);await reject(f,ingestWrites(f,o));
  await fill(f);const end=completion(f);await finish(f,end);assert.deepEqual(data(await get(f,'events/'+end.id,f.owner.token)),end.history);await reject(f,finishWrites(f,end));await assertCounts(f);
  return {savedFragmentsQueryable:true,progressResumed:true,duplicateIngestionAndFinishDenied:true,browserOutboxNotImplemented:true};
});
await record('V23','parallel creation and ingestion allow one winner and control changes stop continuation',async()=>{
  const f=await fixture();await start(f);const c=f.chunks[0],source=stageWrites(f,c);const created=await Promise.all([commit(f,source),commit(f,source,f.other.token)]);assert.equal(created.filter(x=>x.status===200).length,1);createConflict(created.find(x=>x.status!==200));
  await stageAttributes(f,c);const o=ingestion(f),w=ingestWrites(f,o),results=await Promise.all([commit(f,w),commit(f,w,f.other.token)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,403]);f.head=o.after;f.registry=o.registry;await fill(f);await finish(f);await assertCounts(f);
  for(const phase of ['layout','attributes','consume','finish']){const s=await fixture();await start(s);const first=s.chunks[0];if(phase!=='layout')await stage(s,first);if(['consume','finish'].includes(phase))await stageAttributes(s,first);if(phase==='finish'){await consume(s);await fill(s);}
    const writes=phase==='layout'?stageWrites(s,first):phase==='attributes'?attributeWrites(s,first):phase==='consume'?ingestWrites(s,ingestion(s)):finishWrites(s,completion(s));
    await seed(s,'control/current',{revision:2,firstReceptionStartedAt:null});await reject(s,writes);
  }
  return {parallelSourceWinners:1,parallelIngestionWinners:1,controlChangePhasesDenied:4};
});
await record('V24','revocation blocks every preparation and publication phase',async()=>{
  for(const phase of ['start','layout','attributes','consume','finish'])for(const mutation of ['role','device','session','preparedRoleRevision']){
    const f=await fixture();if(phase!=='start')await start(f);if(['attributes','consume','finish'].includes(phase))await stage(f,f.chunks[0]);if(['consume','finish'].includes(phase))await stageAttributes(f,f.chunks[0]);if(phase==='finish'){await consume(f);await fill(f);}
    const writes=phase==='start'?startWrites(f):phase==='layout'?stageWrites(f,f.chunks[0]):phase==='attributes'?attributeWrites(f,f.chunks[0]):phase==='consume'?ingestWrites(f,ingestion(f)):finishWrites(f,completion(f));
    if(mutation==='role')await seed(f,'roles/FAKE-manager',{active:true,role:'receptionist',revision:2});
    if(mutation==='device')await seed(f,'devices/'+f.owner.uid,{deviceUid:f.owner.uid,humanUid:'FAKE-manager',active:false,preparedRoleRevision:1});
    if(mutation==='session')await seed(f,'sessions/'+f.owner.uid,{humanUid:'FAKE-manager',active:true,emailVerified:true,expiresAt:{$timestamp:'2000-01-01T00:00:00Z'}});
    if(mutation==='preparedRoleRevision')await seed(f,'roles/FAKE-manager',{active:true,role:'owner',revision:2});await reject(f,writes);
  }
  const f=await fixture(),other=await fixture();await reject(f,startWrites(f),f.reader.token);await reject(f,startWrites(f),other.owner.token);await reject(f,startWrites(f),null);
  const deputy=await fixture({role:'deputy'});await initialize(deputy);await publishSlide(deputy);return {phaseRevocationsDenied:20,readerCrossShowAnonymousDenied:true,deputyAllowed:true};
});
await record('V25','occupied boundaries and short fragments preserve the grid',async()=>{
  for(const direction of Object.keys(deltas))for(const block of ['seat','gap','space','aisle']){const f=await fixture({direction,block});await initialize(f);await assertCounts(f);await reject(f,slideWrites(f,movement(f)));}
  for(const [rows,columns] of [[1,1],[1,4],[1,5],[2,11]]){const f=await fixture({rows,columns,empty:true});await initialize(f);await assertCounts(f);await reject(f,slideWrites(f,movement(f)));}
  return {blockedBoundaryVariants:16,shortDimensions:[[1,1],[1,4],[1,5],[2,11]],emptyGridSlideDenied:true};
});
await record('V26','custom starts, prefixes and rich Seat metadata survive restoration and slide',async()=>{
  const f=await fixture({columns:11,rich:true,startNumber:11,prefix:'架空列/'});await initialize(f);await assertCounts(f);await publishSlide(f);await assertCounts(f);assert(!Object.hasOwn(data(await get(f,'events/'+f.head.operationId)),'reason'));
  return {customStartAndPrefix:true,reservedAndEmergencyMetadataPreserved:true,slideReasonAbsent:true};
});
await record('V27','930 cells are initialized with fewer writes and projected before two-write sliding',async()=>{
  const f=await fixture({large:true});await initialize(f);const restored=await assertCounts(f),initialization=structuredClone(f.counts),ledger=data(await get(f,'idRegistry/current'));
  assert.equal(Object.keys(ledger.usedIds).length,1861);assert.equal(Object.keys(ledger.usedNumbers).length,900);const registryJsonBytes=Buffer.byteLength(JSON.stringify(ledger)),headJsonBytes=Buffer.byteLength(JSON.stringify(f.head));
  resetCounts(f);await publishSlide(f);assert.deepEqual(projectView(restored,f.head,context),slide(f.model,{direction:'right',amount:1},context).after);await assertCounts(f);assert.deepEqual(data(await get(f,'idRegistry/current')),ledger);
  assert.equal(initialization.requests,722);assert.equal(initialization.writes,964);assert.equal(f.counts.requests,1);assert.equal(f.counts.writes,2);
  return {cells:930,seats:900,chunks:240,attributeFragments:240,assignedReferences:500,initialization,slide:f.counts,registryEntries:1861,consumedNumberEntries:900,registryJsonBytes,headJsonBytes,sourceAndLedgersSeededByAdmin:false,prerequisiteAndVerificationIOExcluded:true};
});
await record('V28','codec rejects unsupported or inconsistent logical Seats and attributes require actual seats',async()=>{
  const f=await fixture(),bad=structuredClone(f.model);bad.seats[0].lineId=randomUUID();assert.throws(()=>pack(bad,4,context),/invalid seat reference/);
  const manual=structuredClone(f.model);Object.assign(manual.seats[0],{numberingMode:'manual',manualNumber:'架空手入力'});assert.throws(()=>pack(manual,4,context),/manual seats/);
  const unknown=structuredClone(f.model);unknown.seats[0].extra=true;assert.throws(()=>pack(unknown,4,context),/unknown Seat field/);
  const gap=await fixture({columns:11});await start(gap);while(gap.head.cursor<gap.head.columns)await ingest(gap);const c=ingestion(gap).chunk;await stage(gap,c);
  for(const slot of [1,2]){const bad=structuredClone(c);bad.attributes.values[slot]={category:'general',usable:true};await reject(gap,attributeWrites(gap,bad));}
  await stageAttributes(gap,c);await consume(gap);await fill(gap);await finish(gap);await assertCounts(gap);return {invalidLogicalSeatRejected:true,manualSeatExplicitlyUnsupported:true,unknownFieldNotSilentlyDropped:true,nonSeatAttributesDenied:2};
});
await record('V29','trusted line data still does not prove the initial numbering order',async()=>{
  const f=await fixture({columns:11});await start(f);const c=structuredClone(f.chunks[0]);[c.value.cells[0].numberValue,c.value.cells[1].numberValue]=[c.value.cells[1].numberValue,c.value.cells[0].numberValue];[c.value.numberKeys[0],c.value.numberKeys[1]]=[c.value.numberKeys[1],c.value.numberKeys[0]];
  await ingest(f,ingestion(f,c));await fill(f);await finish(f);assert.equal(data(await get(f,'chunks/0-0')).cells[0].numberValue,2);
  return {knownLimitation:'line catalog initialization and initial numbering order remain unproven',uniqueInRangeButReorderedNumbersAccepted:true,productionAdoptionBlocked:true};
});
await record('V30','four rich cells pass but five reach the cell-validation expression limit',async()=>{
  const four=await fixture({columns:11,rich:true});await initialize(four);await assertCounts(four);
  const five=await fixture({columns:11,chunkSize:5,rich:true});await start(five);const before=data(await get(five,'head/current')),ids=data(await get(five,'idRegistry/current')),r=await commit(five,stageWrites(five,five.chunks[0]));denied(r);assert.match(r.body.error.message,/maximum of 1000 expressions/);
  assert.deepEqual(data(await get(five,'head/current')),before);assert.deepEqual(data(await get(five,'idRegistry/current')),ids);assert.equal((await get(five,'chunks/0-0')).status,404);
  return {richFourCellFragmentsPassed:true,fiveCellCandidateDeniedByExpressionLimit:true,noPartialCounterOrSourceWrite:true,productionLimitNotEstablished:true};
});
const endSourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,await hash(p)])));assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({project,runtime:process.version,executedAt:new Date().toISOString(),hashLineEndings:'LF',sourceHashes,endSourceHashes,
  scope:'single-section four-cell layout and attribute preparation, private immutable fragments, atomic counter and identity/number ledger ingestion, logical automatic Seat restoration and offset sliding; not line catalog initialization or numbering order, manual seats, full edits, multiple sections, abort/cleanup, formal auth, QR, SDK, IndexedDB or devices',reports},null,2)+'\n');
console.log(`${reports.length} scenarios executed`);
