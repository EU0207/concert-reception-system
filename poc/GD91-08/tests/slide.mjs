import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend, validate } from '../../GD91-07/planner.mjs';
import { slide } from '../slide.mjs';

const context = { maxCells: 10000 };
const sources = ['../slide.mjs', 'slide.mjs', '../../GD91-07/planner.mjs'];
const hash = async p => createHash('sha256').update((await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)])));
const reports = [];
const directions = [['up', -1, 0, 'down'], ['down', 1, 0, 'up'], ['left', 0, -1, 'right'], ['right', 0, 1, 'left']];
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function run(id, name, action) { reports.push({ id, name, status: 'passed', ...(action() ?? {}) }); }
function blank(axis = 'horizontal', order = 'forward', rows = 4, columns = 4) {
  return createSection({ name: '架空バルコニー', rows, columns, axis, seatOrder: order, stagePosition: 'top',
    lines: Array.from({ length: axis === 'horizontal' ? rows : columns }, (_, i) => ({ name: `L${i}`, startNumber: 7 })) }, { maxCells: context.maxCells });
}
const allSeats = m => Object.fromEntries(m.section.cells.map(c => [`${c.row},${c.column}`, 'seat']));
function references(model, occupants = Math.min(3, model.seats.length)) {
  model.environmentId = 'FAKE-environment'; model.performanceId = 'FAKE-performance';
  model.assignments = model.seats.slice(0, occupants).map((s, i) => ({ seatId: s.seatId, attendeeId: `FAKE-attendee-${i}`, fixed: true }));
  model.ticketRefs = model.assignments.map((a, i) => ({ attendeeId: a.attendeeId, ticketId: `FAKE-ticket-${i}`, activeCredentialId: `FAKE-credential-reference-${i}`, revision: 2 }));
  model.receptionRefs = model.assignments.map((a, i) => ({ attendeeId: a.attendeeId, firstReceptionId: `FAKE-reception-${i}` }));
  if (model.seats.length) Object.assign(model.seats[0], { category: 'reserved', reservedLabel: '架空確保', emergencyChange: { kind: 'number', reason: '架空の既存理由' } });
  if (model.seats.length > 1) Object.assign(model.seats[1], { category: 'special', usable: false });
  return validate(model, context);
}
function fixture(axis, order, direction, blockKind) {
  const b = blank(axis, order), selections = allSeats(b);
  const boundary = b.section.cells.filter(c => direction === 'up' ? c.row === 0 : direction === 'down' ? c.row === 3 : direction === 'left' ? c.column === 0 : c.column === 3);
  boundary.forEach(c => { selections[`${c.row},${c.column}`] = 'unset'; });
  Object.assign(selections, { '1,1': 'gap', '1,2': 'space', '2,1': 'aisle' });
  if (blockKind) selections[`${boundary[0].row},${boundary[0].column}`] = blockKind;
  const m = numberInitial(b, selections, { maxCells: context.maxCells });
  const manual = m.seats.find(s => s.seatId === m.section.cells.find(c => c.row === 2 && c.column === 2).seatId);
  manual.numberingMode = 'manual'; manual.manualNumber = '枝番-仮設'; delete manual.prefix; delete manual.number;
  return references(m);
}
function assertPreserved(before, result, dr, dc) {
  const a = result.after;
  assert.equal(a.section.sectionId, before.section.sectionId);
  for (const key of ['rows', 'columns', 'name', 'axis', 'seatOrder', 'stagePosition']) assert.equal(a.section[key], before.section[key]);
  for (const key of ['seats', 'assignments', 'ticketRefs', 'receptionRefs', 'environmentId', 'performanceId']) assert.deepEqual(a[key], before[key]);
  assert.deepEqual(a.section.cells.map(c => c.cellId).sort(), before.section.cells.map(c => c.cellId).sort());
  assert.equal(new Set(a.section.cells.map(c => `${c.row},${c.column}`)).size, a.section.cells.length);
  const counts = cells => Object.fromEntries(['unset', 'seat', 'gap', 'space', 'aisle'].map(k => [k, cells.filter(c => c.kind === k).length]));
  assert.deepEqual(counts(a.section.cells), counts(before.section.cells));
  for (const c of before.section.cells) {
    const actual = a.section.cells.find(x => x.cellId === c.cellId);
    assert.deepEqual({ ...actual, row: c.row, column: c.column }, c);
    if (c.kind !== 'unset') { assert.equal(actual.row, c.row + dr); assert.equal(actual.column, c.column + dc); }
  }
  for (const line of before.section.lineSettings) {
    const actual = a.section.lineSettings.find(l => l.lineId === line.lineId);
    assert.deepEqual({ ...actual, index: line.index }, line);
  }
  validate(a, context);
}
function rejectUnchanged(model, action, expected) {
  const snapshot = structuredClone(model); freeze(model);
  assert.throws(() => action(model), expected); assert.deepEqual(model, snapshot);
}

let index = 0;
for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) for (const [direction, dr, dc, opposite] of directions) {
  run(`S${String(++index).padStart(2, '0')}`, `${axis} ${order} ${direction}: IDs labels cursor and references preserved`, () => {
    const before = fixture(axis, order, direction), snapshot = structuredClone(before);
    const result = slide(freeze(before), { direction, amount: 1 }, context);
    assert.equal(result.change.changed, true); assertPreserved(before, result, dr, dc); assert.deepEqual(before, snapshot);
    const back = slide(result.after, { direction: opposite, amount: 1 }, context);
    assert.deepEqual(back.after, before);
    return { axis, order, direction, inverseRestored: true, occupiedReferences: before.assignments.length };
  });
}
run('S17', 'right shift matches named example and the empty cell ID moves to the vacated edge', () => {
  const before = numberInitial(createSection({ name: '架空区画', rows: 1, columns: 3, axis: 'horizontal', seatOrder: 'forward', lines: [{ name: 'A' }] }, context), { '0,0': 'seat', '0,1': 'seat' }, context);
  const oldEmpty = before.section.cells[2].cellId;
  const result = slide(freeze(before), { direction: 'right', amount: 1 }, context);
  const seats = new Map(result.after.seats.map(s => [s.seatId, s]));
  const labels = result.after.section.cells.slice().sort((a, b) => a.column - b.column).map(c => c.kind === 'seat' ? seats.get(c.seatId).prefix + seats.get(c.seatId).number : '未');
  assert.deepEqual(labels, ['未', 'A-1', 'A-2']);
  assert.equal(result.after.section.cells.find(c => c.column === 0).cellId, oldEmpty);
  return { visualNumbers: labels };
});
run('S18', 'one non-unset cell blocks the entire boundary in every direction', () => {
  let variants = 0;
  for (const [direction] of directions) for (const kind of ['seat', 'gap', 'space', 'aisle']) {
    const before = fixture('horizontal', 'forward', direction, kind);
    rejectUnchanged(before, m => slide(m, { direction, amount: 1 }, context), /boundary is not empty/); variants++;
  }
  return { rejectedVariants: variants };
});
run('S19', 'invalid direction and movement amounts never change input', () => {
  const before = fixture('vertical', 'reverse', 'right');
  const commands = [{ direction: 'diagonal', amount: 1 }, { direction: '__proto__', amount: 1 },
    ...[0, -1, 2, 1.5, Number.NaN, '1', undefined].map(amount => ({ direction: 'right', amount }))];
  commands.forEach(command => rejectUnchanged(before, m => slide(m, command, context), /invalid slide command/));
  return { rejectedVariants: commands.length };
});
run('S20', 'corrupt cell identities coordinates references and counters are rejected', () => {
  const good = fixture('horizontal', 'forward', 'right');
  const attacks = [m => { m.section.cells[0].row = -1; }, m => { m.section.cells[0].column = 4; },
    m => { m.section.cells[0].cellId = m.section.cells[1].cellId; }, m => { m.section.lineSettings[0].nextAutomaticNumber = 7; },
    m => { m.section.cells.find(c => c.kind === 'unset').seatId = m.seats[0].seatId; },
    m => { m.section.cells.find(c => c.kind === 'unset').consumedNumber = 1; }, m => { m.seats[0].lineId = randomUUID(); },
    m => { m.assignments[0].seatId = randomUUID(); }];
  for (const attack of attacks) { const bad = structuredClone(good); attack(bad); rejectUnchanged(bad, m => slide(m, { direction: 'right', amount: 1 }, context)); }
  return { rejectedVariants: attacks.length };
});
run('S21', 'all-unset grids are no-op including single-row and single-column cases', () => {
  let variants = 0;
  for (const [rows, columns] of [[1, 1], [1, 3], [3, 1]]) for (const [direction] of directions) {
    const before = numberInitial(blank('horizontal', 'forward', rows, columns), {}, context);
    const result = slide(freeze(before), { direction, amount: 1 }, context);
    assert.equal(result.change.changed, false); assert.deepEqual(result.after, before); variants++;
  }
  return { noOpVariants: variants };
});
run('S22', 'extension then slide preserves 900 seats and 500 references in four numbering profiles', () => {
  const profiles = [];
  for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) {
    const b = blank(axis, order, 30, 30), numbered = references(numberInitial(b, allSeats(b), context), 500);
    const extended = extend(numbered, { dimension: axis === 'horizontal' ? 'columns' : 'rows', count: 1 }, { maxCells: context.maxCells }).after;
    const direction = axis === 'horizontal' ? (order === 'forward' ? 'right' : 'left') : (order === 'forward' ? 'down' : 'up');
    const [, dr, dc] = directions.find(d => d[0] === direction);
    const result = slide(freeze(extended), { direction, amount: 1 }, context);
    assertPreserved(extended, result, dr, dc);
    assert.equal(result.after.seats.length, 900); assert.equal(result.after.section.cells.length, 930);
    profiles.push({ axis, order, direction, seats: 900, cells: 930, assignments: 500, ticketReferences: 500, receptionReferences: 500 });
  }
  return { profiles };
});
run('S23', 'repeated slide stops at occupied edge and preserves the last valid plan', () => {
  const b = blank('horizontal', 'forward', 1, 3);
  const first = slide(numberInitial(b, { '0,0': 'seat' }, context), { direction: 'right', amount: 1 }, context);
  const second = slide(first.after, { direction: 'right', amount: 1 }, context);
  assert.equal(second.after.section.cells.find(c => c.kind === 'seat').column, 2);
  rejectUnchanged(second.after, m => slide(m, { direction: 'right', amount: 1 }, context), /boundary is not empty/);
});
run('S24', 'another free-named section is unchanged', () => {
  const other = fixture('vertical', 'reverse', 'right'), snapshot = structuredClone(other);
  freeze(other); const first = fixture('vertical', 'reverse', 'right');
  assert.notEqual(first.section.sectionId, other.section.sectionId); assert.equal(first.section.name, other.section.name);
  slide(first, { direction: 'right', amount: 1 }, context); assert.deepEqual(other, snapshot);
});
run('S25', 'manual seat converted from gap retains consumed number and cursor', () => {
  const b = blank('horizontal', 'forward', 1, 6);
  const before = numberInitial(b, { '0,0': 'seat', '0,1': 'gap', '0,2': 'gap', '0,3': 'space', '0,4': 'aisle' }, context);
  const cell = before.section.cells[1], line = before.section.lineSettings[0];
  cell.kind = 'seat'; cell.seatId = randomUUID();
  before.seats.push({ seatId: cell.seatId, sectionId: before.section.sectionId, lineId: line.lineId, numberingMode: 'manual', manualNumber: 'L0-8a', category: 'general', usable: true });
  const result = slide(freeze(before), { direction: 'right', amount: 1 }, context);
  assertPreserved(before, result, 0, 1); assert.equal(result.after.section.cells.find(c => c.cellId === cell.cellId).consumedNumber, 8);
  assert.equal(result.after.section.lineSettings[0].nextAutomaticNumber, 10);
});
run('S26', 'output shares no mutable records with original input and allocates no IDs', () => {
  const before = fixture('horizontal', 'forward', 'right'), snapshot = structuredClone(before);
  const result = slide(before, { direction: 'right', amount: 1 }, { ...context, newId: () => { throw new Error('slide must not allocate IDs'); } });
  result.after.section.cells[0].kind = 'FAKE-mutation'; result.after.section.lineSettings[0].name = '架空の出力側変更';
  result.after.seats[0].reservedLabel = '架空の出力側変更'; result.after.ticketRefs[0].revision++;
  assert.deepEqual(before, snapshot);
});
run('S27', 'unnumbered draft is not treated as a confirmed layout', () => {
  rejectUnchanged(blank(), m => slide(m, { direction: 'right', amount: 1 }, context), /initial numbering required/);
});

const endSourceHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)])));
assert.deepEqual(endSourceHashes, sourceHashes, 'sources changed during execution');
assert.equal(reports.length, 27); assert.equal(new Set(reports.map(r => r.id)).size, 27);
await writeFile(new URL('../artifacts/slide-summary.json', import.meta.url), JSON.stringify({ proof: 'GD91-08', scope: 'pure slide calculation only', sourceHashes, endSourceHashes, passed: reports.length, reports }, null, 2) + '\n');
console.log(JSON.stringify({ proof: 'GD91-08', passed: reports.length, sourceHashesVerified: true }));
