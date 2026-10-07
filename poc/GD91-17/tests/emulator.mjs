import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend, validate } from '../../GD91-07/planner.mjs';
import { pack, unpack } from '../../GD91-16/codec.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { project as projectView, initialHead } from '../../GD91-10/projection.mjs';

const project = 'demo-concert-seat-gd91-17';
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9191');
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const sources = ['../firestore.rules', '../firebase.json', '../../GD91-16/codec.mjs', 'emulator.mjs', '../../GD91-10/projection.mjs', '../../GD91-07/planner.mjs', '../../GD91-08/slide.mjs'];
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
const common = new Set(['devices','sessions','roles','control','seatReferences','selection']);
const relative = (f, suffix) => 'splitSeatShows/'+f.show+'/'+(common.has(suffix.split('/')[0]) ? '' : 'generations/'+f.generation+'/')+suffix;
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
async function fixture({ axis = 'horizontal', order = 'forward', direction = 'right', rows = 4, columns = 4, large = false, empty = false, block = null, role = 'owner', chunkSize = 4, rich = false, startNumber = 1, prefix, numberSpan=2 } = {}) {
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
  f.head = { ...f.expected, rowCounts: {}, columnCounts: {}, nonEmptyCount: 0, sourceRevision: 0, revision: 0, status: 'building', cursor: 0, lastChunk: '', controlRevision: 1, initializationId: randomUUID(), chunkSize, numberCursors:{}, numberSpan };
  f.generation = f.head.initializationId; f.blankHead = structuredClone(f.head); f.selection = {revision:0,activeGeneration:'',publishedGeneration:'',operationId:''};
  f.registry = { initializationId: f.head.initializationId, cursor: 0, lineCursor:0, usedIds: {[f.head.sectionId]:true}, usedNumbers: {} };
  f.chunks = pack(m, chunkSize, context); f.numberedChunks=new Set();
  const writes = [update(f, 'control/current', { revision: 1, firstReceptionStartedAt: null }), update(f, 'roles/FAKE-manager', { active: true, role, revision: 1 }), update(f, 'roles/FAKE-reader', { active: true, role: 'receptionist', revision: 1 })];
  for (const [a, humanUid] of [[f.owner, 'FAKE-manager'], [f.other, 'FAKE-manager'], [f.reader, 'FAKE-reader']]) writes.push(
    update(f, `devices/${a.uid}`, { deviceUid: a.uid, humanUid, active: true, preparedRoleRevision: 1 }),
    update(f, `sessions/${a.uid}`, { humanUid, active: true, emailVerified: true, expiresAt: { $timestamp: new Date(Date.now() + 3600000).toISOString() } }));
  f.catalog={sectionId:f.head.sectionId,initializationId:f.generation,cursor:0,lines:{},lineIds:[]};
  writes.push(update(f,'seatReferences/current',{assignments:m.assignments,ticketRefs:m.ticketRefs,receptionRefs:m.receptionRefs}));
  ok(await commit(f, writes, 'owner')); return f;
}
const startSelection = f => ({revision:f.selection.revision+1,activeGeneration:f.generation,publishedGeneration:'',operationId:f.generation});
function startWrites(f, head = f.head, registry = f.registry) {
  return [update(f, 'head/current', head, undefined, false),update(f,'selection/current',startSelection(f),undefined,f.selection.revision>0),update(f,'lineCatalog/current',f.catalog,undefined,false)];
}
async function start(f) { ok(await commit(f, startWrites(f))); f.selection=startSelection(f); await fillCatalog(f); }
function lineOperation(f,line=f.model.section.lineSettings[f.catalog.cursor]) {
  return {catalog:{...structuredClone(f.catalog),cursor:f.catalog.cursor+1,lines:{...f.catalog.lines,[f.catalog.cursor]:structuredClone(line)},lineIds:[...f.catalog.lineIds,line.lineId]},registry:{...structuredClone(f.registry),lineCursor:f.registry.lineCursor+1,usedIds:{...f.registry.usedIds,[line.lineId]:true}}};
}
function lineWrites(f,o) {return [update(f,'lineCatalog/current',o.catalog,undefined,true),update(f,'idRegistry/current',o.registry,undefined,f.catalog.cursor>0)];}
async function appendLine(f,o=lineOperation(f)) {ok(await commit(f,lineWrites(f,o)));f.catalog=o.catalog;f.registry=o.registry;}
async function fillCatalog(f) {while(f.catalog.cursor<f.model.section.lineSettings.length)await appendLine(f);}
async function startOnly(f) {ok(await commit(f,startWrites(f)));f.selection=startSelection(f);}
function ingestion(f, chunk = f.chunks.find(c => c.value.row * f.head.columns + c.value.startColumn === f.head.cursor)) {
  assert(chunk); const after = structuredClone(f.head), c = chunk.value;
  after.numberCursors=structuredClone(chunk.numbers.numberCursors); after.cursor += c.cells.length; after.lastChunk = chunk.id;
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
  const keys = ['cursor', 'lastChunk', 'nonEmptyCount', 'rowCounts', 'columnCounts', 'numberCursors'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true),
    update(f, 'idRegistry/current', { cursor: o.registry.cursor, usedIds: Object.fromEntries(o.ids.map(id => [id,true])), usedNumbers: Object.fromEntries(o.numbers.map(key=>[key,true])) },
      ['cursor', ...o.ids.map(id=>'usedIds.`'+id+'`'), ...o.numbers.map(key=>'usedNumbers.`'+key+'`')], true)];
}
async function stage(f, chunk) { ok(await commit(f, stageWrites(f, chunk))); }
async function stageAttributes(f, chunk) { ok(await commit(f, attributeWrites(f, chunk))); }
function numberWrites(f,c,progress=0) {
 const target=Math.min(progress+f.head.numberSpan,c.value.cells.length),map=structuredClone(f.head.numberCursors),delta=f.head.seatOrder==='forward'?1:-1;
 for(let j=0;j<target;j++){const cell=c.value.cells[j],key=String(f.head.axis==='horizontal'?cell.row:cell.column);map[key]=c.numbers.steps[j];}
 return [update(f,'numberProofs/'+c.id,{row:c.value.row,startColumn:c.value.startColumn,progress:target,steps:c.numbers.steps.slice(0,target),numberCursors:map},undefined,progress>0)];
}
async function stageNumbers(f,c) {for(let progress=0;progress<c.value.cells.length;progress+=f.head.numberSpan)ok(await commit(f,numberWrites(f,c,progress)));f.numberedChunks.add(c.id);}
async function ensureNumbers(f,c) {if(!f.numberedChunks.has(c.id))await stageNumbers(f,c);}
async function consume(f, o = ingestion(f)) { ok(await commit(f, ingestWrites(f, o))); f.head=o.after; f.registry=o.registry; }
async function ingest(f, o = ingestion(f)) { await stage(f,o.chunk); await stageAttributes(f,o.chunk);await ensureNumbers(f,o.chunk); await consume(f,o); }
async function fill(f) { await fillCatalog(f); while (f.head.cursor < f.head.rows * f.head.columns) await ingest(f); }
function completion(f) {
  const id = randomUUID(); return { id, after: { ...f.head, status: 'countReady', revision: 1, sourceRevision: 1, operationId: id },
    history: { kind: 'initialCounterProof', deviceUid: f.owner.uid, initializationId: f.head.initializationId, controlRevision: 1 },selection:{revision:f.selection.revision+1,activeGeneration:'',publishedGeneration:f.generation,operationId:id} };
}
function finishWrites(f, o) {
  const keys = ['status', 'revision', 'sourceRevision', 'operationId'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true), update(f, `events/${o.id}`, o.history, undefined, false),update(f,'selection/current',o.selection,undefined,true)];
}
async function finish(f, o = completion(f)) { ok(await commit(f, finishWrites(f, o))); f.head = o.after; f.selection = o.selection; }
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
  const beforeIds = await get(f, 'idRegistry/current'), before = await get(f, 'head/current'), beforeSelection=await get(f,'selection/current'); check(await commit(f, writes, token)); const afterSelection=await get(f,'selection/current');assert.equal(afterSelection.status,beforeSelection.status);if(beforeSelection.status===200)assert.deepEqual(data(afterSelection),data(beforeSelection)); const after = await get(f, 'head/current');
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
    return {axis,order,direction,initialization,slide:f.counts,sourceAndLedgersSeededByAdmin:false,trustedCatalogSeededByAdmin:false};
  });
}
await record('V17','cell fragment rejects malformed positions, IDs and number values',async()=>{
  const f=await fixture({columns:11});await start(f);let variants=0;
  for(let slot=0;slot<4;slot++) for(const field of ['kind','row','column','seatId','numberValue']) {
    const c=structuredClone(f.chunks[0]);c.value.cells[slot][field]=field==='kind'?'unknown':field==='seatId'?'':-1;
    await reject(f,stageWrites(f,c));assert.equal((await get(f,'chunks/0-0')).status,404);variants++;
  }
  const patches=[c=>c.value.cellIds[0]=randomUUID(),c=>{c.value.cells[1].cellId=c.value.cells[0].cellId;c.value.cellIds[1]=c.value.cellIds[0];},
    c=>c.value.cells.pop(),c=>c.value.cells[0].extra=true,c=>c.value.extra=true,c=>c.id='0-1'];
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
  await stageAttributes(f,c);await ensureNumbers(f,c);await consume(f);await fill(f);await finish(f);await assertCounts(f);return {attributeForgeriesDenied:variants,cellSourcePreserved:true};
});
await record('V19','prepared fragments stay private and ingestion is atomic',async()=>{
  const f=await fixture();await start(f);const c=f.chunks[0],o=ingestion(f),w=ingestWrites(f,o);
  await reject(f,attributeWrites(f,c));await reject(f,[...stageWrites(f,c),...attributeWrites(f,c)]);assert.equal((await get(f,'chunks/0-0')).status,404);
  await stage(f,c);await ensureNumbers(f,c);assert.equal(data(await get(f,'head/current')).cursor,0);await reject(f,w);denied(await get(f,'chunks/0-0',f.reader.token));
  await stageAttributes(f,c);await ensureNumbers(f,c);denied(await get(f,'attributes/0-0',f.reader.token));denied(await get(f,'head/current',f.reader.token));
  await reject(f,[w[0]]);await reject(f,[w[1]]);await consume(f,o);await fill(f);const end=finishWrites(f,completion(f));for(const subset of [[end[0]],[end[1]],[end[2]],[end[0],end[1]],[end[0],end[2]],[end[1],end[2]]])await reject(f,subset);
  await finish(f);await assertCounts(f);ok(await get(f,'chunks/0-0',f.reader.token));ok(await get(f,'attributes/0-0',f.reader.token));
  await reject(f,stageWrites(f,c));await reject(f,attributeWrites(f,c));await reject(f,[update(f,'attributes/0-0',c.attributes,undefined,true)]);
  denied(await commit(f,[{delete:name(f,'chunks/0-0')}]));denied(await commit(f,[{delete:name(f,'attributes/0-0')}]));
  return {missingAttributesBlocksIngestion:true,preparedDataPrivate:true,ingestionAndFinalHalfWritesDenied:8,sourceImmutable:true};
});
await record('V20','cross-fragment identity and consumption conflicts cannot enter counters',async()=>{
  const modes=['cellId','seatId','numberValue','lineIdReuse'];
  for(const mode of modes){const f=await fixture({columns:11});await start(f);await ingest(f);const c=structuredClone(f.chunks[1]),first=f.chunks[0].value;
    if(mode==='cellId'){c.value.cells[0].cellId=first.cells[0].cellId;c.value.cellIds[0]=first.cellIds[0];}
    if(mode==='seatId')c.value.cells[0].seatId=first.cells[0].seatId;
    if(mode==='numberValue'){c.value.cells[0].numberValue=first.cells[0].numberValue;c.value.numberKeys[0]=first.numberKeys[0];}
    if(mode==='lineIdReuse'){c.value.cells[0].cellId=f.model.section.lineSettings[0].lineId;c.value.cellIds[0]=c.value.cells[0].cellId;}
    await stage(f,c);if(mode==='numberValue'){await stageAttributes(f,c);await reject(f,numberWrites(f,c));}else{await stageAttributes(f,c);await ensureNumbers(f,c);await reject(f,ingestWrites(f,ingestion(f,c)));}denied(await get(f,'chunks/'+c.id,f.reader.token));await reject(f,finishWrites(f,completion(f)));
  }
  return {crossFragmentConflictsDenied:4,privateInvalidPreparationNotPublished:true,thisScenarioDoesNotRebuild:true};
});
await record('V21','ledger membership and initial head cannot be forged',async()=>{
  const f=await fixture({columns:11});const initial=startWrites(f);for(let mask=1;mask<7;mask++)await reject(f,initial.filter((_,j)=>mask&(1<<j)));
  await reject(f,startWrites(f,{...f.head,rowCounts:{0:1}}));await start(f);await ingest(f);const o=ingestion(f);await stage(f,o.chunk);await stageAttributes(f,o.chunk);await ensureNumbers(f,o.chunk);const w=ingestWrites(f,o);
  for(const mode of ['missing','extra','changed','removed','false']) {
    const reg=structuredClone(o.registry),key=o.numbers[0],old=Object.keys(f.registry.usedNumbers)[0];
    if(mode==='missing')delete reg.usedNumbers[key];if(mode==='extra')reg.usedNumbers.invented=true;if(mode==='changed')reg.usedNumbers[old]=false;if(mode==='removed')delete reg.usedNumbers[old];if(mode==='false')reg.usedNumbers[key]=false;
    await reject(f,[w[0],update(f,'idRegistry/current',reg,undefined,true)]);
  }
  for(const patch of [{cursor:f.head.cursor},{nonEmptyCount:0},{rowCounts:{0:0}},{columnCounts:{...o.after.columnCounts,99:1}},{rows:99}])await reject(f,[update(f,'head/current',{...o.after,...patch},undefined,true),w[1]]);
  await consume(f,o);await fill(f);await finish(f);await assertCounts(f);denied(await get(f,'idRegistry/current',f.reader.token));return {initialHalfWritesDenied:6,ledgerForgeriesDenied:5,counterForgeriesDenied:5};
});
await record('V22','lost preparation, ingestion and final responses can be queried',async()=>{
  const f=await fixture({columns:11});await start(f);const c=f.chunks[0];await stage(f,c);assert.deepEqual(data(await get(f,'chunks/0-0',f.owner.token)),c.value);await reject(f,stageWrites(f,c),f.owner.token,createConflict);
  await stageAttributes(f,c);await ensureNumbers(f,c);assert.deepEqual(data(await get(f,'attributes/0-0',f.owner.token)),c.attributes);await reject(f,attributeWrites(f,c),f.owner.token,createConflict);const o=ingestion(f);await consume(f,o);
  f.head=data(await get(f,'head/current',f.owner.token));f.registry=data(await get(f,'idRegistry/current',f.owner.token));assert.equal(f.head.lastChunk,c.id);await reject(f,ingestWrites(f,o));
  await fill(f);const end=completion(f);await finish(f,end);assert.deepEqual(data(await get(f,'events/'+end.id,f.owner.token)),end.history);await reject(f,finishWrites(f,end));await assertCounts(f);
  return {savedFragmentsQueryable:true,progressResumed:true,duplicateIngestionAndFinishDenied:true,browserOutboxNotImplemented:true};
});
await record('V23','parallel creation and ingestion allow one winner and control changes stop continuation',async()=>{
  const f=await fixture();await start(f);const c=f.chunks[0],source=stageWrites(f,c);const created=await Promise.all([commit(f,source),commit(f,source,f.other.token)]);assert.equal(created.filter(x=>x.status===200).length,1);createConflict(created.find(x=>x.status!==200));
  await stageAttributes(f,c);await ensureNumbers(f,c);const o=ingestion(f),w=ingestWrites(f,o),results=await Promise.all([commit(f,w),commit(f,w,f.other.token)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,403]);f.head=o.after;f.registry=o.registry;await fill(f);await finish(f);await assertCounts(f);
  for(const phase of ['layout','attributes','consume','finish']){const s=await fixture();await start(s);const first=s.chunks[0];if(phase!=='layout')await stage(s,first);if(['consume','finish'].includes(phase)){await stageAttributes(s,first);await ensureNumbers(s,first);}if(phase==='finish'){await consume(s);await fill(s);}
    const writes=phase==='layout'?stageWrites(s,first):phase==='attributes'?attributeWrites(s,first):phase==='consume'?ingestWrites(s,ingestion(s)):finishWrites(s,completion(s));
    await seed(s,'control/current',{revision:2,firstReceptionStartedAt:null});await reject(s,writes);
  }
  return {parallelSourceWinners:1,parallelIngestionWinners:1,controlChangePhasesDenied:4};
});
await record('V24','revocation blocks every preparation and publication phase',async()=>{
  for(const phase of ['start','layout','attributes','consume','finish'])for(const mutation of ['role','device','session','preparedRoleRevision']){
    const f=await fixture();if(phase!=='start')await start(f);if(['attributes','consume','finish'].includes(phase))await stage(f,f.chunks[0]);if(['consume','finish'].includes(phase)){await stageAttributes(f,f.chunks[0]);await ensureNumbers(f,f.chunks[0]);}if(phase==='finish'){await consume(f);await fill(f);}
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
  assert.equal(initialization.requests,1232);assert.equal(initialization.writes,1506);assert.equal(f.counts.requests,1);assert.equal(f.counts.writes,2);
  return {cells:930,seats:900,chunks:240,attributeFragments:240,assignedReferences:500,initialization,slide:f.counts,registryEntries:1861,consumedNumberEntries:900,registryJsonBytes,headJsonBytes,sourceAndLedgersSeededByAdmin:false,prerequisiteAndVerificationIOExcluded:true};
});
await record('V28','codec rejects unsupported or inconsistent logical Seats and attributes require actual seats',async()=>{
  const f=await fixture(),bad=structuredClone(f.model);bad.seats[0].lineId=randomUUID();assert.throws(()=>pack(bad,4,context),/invalid seat reference/);
  const manual=structuredClone(f.model);Object.assign(manual.seats[0],{numberingMode:'manual',manualNumber:'架空手入力'});assert.throws(()=>pack(manual,4,context),/manual seats/);
  const unknown=structuredClone(f.model);unknown.seats[0].extra=true;assert.throws(()=>pack(unknown,4,context),/unknown Seat field/);
  const gap=await fixture({columns:11});await start(gap);while(gap.head.cursor<gap.head.columns)await ingest(gap);const c=ingestion(gap).chunk;await stage(gap,c);
  for(const slot of [1,2]){const bad=structuredClone(c);bad.attributes.values[slot]={category:'general',usable:true};await reject(gap,attributeWrites(gap,bad));}
  await stageAttributes(gap,c);await ensureNumbers(gap,c);await consume(gap);await fill(gap);await finish(gap);await assertCounts(gap);return {invalidLogicalSeatRejected:true,manualSeatExplicitlyUnsupported:true,unknownFieldNotSilentlyDropped:true,nonSeatAttributesDenied:2};
});
await record('V29','reordered unique in-range numbers are rejected before ingestion',async()=>{
 const f=await fixture({columns:11});await start(f);const c=structuredClone(f.chunks[0]);[c.value.cells[0].numberValue,c.value.cells[1].numberValue]=[c.value.cells[1].numberValue,c.value.cells[0].numberValue];[c.value.numberKeys[0],c.value.numberKeys[1]]=[c.value.numberKeys[1],c.value.numberKeys[0]];
 await stage(f,c);await stageAttributes(f,c);await reject(f,numberWrites(f,c));await reject(f,ingestWrites(f,ingestion(f,c)));denied(await get(f,'chunks/0-0',f.reader.token));return {uniqueInRangeButReorderedNumbersDenied:true,invalidPreparationPrivate:true,productionAdoptionStillBlocked:true};
});
await record('V30','four rich cells pass and five are compared without defining a product limit',async()=>{
 const four=await fixture({columns:11,rich:true});await initialize(four);await assertCounts(four);const five=await fixture({columns:11,chunkSize:5,rich:true});await start(five);const before=data(await get(five,'head/current'));let deniedAt=null;
 for(const [phase,writes] of [['layout',stageWrites(five,five.chunks[0])],['attributes',attributeWrites(five,five.chunks[0])],['numbers',numberWrites(five,five.chunks[0])]]){const result=await commit(five,writes);if(result.status!==200){denied(result);assert.match(result.body.error.message,/maximum of 1000 expressions/);deniedAt=phase;break;}}
 assert.deepEqual(data(await get(five,'head/current')),before);return {richFourCellFragmentsPassed:true,fiveCellComparison:{deniedAt},productionLimitNotEstablished:true};
});
function abortOperation(f, who=f.owner, controlRevision=1) {
  const id=randomUUID();return {id,after:{...f.head,status:'aborted',revision:f.head.revision+1,operationId:id},
    selection:{revision:f.selection.revision+1,activeGeneration:'',publishedGeneration:'',operationId:id},
    history:{kind:'abortInitial',deviceUid:who.uid,initializationId:f.generation,controlRevision}};
}
function abortWrites(f,o) {const keys=['status','revision','operationId'];return [update(f,'head/current',Object.fromEntries(keys.map(k=>[k,o.after[k]])),keys,true),update(f,'events/'+o.id,o.history,undefined,false),update(f,'selection/current',o.selection,undefined,true)];}
async function cancel(f,o=abortOperation(f)) {ok(await commit(f,abortWrites(f,o)));f.head=o.after;f.selection=o.selection;return o;}
function newAttempt(f) {
  f.numberedChunks=new Set();f.generation=randomUUID();f.head={...structuredClone(f.blankHead),initializationId:f.generation};
  f.registry={initializationId:f.generation,cursor:0,lineCursor:0,usedIds:{[f.head.sectionId]:true},usedNumbers:{}};f.catalog={sectionId:f.head.sectionId,initializationId:f.generation,cursor:0,lines:{},lineIds:[]};
}
await record('V31','abort at five preparation phases is atomic and a fresh generation can finish',async()=>{
  for(const phase of ['empty','layout','attributes','ingested','complete']) {
    const f=await fixture({columns:11});await start(f);if(phase==='layout')await stage(f,f.chunks[0]);if(phase==='attributes'){await stage(f,f.chunks[0]);await stageAttributes(f,f.chunks[0]);}
    if(phase==='ingested')await ingest(f);if(phase==='complete')await fill(f);const o=abortOperation(f),w=abortWrites(f,o);
    for(const subset of [[w[0]],[w[1]],[w[2]],[w[0],w[1]],[w[0],w[2]],[w[1],w[2]]])await reject(f,subset);
    const old={...f};await cancel(f,o);assert.equal(data(await get(f,'head/current')).status,'aborted');denied(await get(f,'selection/current',f.reader.token));
    newAttempt(f);await initialize(f);await assertCounts(f);assert.equal(data(await get(old,'head/current')).status,'aborted');denied(await get(old,'head/current',f.reader.token));
  }
  return {abortPhases:5,partialAbortBatchesDenied:30,freshAttemptsRestored:true,oldDataNotDeleted:true};
});
await record('V32','an invalid private fragment can be abandoned and corrected with stable logical IDs',async()=>{
  const f=await fixture({columns:11});await start(f);await ingest(f);const c=structuredClone(f.chunks[1]);c.value.cells[0].seatId=f.chunks[0].value.cells[0].seatId;
  await stage(f,c);await stageAttributes(f,c);await ensureNumbers(f,c);await reject(f,ingestWrites(f,ingestion(f,c)));const old={...f};await cancel(f);
  const saved=data(await get(old,'chunks/'+c.id));newAttempt(f);await initialize(f);await assertCounts(f);assert.deepEqual(data(await get(old,'chunks/'+c.id)),saved);denied(await get(old,'chunks/'+c.id,f.reader.token));
  return {invalidPreparationCorrectedInNewGeneration:true,logicalIDsPreserved:true,oldPreparationRetainedPrivate:true,physicalCleanupNotImplemented:true};
});
await record('V33','lost abort and restart responses can be resolved by operation and generation IDs',async()=>{
  const f=await fixture();await start(f);await ingest(f);const o=abortOperation(f);await cancel(f,o);
  assert.deepEqual(data(await get(f,'events/'+o.id,f.owner.token)),o.history);assert.equal(data(await get(f,'selection/current',f.owner.token)).activeGeneration,'');await reject(f,abortWrites(f,o));
  const old={...f};newAttempt(f);await start(f);assert.equal(data(await get(f,'selection/current',f.owner.token)).activeGeneration,f.generation);assert.equal(data(await get(f,'head/current',f.owner.token)).initializationId,f.generation);
  await reject(f,startWrites(f),f.owner.token,createConflict);await reject(old,startWrites(old),old.owner.token,createConflict);await fill(f);await finish(f);await assertCounts(f);
  return {abortAndRestartQueryable:true,replayedOperationsNotApplied:true,browserOutboxNotImplemented:true};
});
await record('V34','ingestion racing with abort cannot publish or continue the abandoned generation',async()=>{
  const f=await fixture();await start(f);await stage(f,f.chunks[0]);await stageAttributes(f,f.chunks[0]);await ensureNumbers(f,f.chunks[0]);const o=ingestion(f),a=abortOperation(f,f.other);
  const [progress,aborted]=await Promise.all([commit(f,ingestWrites(f,o)),commit(f,abortWrites(f,a),f.other.token)]);ok(aborted);if(progress.status!==200)denied(progress);
  f.head=data(await get(f,'head/current'));f.registry=data(await get(f,'idRegistry/current'));f.selection=data(await get(f,'selection/current'));assert.equal(f.head.status,'aborted');assert.equal(f.selection.activeGeneration,'');
  await reject(f,ingestWrites(f,o));await reject(f,finishWrites(f,completion(f)));denied(await get(f,'head/current',f.reader.token));
  return {progressMayPrecedeAbort:progress.status===200,finalStatus:'aborted',noPublicationOrLateProgress:true};
});
await record('V35','final selection and abort racing allow exactly one winner',async()=>{
  const f=await fixture();await start(f);await fill(f);const end=completion(f),a=abortOperation(f,f.other),results=await Promise.all([commit(f,finishWrites(f,end)),commit(f,abortWrites(f,a),f.other.token)]);
  assert.equal(results.filter(r=>r.status===200).length,1);denied(results.find(r=>r.status!==200));const head=data(await get(f,'head/current')),selected=data(await get(f,'selection/current'));
  assert.equal(selected.activeGeneration,'');if(head.status==='countReady'){assert.equal(selected.publishedGeneration,f.generation);ok(await get(f,'head/current',f.reader.token));}else{assert.equal(head.status,'aborted');assert.equal(selected.publishedGeneration,'');denied(await get(f,'head/current',f.reader.token));}
  return {exactlyOneWinner:true,winner:head.status,partialPublicationAbsent:true};
});
await record('V36','delayed writes from an abandoned generation cannot affect its replacement',async()=>{
  const f=await fixture({columns:11});await start(f);await ingest(f);const old={...f},c=f.chunks[1],progress=ingestion(f,c),end=completion(f),a=abortOperation(f);await cancel(f,a);newAttempt(f);await start(f);
  const before=data(await get(f,'selection/current'));for(const writes of [stageWrites(old,c),attributeWrites(old,c),ingestWrites(old,progress),finishWrites(old,end),abortWrites(old,a)])await reject(old,writes);
  assert.deepEqual(data(await get(f,'selection/current')),before);assert.equal(data(await get(f,'head/current')).cursor,0);await fill(f);await finish(f);await assertCounts(f);denied(await get(old,'chunks/0-0',f.reader.token));denied(await get(old,'attributes/0-0',f.reader.token));
  return {delayedOperationKindsDenied:5,replacementUnchanged:true,abandonedGenerationNotReadableByReception:true};
});
await record('V37','abort requires current authorization and control but never cancels a selected result',async()=>{
  for(const mutation of ['role','device','session','preparedRoleRevision']) {
    const f=await fixture();await start(f);const o=abortOperation(f);
    if(mutation==='role')await seed(f,'roles/FAKE-manager',{active:true,role:'receptionist',revision:2});if(mutation==='device')await seed(f,'devices/'+f.owner.uid,{deviceUid:f.owner.uid,humanUid:'FAKE-manager',active:false,preparedRoleRevision:1});
    if(mutation==='session')await seed(f,'sessions/'+f.owner.uid,{humanUid:'FAKE-manager',active:true,emailVerified:true,expiresAt:{$timestamp:'2000-01-01T00:00:00Z'}});if(mutation==='preparedRoleRevision')await seed(f,'roles/FAKE-manager',{active:true,role:'owner',revision:2});await reject(f,abortWrites(f,o));
  }
  const f=await fixture(),other=await fixture();await start(f);const o=abortOperation(f);for(const token of [f.reader.token,other.owner.token,null])await reject(f,abortWrites(f,o),token);
  await seed(f,'control/current',{revision:2,firstReceptionStartedAt:null});await reject(f,abortWrites(f,o));await cancel(f,abortOperation(f,f.owner,2));
  const deputy=await fixture({role:'deputy'});await start(deputy);await cancel(deputy);const ready=await fixture();await initialize(ready);await reject(ready,abortWrites(ready,abortOperation(ready)));newAttempt(ready);await reject(ready,startWrites(ready));
  return {revocationsDenied:4,readerCrossShowAnonymousDenied:true,latestControlAbortAllowed:true,deputyAllowed:true,selectedResultCannotBeAbortedOrReinitialized:true};
});
await record('V38','competing first starts and restarts select one generation without orphan writes',async()=>{
  const f=await fixture(),other=structuredClone(f);newAttempt(other);let candidates=[f,other],results=await Promise.all(candidates.map(c=>commit(c,startWrites(c))));assert.equal(results.filter(r=>r.status===200).length,1);createConflict(results.find(r=>r.status!==200));
  let winner=candidates[results.findIndex(r=>r.status===200)],loser=candidates[results.findIndex(r=>r.status!==200)];assert.equal((await get(loser,'head/current')).status,404);assert.equal((await get(loser,'idRegistry/current')).status,404);winner.selection=startSelection(winner);await cancel(winner);
  const retry=structuredClone(winner);newAttempt(winner);newAttempt(retry);candidates=[winner,retry];results=await Promise.all(candidates.map(c=>commit(c,startWrites(c))));assert.equal(results.filter(r=>r.status===200).length,1);denied(results.find(r=>r.status!==200));winner=candidates[results.findIndex(r=>r.status===200)];loser=candidates[results.findIndex(r=>r.status!==200)];
  assert.equal((await get(loser,'head/current')).status,404);winner.selection=startSelection(winner);await fill(winner);await finish(winner);await assertCounts(winner);return {firstStartWinners:1,restartWinners:1,loserHeadsAndLedgersAbsent:true};
});
await record('V39','selection cannot be forged or point to unvalidated and unrelated data',async()=>{
  const f=await fixture();const w=startWrites(f);for(const patch of [{revision:2},{activeGeneration:randomUUID()},{publishedGeneration:f.generation},{operationId:randomUUID()},{extra:true}])await reject(f,[w[0],w[2],update(f,'selection/current',{...startSelection(f),...patch},undefined,false)]);
  await reject(f,startWrites(f,{...f.head,initializationId:randomUUID()}));await start(f);for(const patch of [{activeGeneration:'',publishedGeneration:f.generation},{activeGeneration:randomUUID()},{activeGeneration:'',publishedGeneration:''}])await reject(f,[update(f,'selection/current',{...f.selection,revision:f.selection.revision+1,operationId:randomUUID(),...patch},undefined,true)]);
  denied(await commit(f,[{delete:name(f,'selection/current')}]));await cancel(f);denied(await commit(f,[{delete:name(f,'head/current')}]));return {selectionForgeriesDenied:8,wrongGenerationHeadDenied:true,selectionAndAbandonedHeadDeletionDenied:true};
});
await record('V40','large abort uses three writes without deleting prepared cells before a fresh full build',async()=>{
  const f=await fixture({large:true});await start(f);for(let i=0;i<120;i++)await ingest(f);const old={...f},saved=data(await get(f,'chunks/0-0'));resetCounts(f);await cancel(f);const abortCounts=structuredClone(f.counts);assert.equal(abortCounts.requests,1);assert.equal(abortCounts.writes,3);
  assert.deepEqual(data(await get(old,'chunks/0-0')),saved);newAttempt(f);resetCounts(f);await initialize(f);const rebuilt=structuredClone(f.counts);await assertCounts(f);assert.equal(rebuilt.requests,1232);assert.equal(rebuilt.writes,1506);
  return {cells:930,preparedFragmentsBeforeAbort:240,abort:abortCounts,rebuild:rebuilt,oldFragmentsNotDeletedOrRewritten:true,retentionAndCleanupPolicyUnimplemented:true};
});

await record('V41','line catalog validation and ID reservation reject forged or partial inputs',async()=>{
 const f=await fixture({columns:11});await startOnly(f);let count=0;
 for(const patch of [{lineId:'bad'},{index:1},{name:'  '},{prefix:1},{startNumber:0},{startNumber:-1},{nextAutomaticNumber:0},{nextAutomaticNumber:9007199254740992},{nextAutomaticNumber:99},{extra:true}]){const line={...f.model.section.lineSettings[0],...patch};await reject(f,lineWrites(f,lineOperation(f,line)));count++;}
 const o=lineOperation(f);await reject(f,[lineWrites(f,o)[0]]);await reject(f,[lineWrites(f,o)[1]]);for(const patch of [{cursor:2},{sectionId:randomUUID()},{initializationId:randomUUID()},{extra:true}])await reject(f,[update(f,'lineCatalog/current',{...o.catalog,...patch},undefined,true),lineWrites(f,o)[1]]);
 await appendLine(f);const duplicate={...f.model.section.lineSettings[1],lineId:f.model.section.lineSettings[0].lineId};await reject(f,lineWrites(f,lineOperation(f,duplicate)));const section={...f.model.section.lineSettings[1],lineId:f.head.sectionId};await reject(f,lineWrites(f,lineOperation(f,section)));
 await fill(f);await finish(f);await assertCounts(f);return {lineFieldForgeriesDenied:count,catalogForgeriesDenied:4,partialCatalogBatchesDenied:2,duplicateAndSectionIDReuseDenied:2,catalogNotSeededByAdmin:true};
});
await record('V42','catalog and both number-proof phases require current authority and control',async()=>{
 for(const phase of ['catalog','numberCreate','numberUpdate'])for(const mutation of ['role','device','session','preparedRoleRevision']){
  const f=await fixture();await startOnly(f);if(phase!=='catalog'){await fillCatalog(f);await stage(f,f.chunks[0]);if(phase==='numberUpdate')ok(await commit(f,numberWrites(f,f.chunks[0],0)));}
  const writes=phase==='catalog'?lineWrites(f,lineOperation(f)):numberWrites(f,f.chunks[0],phase==='numberUpdate'?2:0);
  if(mutation==='role')await seed(f,'roles/FAKE-manager',{active:true,role:'receptionist',revision:2});if(mutation==='device')await seed(f,'devices/'+f.owner.uid,{deviceUid:f.owner.uid,humanUid:'FAKE-manager',active:false,preparedRoleRevision:1});
  if(mutation==='session')await seed(f,'sessions/'+f.owner.uid,{humanUid:'FAKE-manager',active:true,emailVerified:true,expiresAt:{$timestamp:'2000-01-01T00:00:00Z'}});if(mutation==='preparedRoleRevision')await seed(f,'roles/FAKE-manager',{active:true,role:'owner',revision:2});await reject(f,writes);
 }
 for(const phase of ['catalog','numberCreate','numberUpdate']){const f=await fixture();await startOnly(f);if(phase!=='catalog'){await fillCatalog(f);await stage(f,f.chunks[0]);if(phase==='numberUpdate')ok(await commit(f,numberWrites(f,f.chunks[0],0)));}
 const w=phase==='catalog'?lineWrites(f,lineOperation(f)):numberWrites(f,f.chunks[0],phase==='numberUpdate'?2:0);await seed(f,'control/current',{revision:2,firstReceptionStartedAt:null});await reject(f,w);}
 return {phaseRevocationsDenied:12,controlChangesDenied:3};
});
await record('V43','incomplete and forged number proofs cannot advance the head',async()=>{
 const f=await fixture({columns:11});await start(f);const c=f.chunks[0];await stage(f,c);await stageAttributes(f,c);const o=ingestion(f,c);await reject(f,ingestWrites(f,o));ok(await commit(f,numberWrites(f,c,0)));await reject(f,ingestWrites(f,o));
 const correct=numberWrites(f,c,2);for(const patch of [{progress:2},{progress:5},{steps:[]},{steps:[99,2,3,4]},{numberCursors:{0:99}},{numberCursors:{0:4,99:1}},{row:1},{extra:true}]){const value=data({body:{fields:correct[0].update.fields}});await reject(f,[update(f,'numberProofs/'+c.id,{...value,...patch},undefined,true)]);}
 const proof=data(await get(f,'numberProofs/'+c.id,f.owner.token));assert.equal(proof.progress,2);await reject(f,numberWrites(f,c,0),f.owner.token,createConflict);ok(await commit(f,correct));await consume(f,o);await reject(f,correct);await fill(f);await finish(f);await assertCounts(f);ok(await get(f,'numberProofs/'+c.id,f.reader.token));
 return {missingAndIncompleteProofDenied:2,proofForgeriesDenied:8,lostStepQueryable:true,lateAndDuplicateUpdatesDenied:true};
});
await record('V44','every line terminal is checked in both axes and orders including partial proof boundaries',async()=>{
 let variants=0;for(const axis of ['horizontal','vertical'])for(const order of ['forward','reverse'])for(let lineIndex=0;lineIndex<4;lineIndex++){
  const f=await fixture({axis,order,empty:true});f.model.section.lineSettings[lineIndex].nextAutomaticNumber++;f.chunks=pack(f.model,4,context);await start(f);let refused=false;
  for(const c of f.chunks){await stage(f,c);await stageAttributes(f,c);for(let progress=0;progress<c.value.cells.length;progress+=2){const target=Math.min(progress+2,c.value.cells.length);
    const ending=axis==='horizontal'?c.value.row===lineIndex&&c.value.startColumn+target===f.head.columns:c.value.row===f.head.rows-1&&lineIndex>=c.value.startColumn+progress&&lineIndex<c.value.startColumn+target;
    if(ending){await reject(f,numberWrites(f,c,progress));refused=true;variants++;break;}ok(await commit(f,numberWrites(f,c,progress)));}
    if(refused)break;await consume(f,ingestion(f,c));}
  assert(refused);denied(await get(f,'head/current',f.reader.token));}
 return {forgedTerminalVariantsDenied:variants,firstAndSecondNumberPartsCovered:true};
});
await record('V45','partial catalog and numeric preparation can be queried, abandoned and rebuilt',async()=>{
 for(const phase of ['catalog','numbers']){const f=await fixture();await startOnly(f);if(phase==='catalog'){await appendLine(f);assert.equal(data(await get(f,'lineCatalog/current',f.owner.token)).cursor,1);}else{await fillCatalog(f);await stage(f,f.chunks[0]);ok(await commit(f,numberWrites(f,f.chunks[0],0)));assert.equal(data(await get(f,'numberProofs/0-0',f.owner.token)).progress,2);}
 const old={...f};await cancel(f);newAttempt(f);await initialize(f);await assertCounts(f);denied(await get(old,phase==='catalog'?'lineCatalog/current':'numberProofs/0-0',f.reader.token));}
 return {partialPreparationPhases:2,rebuildPreservesLogicalIDs:true};
});
await record('V46','two-position number checks are compared with a four-position request',async()=>{
 const four=await fixture({columns:11,rich:true,numberSpan:4});await start(four);const c=four.chunks[0];await stage(four,c);await stageAttributes(four,c);const before=data(await get(four,'head/current'));const result=await commit(four,numberWrites(four,c,0));
 if(result.status!==200){denied(result);assert.match(result.body.error.message,/maximum of 1000 expressions/);assert.equal((await get(four,'numberProofs/'+c.id)).status,404);}else{await consume(four,ingestion(four,c));}
 if(result.status!==200)assert.deepEqual(data(await get(four,'head/current')),before);return {numberSpan:4,httpStatus:result.status,expressionLimit:result.status===403,productionLimitNotEstablished:true};
});
await record('V47','the first line creates its exact ledger atomically without an empty initial ledger',async()=>{
 const f=await fixture({columns:11});await startOnly(f);assert.equal((await get(f,'idRegistry/current')).status,404);denied(await get(f,'head/current',f.reader.token));await reject(f,stageWrites(f,f.chunks[0]));
 const o=lineOperation(f),w=lineWrites(f,o);let rejected=0;
 for(const patch of [{cursor:1},{lineCursor:0},{initializationId:randomUUID()},{usedIds:{[f.head.sectionId]:true}},{usedIds:{...o.registry.usedIds,[randomUUID()]:true}},{usedNumbers:{fake:true}},{extra:true}]){await reject(f,[w[0],update(f,'idRegistry/current',{...o.registry,...patch},undefined,false)]);rejected++;}
 await reject(f,lineWrites(f,lineOperation(f,{...f.model.section.lineSettings[0],lineId:f.head.sectionId})));await reject(f,[update(f,'idRegistry/current',f.registry,undefined,false)]);
 await appendLine(f);assert.equal(data(await get(f,'idRegistry/current')).lineCursor,1);await fill(f);await finish(f);await assertCounts(f);
 const fresh=await fixture();await reject(fresh,[...startWrites(fresh),update(fresh,'idRegistry/current',fresh.registry,undefined,false)]);assert.equal((await get(fresh,'head/current')).status,404);
 return {firstLedgerForgeriesDenied:rejected,sectionIDReuseDenied:true,emptyLedgerDenied:true,startWrites:3,firstLineWrites:2};
});
await record('V48','a lost first-line response is recovered by reading both documents without reapplying the operation',async()=>{
 const f=await fixture();await startOnly(f);const o=lineOperation(f),w=lineWrites(f,o);ok(await commit(f,w));
 f.catalog=data(await get(f,'lineCatalog/current',f.owner.token));f.registry=data(await get(f,'idRegistry/current',f.owner.token));assert.deepEqual(f.catalog,o.catalog);assert.deepEqual(f.registry,o.registry);await reject(f,w,f.owner.token,createConflict);
 await fill(f);await finish(f);await assertCounts(f);return {bothDocumentsQueryable:true,duplicateFirstLineDenied:true,browserOutboxNotImplemented:true};
});
await record('V49','first-line creation races safely with another creator and with abort',async()=>{
 const f=await fixture();await startOnly(f);const w=lineWrites(f,lineOperation(f)),race=await Promise.all([commit(f,w),commit(f,w,f.other.token)]);assert.equal(race.filter(r=>r.status===200).length,1);createConflict(race.find(r=>r.status!==200));
 f.catalog=data(await get(f,'lineCatalog/current'));f.registry=data(await get(f,'idRegistry/current'));await fill(f);await finish(f);await assertCounts(f);
 const a=await fixture();await startOnly(a);const old={...a},delayed=lineWrites(a,lineOperation(a)),abort=abortOperation(a,a.other);const [added,aborted]=await Promise.all([commit(a,delayed),commit(a,abortWrites(a,abort),a.other.token)]);ok(aborted);if(added.status!==200)denied(added);
 a.head=data(await get(a,'head/current'));a.selection=data(await get(a,'selection/current'));assert.equal(a.head.status,'aborted');newAttempt(a);await startOnly(a);await reject(old,delayed,old.owner.token,createConflict);await fill(a);await finish(a);await assertCounts(a);
 return {firstLineWinners:1,firstLineMayPrecedeAbort:added.status===200,abortedAndLateFirstLineCannotPublish:true};
});
await record('V50','a one-line section reaches validation completion only after creating its reserved IDs',async()=>{
 for(const axis of ['horizontal','vertical'])for(const order of ['forward','reverse']){const f=await fixture({axis,order,rows:axis==='horizontal'?1:11,columns:axis==='horizontal'?11:1,direction:axis==='horizontal'?'right':'down'});await startOnly(f);assert.equal((await get(f,'idRegistry/current')).status,404);await reject(f,stageWrites(f,f.chunks[0]));await appendLine(f);await fill(f);await finish(f);await assertCounts(f);}
 return {singleLineProfiles:4,preCatalogCellCreationDenied:true};
});
const endSourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,await hash(p)])));assert.deepEqual(endSourceHashes,sourceHashes);
await writeFile(new URL('../artifacts/emulator-summary.json',import.meta.url),JSON.stringify({project,runtime:process.version,executedAt:new Date().toISOString(),hashLineEndings:'LF',sourceHashes,endSourceHashes,
  scope:'single-section three-write initial start and first-line atomic ledger creation, catalog creation by manager, ordered automatic seat/gap numbering with per-line terminal checks, split fragments and two-position number proof increments, atomic ingestion and generation abort/restart; countReady is not business confirmation. No confirmed-generation replacement, cleanup, manual seats, full edits, multiple sections, formal auth, QR, SDK, IndexedDB or devices',reports},null,2)+'\n');
console.log(`${reports.length} scenarios executed`);
