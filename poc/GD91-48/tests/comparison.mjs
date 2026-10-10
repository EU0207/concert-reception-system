import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createSection, numberInitial, extend} from '../../GD91-07/planner.mjs';
import {indexSeatFacts, compareSections, ComparisonError} from '../comparison.mjs';

const context = {maxCells: 10000}, reports = [];
const sources = ['../comparison.mjs', 'comparison.mjs', '../../GD91-07/planner.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async path => [path,
  createHash('sha256').update((await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex')])));
const sourceHashes = await hashes();

function entry({rows = 1, columns = 5, axis = 'horizontal', order = 'forward', mixed = false} = {}) {
  const raw = createSection({name: '架空比較区画', rows, columns, axis, seatOrder: order,
    lines: Array.from({length: axis === 'horizontal' ? rows : columns}, (_, i) => ({name: String.fromCharCode(65 + i)}))}, context);
  const selected = Object.fromEntries(raw.section.cells.map(cell => [`${cell.row},${cell.column}`, 'seat']));
  if (mixed) for (let row = 0; row < rows; row++) for (const [i, kind] of ['seat', 'gap', 'space', 'aisle', 'unset'].entries()) selected[`${row},${i}`] = kind;
  return {environmentId: 'FAKE-environment', performanceId: 'FAKE-performance', generation: randomUUID(), model: numberInitial(raw, selected, context)};
}
function proposed(before, change = () => {}) {
  const after = structuredClone(before); after.generation = randomUUID(); change(after.model); return after;
}
function manual(model, index, number = '臨時1') {
  const cell = model.section.cells[index], line = model.section.lineSettings[model.section.axis === 'horizontal' ? cell.row : cell.column];
  assert.notEqual(cell.kind, 'seat');
  const seat = {seatId: randomUUID(), sectionId: model.section.sectionId, lineId: line.lineId,
    numberingMode: 'manual', manualNumber: number, category: 'general', usable: true,
    emergencyChange: {kind: 'add', reason: '架空：補助席用途'}};
  cell.kind = 'seat'; cell.seatId = seat.seatId; model.seats.push(seat); return seat;
}
function check(before, after) {
  const old = structuredClone(before), next = structuredClone(after);
  const result = compareSections(before, after, context);
  assert.deepEqual(before, old); assert.deepEqual(after, next); return result;
}
function reject(before, after, code) {
  const old = structuredClone(before), next = structuredClone(after);
  assert.throws(() => compareSections(before, after, context), e => e instanceof ComparisonError && e.code === code);
  assert.deepEqual(before, old); assert.deepEqual(after, next);
}
function run(id, label, test) { const result = test(); reports.push({id, label, status: 'passed', ...result}); }
const sameIds = (actual, expected) => assert.deepEqual(new Set(actual), new Set(expected));

run('F01', 'five hundred seats compare by ID despite reversed source arrays', () => {
  const before = entry({rows: 10, columns: 50}), after = proposed(before, m => {m.seats.reverse(); m.section.cells.reverse();});
  const result = check(before, after); assert.deepEqual(result.changedSeatIds, []); assert.deepEqual(result.changedCellIds, []);
  assert.equal(result.indexedCells, 1000); assert.equal(result.indexedSeats, 1000); return {seats: 500, indexedCells: 1000, indexedSeats: 1000};
});
run('F02', 'adding unset columns does not mark existing seats as changed', () => {
  const before = entry(), after = proposed(before, m => Object.assign(m, extend(m, {dimension: 'columns', count: 2}, context).after));
  const result = check(before, after); assert.deepEqual(result.changedSeatIds, []); assert.equal(result.changedCellIds.length, 2);
  assert(after.model.section.cells.slice(-2).every(c => c.kind === 'unset'));
});
run('F03', 'adding another numbering line keeps the original seats unchanged', () => {
  const before = entry(), after = proposed(before, m => Object.assign(m, extend(m, {dimension: 'rows', count: 1, lines: [{name: '新しい列'}]}, context).after));
  const result = check(before, after); assert.deepEqual(result.changedSeatIds, []); assert.equal(result.changedLineIds.length, 1);
});
run('F04', 'shrinking the grid remains outside the supported contract', () => {
  const before = entry({rows: 2});
  before.model.seats = before.model.seats.filter(s => before.model.section.cells.find(c => c.seatId === s.seatId).row === 0);
  for (const c of before.model.section.cells.filter(c => c.row === 1)) {c.kind = 'unset'; delete c.seatId;}
  const after = proposed(before, m => {m.section.rows = 1; m.section.cells = m.section.cells.filter(c => c.row === 0); m.section.lineSettings.pop();});
  reject(before, after, 'UNSUPPORTED_SHRINK');
});
run('F05', 'a changed line prefix marks every affected automatic seat', () => {
  const before = entry({rows: 2}), after = proposed(before, m => {m.section.lineSettings[0].prefix = '別-'; for (const s of m.seats.filter(s => s.lineId === m.section.lineSettings[0].lineId)) s.prefix = '別-';});
  sameIds(check(before, after).changedSeatIds, before.model.seats.slice(0, 5).map(s => s.seatId));
});
run('F06', 'line names are layout metadata and do not alter seat identity', () => {
  const before = entry(), after = proposed(before, m => {m.section.lineSettings[0].name = '架空変更';});
  const result = check(before, after); assert.deepEqual(result.changedSeatIds, []); assert.equal(result.changedLineIds.length, 1);
});
run('F07', 'section name and stage metadata do not alter seat facts', () => {
  const before = entry(), after = proposed(before, m => {m.section.name = '架空名称変更'; m.section.stagePosition = 'top';});
  assert.deepEqual(check(before, after).changedSeatIds, []);
});
run('F08', 'swapping the positions of two seats marks both old seats', () => {
  const before = entry(), after = proposed(before, m => {[m.section.cells[0].column, m.section.cells[1].column] = [1, 0];});
  sameIds(check(before, after).changedSeatIds, before.model.seats.slice(0, 2).map(s => s.seatId));
});
run('F09', 'replacing the cell identity is visible even if its position is unchanged', () => {
  const before = entry(), after = proposed(before, m => {m.section.cells[0].cellId = randomUUID();});
  sameIds(check(before, after).changedSeatIds, [before.model.seats[0].seatId]);
});
run('F10', 'deleting a seat is included in the old changed-seat set', () => {
  const before = entry(), after = proposed(before, m => {const s = m.seats.pop(), c = m.section.cells.at(-1); c.kind = 'gap'; c.consumedNumber = s.number; delete c.seatId;});
  const result = check(before, after); sameIds(result.changedSeatIds, [before.model.seats.at(-1).seatId]); sameIds(result.removedSeatIds, result.changedSeatIds);
});
run('F11', 'adding a manual seat does not change existing automatic seats', () => {
  const before = entry({mixed: true}), after = proposed(before, m => manual(m, 2));
  const result = check(before, after); assert.deepEqual(result.changedSeatIds, []); assert.equal(result.addedSeatIds.length, 1);
});
run('F12', 'changing a manual label or retained gap consumption marks that seat', () => {
  const before = entry({mixed: true}); const s = manual(before.model, 2, 'A-2a');
  const after = proposed(before, m => {m.seats.at(-1).manualNumber = '臨時2';}); sameIds(check(before, after).changedSeatIds, [s.seatId]);
  const gap = entry({mixed: true}), oldManual = manual(gap.model, 1, 'A-2a');
  const missingConsumption = proposed(gap, m => {delete m.section.cells[1].consumedNumber;});
  sameIds(check(gap, missingConsumption).changedSeatIds, [oldManual.seatId]);
});
run('F13', 'changing a stored emergency reason marks the same seat', () => {
  const before = entry({mixed: true}); const s = manual(before.model, 2);
  const after = proposed(before, m => {m.seats.at(-1).emergencyChange.reason = '架空：変更用途';}); sameIds(check(before, after).changedSeatIds, [s.seatId]);
});
run('F14', 'all seat attributes and nested field order are compared by value', () => {
  const before = entry(); Object.assign(before.model.seats[0], {reservedLabel: '架空確保', displayOrder: 4, emergencyChange: {kind: 'move', reason: '架空用途'}});
  const after = proposed(before, m => {m.seats[0] = Object.fromEntries(Object.entries(m.seats[0]).reverse()); m.seats[0].emergencyChange = {reason: '架空用途', kind: 'move'};});
  assert.deepEqual(check(before, after).changedSeatIds, []);
});
run('F15', 'replacing a line ID marks its seats even with the same display labels', () => {
  const before = entry(), after = proposed(before, m => {const id = randomUUID(); m.section.lineSettings[0].lineId = id; for (const s of m.seats) s.lineId = id;});
  sameIds(check(before, after).changedSeatIds, before.model.seats.map(s => s.seatId));
});
run('F16', 'reusing a display label with a new seat ID is removal plus addition', () => {
  const before = entry(), after = proposed(before, m => {const id = randomUUID(); m.section.cells[0].seatId = id; m.seats[0].seatId = id;});
  const result = check(before, after); sameIds(result.changedSeatIds, [before.model.seats[0].seatId]); assert.equal(result.removedSeatIds.length, 1); assert.equal(result.addedSeatIds.length, 1);
});
run('F17', 'four non-seat kinds become manual seats without advancing the cursor', () => {
  const sources = [];
  for (const index of [1, 2, 3, 4]) {
    const before = entry({mixed: true}), old = before.model.section.cells[index], cursor = before.model.section.lineSettings[0].nextAutomaticNumber;
    const after = proposed(before, m => manual(m, index, 'A-2a')), result = check(before, after), cell = after.model.section.cells[index];
    assert.equal(cell.cellId, old.cellId); assert.equal(cell.consumedNumber, old.consumedNumber); assert.equal(after.model.section.lineSettings[0].nextAutomaticNumber, cursor);
    assert.deepEqual(result.changedSeatIds, []); assert.equal(result.addedSeatIds.length, 1); sources.push(old.kind);
  }
  return {sourceKinds: sources, preservedGapConsumption: true};
});
run('F18', 'trimmed display-label collision with an automatic seat rejects', () => {
  const before = entry({mixed: true}), after = proposed(before, m => manual(m, 2, ' A-1 ')); reject(before, after, 'DUPLICATED_DISPLAY_NUMBER');
});
run('F19', 'internal differences and identical labels in separate lines are preserved', () => {
  const before = entry({mixed: true}), after = proposed(before, m => {for (const [index, label] of [[1, 'A a'], [2, 'Aa'], [3, 'aa'], [4, 'Ａa']]) manual(m, index, label);});
  const result = check(before, after); assert.equal(result.addedSeatIds.length, 4);
  const twoLines = entry({rows: 2, mixed: true}), sameLabels = proposed(twoLines, m => {manual(m, 2, '臨時1'); manual(m, 7, '臨時1');});
  assert.equal(check(twoLines, sameLabels).addedSeatIds.length, 2);
});
run('F20', 'manual label text is preserved and formula-like text is not evaluated', () => {
  const before = entry({mixed: true}), after = proposed(before, m => manual(m, 2, ' =1+1 '));
  const fact = indexSeatFacts(after, context).facts.get(after.model.seats.at(-1).seatId);
  assert.equal(fact.seat.manualNumber, ' =1+1 '); assert.equal(fact.displayNumber, '=1+1'); assert.equal(check(before, after).addedSeatIds.length, 1);
});
run('F21', 'blank manual labels reject without mutating the inputs', () => {
  const before = entry({mixed: true}), after = proposed(before, m => manual(m, 2, '　 ')); reject(before, after, 'INVALID_LAYOUT');
});
run('F22', 'manual seats cannot carry automatic-number fields', () => {
  const before = entry({mixed: true}), after = proposed(before, m => {const s = manual(m, 2); s.number = 2; s.prefix = 'A-';}); reject(before, after, 'INVALID_SEAT_SCHEMA');
});
run('F23', 'automatic seats cannot carry a manual-number field', () => {
  const before = entry(), after = proposed(before, m => {m.seats[0].manualNumber = '別1';}); reject(before, after, 'INVALID_SEAT_SCHEMA');
});
run('F24', 'out-of-bounds positions reject', () => {
  const before = entry(), after = proposed(before, m => {m.section.cells[0].row = 10;}); reject(before, after, 'INVALID_LAYOUT');
});
run('F25', 'unknown fields cannot disappear silently from comparison', () => {
  const beforeNull = entry(), afterNull = proposed(beforeNull, m => {m.seats[0] = null;});
  reject(beforeNull, afterNull, 'INVALID_SEAT_SCHEMA');
  for (const [target, code] of [['seat', 'INVALID_SEAT_SCHEMA'], ['cell', 'INVALID_CELL_SCHEMA'], ['section', 'INVALID_SECTION_SCHEMA'], ['line', 'INVALID_LINE_SCHEMA']]) {
    const before = entry(), after = proposed(before, m => {const value = target === 'seat' ? m.seats[0] : target === 'cell' ? m.section.cells[0] : target === 'line' ? m.section.lineSettings[0] : m.section; value.unknown = true;}); reject(before, after, code);
  }
});
run('F26', 'duplicate identity rejects before index construction', () => {
  const before = entry(), after = proposed(before, m => {m.section.cells[1].cellId = m.section.cells[0].cellId;}); reject(before, after, 'INVALID_LAYOUT');
});
run('F27', 'orphan and multiply referenced seats reject', () => {
  const before = entry();
  reject(before, proposed(before, m => {m.section.cells[0].seatId = randomUUID();}), 'INVALID_LAYOUT');
  reject(before, proposed(before, m => {m.section.cells[1].seatId = m.section.cells[0].seatId;}), 'INVALID_LAYOUT');
});
run('F28', 'another performance environment or section cannot be compared', () => {
  const before = entry();
  for (const key of ['environmentId', 'performanceId']) {const after = proposed(before); after[key] = 'FAKE-other'; reject(before, after, 'WRONG_SCOPE');}
  const after = proposed(before, m => {m.section.sectionId = randomUUID(); for (const s of m.seats) s.sectionId = m.section.sectionId;}); reject(before, after, 'WRONG_SCOPE');
});
run('F29', 'reusing the base generation rejects', () => {const before = entry(); reject(before, structuredClone(before), 'REUSED_GENERATION');});
run('F30', 'unknown entry versions and incomplete input reject', () => {
  const before = entry(), after = proposed(before); after.factSchemaVersion = 999; reject(before, after, 'INVALID_ENTRY');
  delete after.factSchemaVersion; delete after.model.seats; reject(before, after, 'INVALID_MODEL');
});
run('F31', 'assignment and ticket data cannot become a second canonical source', () => {
  for (const key of ['assignments', 'ticketRefs', 'receptionRefs']) {const before = entry(), after = proposed(before, m => {m[key] = [{seatId: m.seats[0].seatId}];}); reject(before, after, 'DUPLICATED_BUSINESS_STATE');}
});
run('F32', 'slide and extension commands cannot silently use replacement', () => {
  const before = entry(), after = proposed(before); for (const kind of ['slide', 'extendGrid']) assert.throws(() => compareSections(before, after, context, kind), e => e.code === 'UNSUPPORTED_OPERATION');
});
run('F33', 'reverse extensions expose coordinate changes and need the dedicated route', () => {
  const directions = [];
  for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) {
    const before = entry({axis, order}), after = proposed(before, m => Object.assign(m, extend(m, {dimension: axis === 'horizontal' ? 'columns' : 'rows', count: 1}, context).after));
    const result = check(before, after); sameIds(result.changedSeatIds, order === 'reverse' ? before.model.seats.map(s => s.seatId) : []); directions.push({axis, order, changedSeats: result.changedSeatIds.length});
  }
  return {directions, dedicatedExtensionRequired: true};
});
run('F34', 'mutating returned facts cannot mutate source models', () => {
  const before = entry(), old = structuredClone(before), result = indexSeatFacts(before, context);
  result.facts.values().next().value.seat.usable = false; result.cells.values().next().value.column = 999;
  assert.deepEqual(before, old);
});
run('F35', 'invalid seat attributes and change reasons reject', () => {
  for (const change of [s => {s.category = 'unknown';}, s => {s.usable = 1;}, s => {s.displayOrder = -1;}, s => {s.emergencyChange = {kind: 'add', reason: ' '};}]) {
    const before = entry(), after = proposed(before, m => change(m.seats[0]));
    assert.throws(() => compareSections(before, after, context), e => e instanceof ComparisonError && ['INVALID_SEAT_ATTRIBUTES', 'INVALID_CHANGE_MARKER'].includes(e.code));
  }
});
run('F36', 'cursor changes remain visible metadata and do not prove valid numbering', () => {
  const before = entry(), after = proposed(before, m => {m.section.lineSettings[0].nextAutomaticNumber += 10;});
  const result = check(before, after); assert.deepEqual(result.changedSeatIds, []); assert.equal(result.changedLineIds.length, 1); return {numberingSourceProofStillRequired: true};
});

const endSourceHashes = await hashes(); assert.deepEqual(endSourceHashes, sourceHashes); assert.equal(reports.length, 36);
await mkdir(new URL('../artifacts/', import.meta.url), {recursive: true});
await writeFile(new URL('../artifacts/comparison-summary.json', import.meta.url), JSON.stringify({executedAt: new Date().toISOString(), runtime: {node: process.version},
  scope: '36 logical comparison unit scenarios. ID-indexed automatic/manual Seat and Cell comparison, independent of grid shape and array order. No new Rules, Emulator run, Firestore writes, auth, authoritative source proof, cleanup, SDK, UI or actual-device test. Previous 44/63 scenarios are not rerun.',
  hashLineEndings: 'LF', sourceHashes, endSourceHashes, reports}, null, 2) + '\n');
console.log(JSON.stringify({calculationScenarios: reports.length, sourceHashes: sources.length, emulatorExecuted: false, firestoreWrites: 0}));
