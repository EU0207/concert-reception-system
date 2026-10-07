import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSection, numberInitial, extend, renameSection, changeStage, validate } from '../planner.mjs';

const context = { maxCells: 10000 }; // 検証プロセスの確保予算。製品の席数上限ではない。
const sources = ['../planner.mjs', 'planner.mjs'];
const hash = async p => createHash('sha256').update((await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
const startHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)])));
const results = [];
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function run(id, name, action) { const evidence = action() ?? {}; results.push({ id, name, status: 'passed', ...evidence }); }
const specs = (count, startNumber = 1) => Array.from({ length: count }, (_, i) => ({ name: String.fromCharCode(65 + i), startNumber }));
function blank(axis = 'horizontal', seatOrder = 'forward', rows = 1, columns = 3, start = 1) {
  return createSection({ name: '架空区画', rows, columns, axis, seatOrder,
    lines: specs(axis === 'horizontal' ? rows : columns, start) }, context);
}
const selectAll = (model, kind = 'seat') => Object.fromEntries(model.section.cells.map(c => [`${c.row},${c.column}`, kind]));
const numbered = (...args) => { const model = blank(...args); return numberInitial(model, selectAll(model), context); };
const seatLabel = s => s.numberingMode === 'automatic' ? s.prefix + s.number : s.manualNumber;
function visualNumbers(model, lineIndex = 0) {
  const s = model.section, seats = new Map(model.seats.map(seat => [seat.seatId, seat]));
  return s.cells.filter(c => (s.axis === 'horizontal' ? c.row : c.column) === lineIndex)
    .sort((a, b) => s.axis === 'horizontal' ? a.column - b.column : a.row - b.row)
    .map(c => c.kind === 'seat' ? seatLabel(seats.get(c.seatId)) : c.kind);
}
function addReferences(model, count = 2) {
  model.assignments = model.seats.slice(0, count).map((s, i) => ({ attendeeId: `FAKE-attendee-${i}`, seatId: s.seatId, fixed: true }));
  model.ticketRefs = model.assignments.map((a, i) => ({ attendeeId: a.attendeeId, ticketId: `FAKE-ticket-${i}`, activeCredentialId: `FAKE-credential-ref-${i}`, revision: 1 }));
  model.seats[0].emergencyChange = { kind: 'number', reason: '架空の既存変更理由' };
  model.seats[0].category = 'reserved'; model.seats[0].reservedLabel = '架空確保席';
  return model;
}
function preserved(before, result) {
  const { after, change } = result;
  assert.deepEqual(after.assignments, before.assignments);
  assert.deepEqual(after.ticketRefs, before.ticketRefs);
  for (const s of before.seats) assert.deepEqual(after.seats.find(t => t.seatId === s.seatId), s);
  for (const c of before.section.cells) assert.deepEqual(after.section.cells.find(t => t.cellId === c.cellId),
    { ...c, row: c.row + change.translation.row, column: c.column + change.translation.column });
  for (const l of before.section.lineSettings) {
    const actual = after.section.lineSettings.find(t => t.lineId === l.lineId);
    assert.deepEqual({ ...actual, nextAutomaticNumber: l.nextAutomaticNumber }, l);
  }
  assert.equal(after.section.sectionId, before.section.sectionId);
}
function rejectUnchanged(model, action, error) {
  const snapshot = structuredClone(model); freeze(model);
  assert.throws(() => action(model), error); assert.deepEqual(model, snapshot);
}

run('G01', 'initial grid contains only unset cells and no assignments', () => {
  const model = blank('horizontal', 'forward', 5, 8);
  assert.equal(model.section.cells.length, 40); assert(model.section.cells.every(c => c.kind === 'unset'));
  assert.equal(model.seats.length, 0); assert.equal(model.assignments.length, 0);
});

for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) {
  const index = (axis === 'vertical' ? 2 : 0) + (order === 'reverse' ? 1 : 0);
  run(`G0${index + 2}`, `initial numbering ${axis} ${order} preserves logical line names`, () => {
    const model = numbered(axis, order, 2, 3, 10);
    assert.deepEqual(visualNumbers(model), order === 'forward'
      ? (axis === 'horizontal' ? ['A-10', 'A-11', 'A-12'] : ['A-10', 'A-11'])
      : (axis === 'horizontal' ? ['A-12', 'A-11', 'A-10'] : ['A-11', 'A-10']));
    assert.deepEqual(model.section.lineSettings.map(l => l.name), axis === 'horizontal' ? ['A', 'B'] : ['A', 'B', 'C']);
  });
  run(`G${String(index + 6).padStart(2, '0')}`, `tail extension ${axis} ${order} preserves occupied seats and ticket references`, () => {
    const before = addReferences(numbered(axis, order, axis === 'vertical' ? 3 : 1, axis === 'vertical' ? 1 : 3));
    const dimension = axis === 'vertical' ? 'rows' : 'columns';
    const added = order === 'reverse' ? 0 : 3;
    const result = extend(freeze(before), { dimension, count: 2,
      selections: axis === 'vertical' ? { [`${added},0`]: 'seat', [`${added + 1},0`]: 'seat' }
        : { [`0,${added}`]: 'seat', [`0,${added + 1}`]: 'seat' } }, context);
    preserved(before, result);
    assert.deepEqual(visualNumbers(result.after), order === 'reverse'
      ? ['A-5', 'A-4', 'A-3', 'A-2', 'A-1'] : ['A-1', 'A-2', 'A-3', 'A-4', 'A-5']);
    assert.equal(result.after.section.lineSettings[0].nextAutomaticNumber, 6);
    return { edge: result.change.edge, visualNumbers: visualNumbers(result.after), protectedSeats: before.seats.length };
  });
}

run('G10', 'gap consumes a number while unset space and aisle do not', () => {
  const model = numberInitial(blank('horizontal', 'forward', 1, 6, 7),
    { '0,0': 'seat', '0,1': 'gap', '0,2': 'space', '0,3': 'aisle', '0,5': 'seat' }, context);
  assert.deepEqual(visualNumbers(model), ['A-7', 'gap', 'space', 'aisle', 'unset', 'A-9']);
  assert.equal(model.section.cells[1].consumedNumber, 8);
  const result = extend(freeze(model), { dimension: 'columns', count: 2, selections: { '0,6': 'gap', '0,7': 'seat' } }, context);
  preserved(model, result); assert.equal(visualNumbers(result.after).at(-1), 'A-11');
  assert.equal(result.after.section.lineSettings[0].nextAutomaticNumber, 12);
});
run('G11', 'extension starts unset and does not consume numbers', () => {
  const before = numbered();
  const result = extend(freeze(before), { dimension: 'columns', count: 2 }, context);
  preserved(before, result); assert.deepEqual(visualNumbers(result.after), ['A-1', 'A-2', 'A-3', 'unset', 'unset']);
  assert.equal(result.after.section.lineSettings[0].nextAutomaticNumber, 4);
});
run('G12', 'repeated reverse extensions never renumber previous additions', () => {
  const first = extend(numbered('horizontal', 'reverse'), { dimension: 'columns', count: 1, selections: { '0,0': 'seat' } }, context);
  const second = extend(freeze(first.after), { dimension: 'columns', count: 1, selections: { '0,0': 'seat' } }, context);
  preserved(first.after, second); assert.deepEqual(visualNumbers(second.after), ['A-5', 'A-4', 'A-3', 'A-2', 'A-1']);
});
for (const axis of ['horizontal', 'vertical']) {
  run(axis === 'horizontal' ? 'G13' : 'G14', `new logical line ${axis} retains old line IDs and counters`, () => {
    const before = numbered(axis, 'reverse', 2, 2);
    const result = extend(freeze(before), { dimension: axis === 'horizontal' ? 'rows' : 'columns', count: 1,
      lines: [{ name: '追加列', prefix: '追加-', startNumber: 20 }],
      selections: axis === 'horizontal' ? { '2,0': 'seat', '2,1': 'gap' } : { '0,2': 'seat', '1,2': 'gap' } }, context);
    preserved(before, result);
    assert.deepEqual(result.after.section.lineSettings.slice(0, 2), before.section.lineSettings);
    assert.deepEqual(visualNumbers(result.after, 2), ['追加-21', 'gap']);
    assert.equal(result.after.section.lineSettings[2].nextAutomaticNumber, 22);
  });
}
function manualFixture(number = '枝番-特設') {
  const m = numberInitial(blank('horizontal', 'forward', 1, 3), { '0,0': 'seat', '0,1': 'gap' }, context);
  const seat = { seatId: randomUUID(), sectionId: m.section.sectionId, lineId: m.section.lineSettings[0].lineId,
    numberingMode: 'manual', manualNumber: number, category: 'general', usable: true };
  m.section.cells[2].kind = 'seat'; m.section.cells[2].seatId = seat.seatId; m.seats.push(seat);
  return validate(m, context);
}
run('G15', 'manual seat does not advance automatic cursor or overwrite consumed gap', () => {
  const before = manualFixture();
  const result = extend(freeze(before), { dimension: 'columns', count: 1, selections: { '0,3': 'seat' } }, context);
  preserved(before, result); assert.deepEqual(visualNumbers(result.after), ['A-1', 'gap', '枝番-特設', 'A-3']);
});
run('G16', 'collision between new automatic number and manual display number rejects whole plan', () => {
  const before = manualFixture('A-3');
  rejectUnchanged(before, m => extend(m, { dimension: 'columns', count: 2, selections: { '0,3': 'seat', '0,4': 'seat' } }, context), /duplicate display number/);
});
run('G17', 'independent sections may share a free name and number without merging', () => {
  const first = addReferences(numbered()), second = numbered();
  const snapshot = structuredClone(first); freeze(first);
  assert.equal(first.section.name, second.section.name); assert.notEqual(first.section.sectionId, second.section.sectionId);
  assert.equal(seatLabel(first.seats[0]), seatLabel(second.seats[0]));
  const result = extend(second, { dimension: 'columns', count: 1 }, context);
  assert.deepEqual(first, snapshot); assert.notEqual(result.after.section.sectionId, first.section.sectionId);
});
run('G18', 'rename and stage left top change only their own fields', () => {
  const before = freeze(addReferences(numbered('vertical', 'reverse')));
  const renamed = renameSection(before, '架空バルコニー・東側', context);
  assert.deepEqual({ ...renamed.section, name: before.section.name }, before.section);
  const staged = changeStage(renamed, 'top', context);
  assert.deepEqual({ ...staged.section, stagePosition: renamed.section.stagePosition }, renamed.section);
  assert.deepEqual(staged.seats, before.seats); assert.deepEqual(staged.assignments, before.assignments);
  assert.deepEqual(staged.ticketRefs, before.ticketRefs);
});
run('G19', 'performance extension requires reason and marks only added seats', () => {
  const before = addReferences(numbered());
  rejectUnchanged(before, m => extend(m, { dimension: 'columns', count: 1 }, { ...context, duringPerformance: true, reason: ' ' }), /reason required/);
  const result = extend(before, { dimension: 'columns', count: 1, selections: { '0,3': 'seat' } },
    { ...context, duringPerformance: true, reason: '架空の椅子追加' });
  preserved(before, result); assert.deepEqual(result.after.seats.at(-1).emergencyChange, { kind: 'add', reason: '架空の椅子追加' });
});
run('G20', 'invalid dimensions names directions line counts and IDs are rejected', () => {
  const good = { name: '架空区画', rows: 1, columns: 1, axis: 'horizontal', seatOrder: 'forward', lines: specs(1) };
  const invalid = [{ rows: 0 }, { columns: -1 }, { rows: 1.5 }, { rows: Number.MAX_SAFE_INTEGER },
    { name: '　 ' }, { axis: 'diagonal' }, { seatOrder: 'unknown' }, { stagePosition: 'bottom' },
    { lines: [] }, { lines: [{ name: ' ' }] }, { lines: specs(1, 0) }, { lines: [{ name: 'A', prefix: 1 }] }];
  invalid.forEach(p => assert.throws(() => createSection({ ...good, ...p }, context)));
  assert.throws(() => createSection(good, { ...context, newId: () => 'invalid' }), /invalid UUID/);
  assert.throws(() => createSection(good, { ...context, newId: () => '11111111-1111-4111-8111-111111111111' }), /duplicate or invalid ID/);
  return { rejectedVariants: invalid.length + 2 };
});
run('G21', 'invalid extension requests reject without input changes', () => {
  const before = numbered();
  const invalid = [{ dimension: 'rows', count: 0 }, { dimension: 'columns', count: -1 }, { dimension: 'columns', count: 1.5 },
    { dimension: 'diagonal', count: 1 }, { dimension: 'rows', count: 1 }, { dimension: 'rows', count: 1, lines: [] },
    { dimension: 'columns', count: 1, lines: specs(1) }, { dimension: 'columns', count: 1, selections: { '0,0': 'seat' } },
    { dimension: 'columns', count: 1, selections: { '0,3': 'unknown' } }, { dimension: 'columns', count: 10000 }];
  invalid.forEach(spec => rejectUnchanged(before, m => extend(m, spec, context)));
  return { rejectedVariants: invalid.length };
});
run('G22', 'automatic numbering overflow preserves original draft', () => {
  const before = blank('horizontal', 'forward', 1, 2, Number.MAX_SAFE_INTEGER - 1);
  rejectUnchanged(before, m => numberInitial(m, selectAll(m), context), /number overflow/);
});
run('G23', 'reinitialization and corrupted coordinates IDs or cursor are rejected', () => {
  const before = numbered();
  rejectUnchanged(before, m => numberInitial(m, selectAll(m), context), /already performed/);
  for (const corrupt of [m => { m.section.cells[1].row = -1; }, m => { m.section.cells[1].column = 0; },
    m => { m.section.cells[1].cellId = m.section.cells[0].cellId; }, m => { m.section.lineSettings[0].nextAutomaticNumber = 2; },
    m => { m.seats[0].lineId = randomUUID(); }, m => { m.assignments = [{ attendeeId: 'FAKE', seatId: randomUUID() }]; }]) {
    const bad = structuredClone(before); corrupt(bad);
    rejectUnchanged(bad, m => extend(m, { dimension: 'columns', count: 1 }, context));
  }
});
run('G24', '900 cells and 500 occupied seats survive reverse growth to 930 cells', () => {
  const before = addReferences(numbered('vertical', 'reverse', 30, 30), 500);
  const selections = Object.fromEntries(Array.from({ length: 30 }, (_, column) => [`0,${column}`, 'seat']));
  const result = extend(freeze(before), { dimension: 'rows', count: 1, selections }, context);
  preserved(before, result);
  assert.equal(result.after.section.cells.length, 930); assert.equal(result.after.seats.length, 930);
  assert.equal(result.after.assignments.length, 500); assert.equal(result.after.ticketRefs.length, 500);
  assert(result.after.section.lineSettings.every(l => l.nextAutomaticNumber === 32));
  return { beforeCells: 900, afterCells: 930, preservedAssignments: 500, preservedTicketReferences: 500,
    shiftedOldCells: 900, addedSeats: 30 };
});
run('G25', 'evaluation budget is explicit and does not become product maximum', () => {
  assert.throws(() => blankWithBudget({}), /evaluation budget required/);
  assert.throws(() => blankWithBudget({ maxCells: 899 }), /evaluation budget exceeded/);
  assert.equal(blankWithBudget({ maxCells: 900 }).section.cells.length, 900);
  function blankWithBudget(budget) { return createSection({ name: '架空区画', rows: 30, columns: 30,
    axis: 'horizontal', seatOrder: 'forward', lines: specs(30) }, budget); }
});

const endHashes = Object.fromEntries(await Promise.all(sources.map(async p => [p, await hash(p)])));
assert.deepEqual(endHashes, startHashes, 'sources changed during execution');
assert.equal(new Set(results.map(r => r.id)).size, 25); assert.equal(results.length, 25);
const report = { proof: 'GD91-07', scope: 'pure calculation only; no persistence or authorization',
  sourceHashes: startHashes, endSourceHashes: endHashes, passed: results.length, results: results.sort((a, b) => a.id.localeCompare(b.id)) };
await writeFile(new URL('../artifacts/planner-summary.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ proof: report.proof, passed: report.passed, sourceHashesVerified: true }));
