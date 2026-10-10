import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID, createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createSection, numberInitial, extend} from '../../GD91-07/planner.mjs';
import {indexSeatFacts, compareSections} from '../../GD91-48/comparison.mjs';
import {pack, unpack} from '../codec.mjs';
const context = {maxCells: 10000}, reports = [];
const sources = ['../codec.mjs', 'codec.mjs', '../../GD91-48/comparison.mjs', '../../GD91-07/planner.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async p => [p, createHash('sha256').update((await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex')])));
const sourceHashes = await hashes();
function fixture(rows = 2, columns = 5, axis = 'horizontal', seatOrder = 'forward', mixed = true) {
  const raw = createSection({name: '架空検証区画', rows, columns, axis, seatOrder,
    lines: Array.from({length: axis === 'horizontal' ? rows : columns}, (_, i) => ({name: '列' + i}))}, context);
  const kinds = ['seat', 'gap', 'space', 'aisle', 'unset'];
  const model = numberInitial(raw, Object.fromEntries(raw.section.cells.map((c, i) => [c.row + ',' + c.column, mixed ? kinds[i % 5] : 'seat'])), context);
  return {environmentId: 'FAKE-environment', performanceId: 'FAKE-performance', generation: randomUUID(), model};
}
function manual(entry, index, label = '補助-1') {
  const m = entry.model, cell = m.section.cells[index], line = m.section.lineSettings[m.section.axis === 'horizontal' ? cell.row : cell.column];
  assert.notEqual(cell.kind, 'seat'); cell.kind = 'seat'; cell.seatId = randomUUID();
  m.seats.push({seatId: cell.seatId, sectionId: m.section.sectionId, lineId: line.lineId, numberingMode: 'manual', manualNumber: label,
    category: 'special', usable: true, emergencyChange: {kind: 'add', reason: '架空：補助席用途'}});
}
function equal(a, b) {
  const x = indexSeatFacts(a, context), y = indexSeatFacts(b, context);
  for (const key of ['facts', 'cells', 'lines']) assert(isDeepStrictEqual(x[key], y[key]), key);
  assert.equal(a.environmentId, b.environmentId); assert.equal(a.performanceId, b.performanceId); assert.equal(a.generation, b.generation);
  const {cells: ac, ...as} = a.model.section, {cells: bc, ...bs} = b.model.section; assert.deepEqual(as, bs);
}
function roundtrip(e, size = 3) { const before = structuredClone(e), p = pack(e, size, context), json = JSON.stringify(p), result = unpack(JSON.parse(json), context); equal(e, result); assert.deepEqual(e, before); return {snapshot: p, restored: result, jsonBytes: Buffer.byteLength(json)}; }
function run(id, label, test) { reports.push({id, label, status: 'passed', ...test()}); }
function reject(change) { const p = pack(fixture(), 3, context); change(p); assert.throws(() => unpack(p, context)); }
run('C01', 'five hundred automatic seats survive serialization', () => { const r = roundtrip(fixture(10, 50, 'horizontal', 'forward', false)); return {seats: 500, chunks: r.snapshot.chunks.length, jsonBytes: r.jsonBytes}; });
run('C02', 'both axes and orders with mixed manual and automatic seats', () => { const directions = []; for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) { const e = fixture(5, 5, axis, order); manual(e, 1); manual(e, 2, '  枝番-α  '); roundtrip(e); directions.push(axis + ':' + order); } return {directions}; });
run('C03', 'every former non-seat type retains cell ID and gap consumption', () => { const kinds = []; for (const index of [1, 2, 3, 4]) { const e = fixture(), cell = structuredClone(e.model.section.cells[index]), cursors = e.model.section.lineSettings.map(l => l.nextAutomaticNumber); kinds.push(cell.kind); manual(e, index); const r = roundtrip(e); assert.equal(r.restored.model.section.cells[index].cellId, cell.cellId); assert.equal(r.restored.model.section.cells[index].consumedNumber, cell.consumedNumber); assert.deepEqual(r.restored.model.section.lineSettings.map(l => l.nextAutomaticNumber), cursors); } return {sourceKinds: kinds}; });
run('C04', 'all optional attributes and literal manual text survive', () => { const e = fixture(); Object.assign(e.model.seats[0], {category: 'reserved', usable: false, reservedLabel: '架空予約', displayOrder: 0, emergencyChange: {kind: 'move', reason: '架空配置変更'}}); manual(e, 2, '=架空文字列'); roundtrip(e); });
run('C05', 'all chunk sizes including incomplete last chunk', () => { for (const size of [1, 2, 3, 4, 5]) roundtrip(fixture(2, 7), size); });
run('C06', 'input array order does not determine storage positions', () => { const e = fixture(); e.model.section.cells.reverse(); e.model.seats.reverse(); const r = roundtrip(e); r.snapshot.chunks.reverse(); equal(e, unpack(r.snapshot, context)); });
run('C07', 'changed geometry and line prefix retain ID comparison result', () => { const old = fixture(), next = structuredClone(old); next.generation = randomUUID(); next.model = extend(next.model, {dimension: 'columns', count: 2}, context).after; const line = next.model.section.lineSettings[0]; line.prefix = '変更-'; for (const s of next.model.seats.filter(s => s.lineId === line.lineId)) s.prefix = line.prefix; manual(next, 2); assert.deepEqual(compareSections(old, next, context), compareSections(roundtrip(old).restored, roundtrip(next).restored, context)); });
run('C08', 'missing chunk is rejected', () => reject(p => p.chunks.pop()));
run('C09', 'duplicate chunk is rejected', () => reject(p => p.chunks[1] = structuredClone(p.chunks[0])));
run('C10', 'wrong physical coordinate is rejected', () => reject(p => p.chunks[0].chunk.content[0].cell.column = 1));
run('C11', 'attributes from another chunk cannot silently align', () => reject(p => p.chunks[0].attributes = structuredClone(p.chunks[1].attributes)));
run('C12', 'missing and unknown attributes are rejected', () => { reject(p => delete p.chunks[0].attributes.values[0].usable); reject(p => p.chunks[0].attributes.values[0].extra = true); });
run('C13', 'manual and automatic numbering fields cannot mix', () => { reject(p => p.chunks[0].chunk.content[0].numbering.manualNumber = 'X'); });
run('C14', 'non-seat numbering or attributes are rejected', () => { reject(p => p.chunks[0].chunk.content[1].numbering = {mode: 'automatic', number: 2}); reject(p => p.chunks[0].attributes.values[1] = {category: 'general', usable: true}); });
run('C15', 'unknown versions and envelope fields are rejected', () => { reject(p => p.formatVersion = 3); reject(p => p.chunks[0].chunk.formatVersion = 3); reject(p => p.extra = true); reject(p => p.section.extra = true); });
run('C16', 'duplicate seat and cell IDs are rejected', () => { reject(p => p.chunks[2].chunk.content[0].cell.seatId = p.chunks[0].chunk.content[0].cell.seatId); reject(p => p.chunks[0].chunk.content[1].cell.cellId = p.chunks[0].chunk.content[0].cell.cellId); });
run('C17', 'blank manual number and trimmed duplicate are rejected', () => { for (const label of [' ', ' 列0-1 ']) { const e = fixture(); manual(e, 2, label); assert.throws(() => pack(e, 3, context)); } });
run('C18', 'malformed consumed number and business duplication are rejected', () => { const e = fixture(); e.model.section.cells[1].consumedNumber = 99; assert.throws(() => pack(e, 3, context)); const b = fixture(); b.model.assignments.push({attendeeId: 'FAKE', seatId: b.model.seats[0].seatId}); assert.throws(() => pack(b, 3, context)); });
run('C19', 'decoded data has independent object ownership', () => { const e = fixture(), p = pack(e, 3, context), saved = structuredClone(p); const r = unpack(p, context); r.model.seats[0].usable = false; r.model.section.lineSettings[0].prefix = '変更'; assert.deepEqual(p, saved); });
run('C20', 'scope is preserved but not authenticated by the codec', () => { const p = pack(fixture(), 3, context); p.performanceId = 'FAKE-other-performance'; assert.equal(unpack(p, context).performanceId, p.performanceId); return {serverScopeProofStillRequired: true}; });
const endSourceHashes = await hashes(); assert.deepEqual(sourceHashes, endSourceHashes);
await mkdir(new URL('../artifacts/', import.meta.url), {recursive: true});
await writeFile(new URL('../artifacts/codec-summary.json', import.meta.url), JSON.stringify({executedAt: new Date().toISOString(), scope: 'Local JSON round trips and rejection tests only. No Firestore writes, authorization, completion proof or Emulator execution.', hashLineEndings: 'LF', sourceHashes, endSourceHashes, reports}, null, 2) + '\n');
console.log(JSON.stringify({cases: reports.length, passed: reports.length, firestoreWrites: 0, emulatorExecuted: false}));
