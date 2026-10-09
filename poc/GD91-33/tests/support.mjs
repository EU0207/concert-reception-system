import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSection, numberInitial, extend, validate } from '../../GD91-07/planner.mjs';
import { pack, unpack } from '../../GD91-16/codec.mjs';
import { slide } from '../../GD91-08/slide.mjs';
import { project as projectView, initialHead } from '../../GD91-10/projection.mjs';

const project = 'demo-concert-seat-gd91-33';
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9191');
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const context = {maxCells:10000}, deltas = {up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]};
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
async function human(provider='google.com',verified=true) {
  const id=randomUUID(),email=`fake-${id}@example.com`;let r;
  if(provider==='google.com')r=await request(`${auth}/accounts:signInWithIdp?key=demo-api-key`,null,'POST',{requestUri:'http://localhost',postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:id,email,email_verified:verified})}).toString(),returnSecureToken:true});
  else {
    const password=randomUUID()+'aA7!';r=await request(`${auth}/accounts:signUp?key=demo-api-key`,null,'POST',{email,password,returnSecureToken:true});assert.equal(r.status,200);
    if(verified){assert.equal((await request(`${auth}/projects/${project}/accounts:update`,'owner','POST',{localId:r.body.localId,emailVerified:true})).status,200);r=await request(`${auth}/accounts:signInWithPassword?key=demo-api-key`,null,'POST',{email,password,returnSecureToken:true});}
  }
  assert.equal(r.status,200);const claims=JSON.parse(Buffer.from(r.body.idToken.split('.')[1],'base64url'));
  assert.equal(claims.aud,project);assert.equal(claims.firebase.sign_in_provider,provider);assert.equal(claims.email_verified,verified);
  return {uid:r.body.localId,token:r.body.idToken,provider};
}
function sessionData(f,a=f.owner,h=f.human,revision=1) {return {schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,deviceUid:a.uid,humanUid:h.uid,active:true,emailVerified:true,authProvider:h.provider,roleRevision:1,revision,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}};}
function sessionWrite(f,a=f.owner,h=f.human,revision=1,overrides={}) {
 const s={...sessionData(f,a,h,revision),...overrides};const w=update(f,'sessions/'+a.uid,s,undefined,revision>1);
 if(!Object.hasOwn(s,'issuedAt'))w.updateTransforms=[{fieldPath:'issuedAt',setToServerValue:'REQUEST_TIME'}];return w;
}
async function issue(f,a=f.owner,h=f.human,revision=1) {
 const r=await request(`${base}:commit`,h.token,'POST',{writes:[sessionWrite(f,a,h,revision)]});ok(r);f.sessionCosts.requests++;f.sessionCosts.writes++;return data(await get(f,'sessions/'+a.uid));
}
async function revoke(f,a=f.owner,h=f.human) {
 const before=data(await get(f,'sessions/'+a.uid));const w=update(f,'sessions/'+a.uid,{active:false,revision:before.revision+1},['active','revision'],true);
 const r=await request(`${base}:commit`,h.token,'POST',{writes:[w]});ok(r);return before;
}

const common = new Set(['devices','sessions','roles','control','seatReferences','selection','versions','assignmentState','attendeeState','ticketState','attendees','operations','tickets','credentials','confirmationCodes','receptions']);
const relative = (f, suffix) => { suffix=suffix.replace(/^events\//,'operations/').replace('roles/FAKE-manager','roles/'+f.human.uid).replace('roles/FAKE-reader','roles/'+f.readerHuman.uid);return 'splitSeatShows/'+f.show+'/'+(common.has(suffix.split('/')[0]) ? '' : 'generations/'+f.generation+'/')+suffix;};
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
async function fixture({ axis = 'horizontal', order = 'forward', direction = 'right', rows = 4, columns = 4, large = false, empty = false, block = null, role = 'owner', chunkSize = 3, rich = false, startNumber = 1, prefix, numberSpan=2, skipSessions=false,humanProvider,humanVerified=true, controlRevision=1 } = {}) {
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
  m.assignments = []; m.ticketRefs = []; m.receptionRefs = [];
  if (m.seats.length) m.seats[0].emergencyChange = { kind: 'add', reason: '架空：補助席用途' };
  if (rich) for (const s of m.seats) Object.assign(s, {category:'reserved',usable:false,reservedLabel:'架空確保',displayOrder:1,emergencyChange:{kind:'add',reason:'架空用途'}});
  f.human=await human(humanProvider??(['owner','deputy'].includes(role)?'google.com':'password'),humanVerified);f.readerHuman=await human('password');
  f.model = m; f.expected = initialHead(m); f.direction = direction;
  f.head = { ...f.expected, rowCounts: {}, columnCounts: {}, nonEmptyCount: 0, sourceRevision: 0, revision: 0, status: 'building', cursor: 0, lastChunk: '', controlRevision, initializationId: randomUUID(), chunkSize, numberCursors:{}, numberSpan, basePublishedGeneration:'',basePublishedRevision:0 };
  f.generation = f.head.initializationId; f.blankHead = structuredClone(f.head); f.selection = {revision:0,activeGeneration:'',publishedGeneration:'',operationId:''};
  f.registry = { initializationId: f.head.initializationId, cursor: 0, lineCursor:0, usedIds: {[f.head.sectionId]:true}, usedNumbers: {}, seatIds: {} };
  f.chunks = pack(m, chunkSize, context); f.numberedChunks=new Set();
  const scoped={schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show};
  const period={startsAt:{$timestamp:'2000-01-01T00:00:00Z'},endsAt:{$timestamp:'2100-01-01T00:00:00Z'}};
  const writes = [update(f,'control/current',{revision:controlRevision,firstReceptionStartedAt:null,environmentId:'FAKE-environment'}),
    update(f,'roles/FAKE-manager',{...scoped,...period,active:true,role,revision:1}),update(f,'roles/FAKE-reader',{...scoped,...period,active:true,role:'receptionist',revision:1})];
  for(const[a,h]of [[f.owner,f.human],[f.other,f.human],[f.reader,f.readerHuman]])writes.push(update(f,'devices/'+a.uid,{...scoped,deviceUid:a.uid,humanUid:h.uid,active:true,preparedRoleRevision:1}));
  f.catalog={sectionId:f.head.sectionId,initializationId:f.generation,cursor:0,lines:{},lineIds:[]};
  f.businessRevisions={attendee:1,ticket:1};f.controlRevision=controlRevision;
  writes.push(update(f,'seatReferences/current',{assignments:m.assignments,ticketRefs:m.ticketRefs,receptionRefs:m.receptionRefs}));
  ok(await commit(f,writes,'owner'));f.sessionCosts={requests:0,writes:0};if(!skipSessions)for(const[a,h]of [[f.owner,f.human],[f.other,f.human],[f.reader,f.readerHuman]])await issue(f,a,h);return f;
}
const startSelection = f => ({revision:f.selection.revision+1,activeGeneration:f.generation,publishedGeneration:f.selection.publishedGeneration,operationId:f.generation});
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
  for (const cell of c.cells) if(cell.kind === 'seat') registry.seatIds[cell.seatId] = true;
  const numbers = [...new Set(c.numberKeys.filter(Boolean))]; for (const key of numbers) registry.usedNumbers[key] = true;
  return { chunk, after, registry, ids, numbers };
}
function stageWrites(f, chunk) { return [update(f, `chunks/${chunk.id}`, chunk.value, undefined, false)]; }
function attributeWrites(f, chunk) { return [update(f, `attributes/${chunk.id}`, chunk.attributes, undefined, false)]; }
function ingestWrites(f, o) {
  const keys = ['cursor', 'lastChunk', 'nonEmptyCount', 'rowCounts', 'columnCounts', 'numberCursors'];
  const registry = {cursor:o.registry.cursor}, mask=['cursor'];
  for(const field of ['usedIds','usedNumbers','seatIds']) {
    const changed=[...new Set([...Object.keys(f.registry[field]),...Object.keys(o.registry[field])])].filter(k=>f.registry[field][k]!==o.registry[field][k]);
    registry[field]=Object.fromEntries(changed.filter(k=>Object.hasOwn(o.registry[field],k)).map(k=>[k,o.registry[field][k]]));
    mask.push(...changed.map(k=>field+'.`'+k+'`'));
  }
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true),
    update(f, 'idRegistry/current', registry, mask, true)];
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
    history: { kind: 'initialCounterProof', generation:f.generation, deviceUid: f.owner.uid, initializationId: f.head.initializationId, controlRevision: f.controlRevision,schemaVersion:7,environmentId:'FAKE-environment',performanceId:f.show,operationId:id,
      expectedVersions:structuredClone(f.sharedVersions.values),resultVersions:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,layout:1,source:1,assignment:1} },selection:{revision:f.selection.revision+1,activeGeneration:'',publishedGeneration:f.generation,operationId:id} };
}
function initialVersions(f,o) {
 return {...structuredClone(f.sharedVersions),sectionId:f.head.sectionId,generation:f.generation,operationId:o.id,values:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,layout:1,source:1,assignment:1}};
}
function initialAssignment(f,o) {
 return {schemaVersion:7,environmentId:'FAKE-environment',performanceId:f.show,generation:f.generation,revision:1,operationId:o.id,lastKind:"initial",assignments:Object.fromEntries(f.model.seats.map(x=>[x.seatId,'']))};
}
function finishWrites(f, o) {
  const keys = ['status', 'revision', 'sourceRevision', 'operationId'];
  const w=[update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true), update(f, `events/${o.id}`, o.history, undefined, false),update(f,'selection/current',o.selection,undefined,true)];
  if(f.selection.publishedGeneration==='')w.push(update(f,'versions/current',o.versions??initialVersions(f,o),undefined,true),update(f,'assignmentState/current',o.assignment??initialAssignment(f,o),undefined,false));
  return w;
}
async function finish(f, o = completion(f)) { const v=o.versions??initialVersions(f,o);ok(await commit(f, finishWrites(f, o))); f.head = o.after; f.selection = o.selection;f.sharedVersions=v; }
async function initialize(f) { await start(f); await fill(f); await finish(f); }
function movement(f, direction = f.direction, who = f.owner) {
  const [dr, dc] = deltas[direction], h = f.head, id = randomUUID();
  return { id, after: { ...h, revision: h.revision + 1, operationId: id, rowOffset: (h.rowOffset + dr + h.rows) % h.rows, columnOffset: (h.columnOffset + dc + h.columns) % h.columns },
    history: { kind:'slide',deviceUid:who.uid,environmentId:f.sharedVersions.environmentId,performanceId:f.show,generation:f.generation,sectionId:h.sectionId,expectedVersions:structuredClone(f.sharedVersions.values),resultVersions:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,layout:f.sharedVersions.values.layout+1},baseRevision:h.revision,revision:h.revision+1,dr,dc },versions:{...structuredClone(f.sharedVersions),operationId:id,values:{...f.sharedVersions.values,commit:f.sharedVersions.values.commit+1,layout:f.sharedVersions.values.layout+1}} };
}
function slideWrites(f, o) {
  const keys = ['revision', 'operationId', 'rowOffset', 'columnOffset'];
  return [update(f, 'head/current', Object.fromEntries(keys.map(k => [k, o.after[k]])), keys, true), update(f, `events/${o.id}`, o.history, undefined, false),update(f,'versions/current',o.versions,undefined,true)];
}
async function publishSlide(f, o = movement(f)) { ok(await commit(f, slideWrites(f, o))); f.head = o.after; f.sharedVersions=o.versions; }
async function reject(f, writes, token = f.owner.token, check = denied) {
  const beforeVersion=await get(f,'versions/current'),beforeAssignment=await get(f,'assignmentState/current');
  const beforeIds = await get(f, 'idRegistry/current'), before = await get(f, 'head/current'), beforeSelection=await get(f,'selection/current'); check(await commit(f, writes, token)); const afterSelection=await get(f,'selection/current');assert.equal(afterSelection.status,beforeSelection.status);if(beforeSelection.status===200)assert.deepEqual(data(afterSelection),data(beforeSelection)); const after = await get(f, 'head/current');
  const afterIds = await get(f, 'idRegistry/current'); assert.equal(afterIds.status, beforeIds.status); if (beforeIds.status === 200) assert.deepEqual(data(afterIds), data(beforeIds));
  const afterVersion=await get(f,'versions/current');assert.deepEqual(afterVersion,beforeVersion);
  assert.deepEqual(await get(f,'assignmentState/current'),beforeAssignment);
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

export {fixture,request,base,actor,human,sessionWrite,issue,revoke,commit,update,get,data,ok,denied,createConflict,seed,start,startOnly,stage,stageWrites,stageAttributes,attributeWrites,ensureNumbers,numberWrites,ingestion,ingestWrites,ingest,consume,fill,finish,completion,initialAssignment,initialVersions,finishWrites,initialize,movement,slideWrites,publishSlide,reject,assertCounts,resetCounts,context,projectView,slide,relative,fields,pack,appendLine,lineOperation,lineWrites};
