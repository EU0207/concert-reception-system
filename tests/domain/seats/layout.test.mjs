import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayout, createSection, numberInitial, reconfigureSection, extendSection, renameSection,
  changeStage, addManualSeat, editUnassignedSeat, slideSection, assessSeatChanges,
  validateLayout, displayNumber, formatSeatDisplayName, projectBaseLayout, SeatDomainError } from '../../../src/domain/seats/index.ts';

const uuid = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const scope = { environmentId: uuid(1), performanceId: uuid(2) };
const options = () => { let n = 100; return { newId: () => uuid(n++) }; };
const cell = (m, row, column) => m.section.cells.find(c => c.row === row && c.column === column);
const model = layout => layout.sections[0];
const labels = layout => { const m = model(layout), byId = new Map(m.seats.map(s => [s.seatId, s]));
  return [...m.section.cells].sort((a, b) => a.row - b.row || a.column - b.column)
    .map(c => c.kind === 'seat' ? displayNumber(byId.get(c.seatId)) : c.kind === 'gap' ? `gap${c.consumedNumber}` : c.kind); };
const select = (m, kinds) => Object.fromEntries(kinds.map(([r, c, kind]) => [cell(m, r, c).cellId, kind]));
function fixture({ rows = 1, columns = 6, axis = 'horizontal', seatOrder = 'forward', startNumber = 1,
  kinds = [[0, 0, 'seat'], [0, 1, 'gap'], [0, 2, 'space'], [0, 3, 'seat'], [0, 4, 'aisle'], [0, 5, 'seat']] } = {}) {
  const opts = options(), count = axis === 'horizontal' ? rows : columns;
  const blank = createSection(createLayout(scope), { name: '架空区画', rows, columns, axis, seatOrder,
    lines: Array.from({ length: count }, (_, i) => ({ name: String.fromCharCode(65 + i), startNumber })) }, opts).after;
  const layout = numberInitial(blank, model(blank).section.sectionId, select(model(blank), kinds), opts).after;
  return { blank, layout, opts, sectionId: model(layout).section.sectionId };
}
function protect(layout, seat = model(layout).seats[0], state = {}) {
  const copy = structuredClone(layout), attendeeId = uuid(10);
  copy.assignments.push({ ...scope, attendeeId, seatId: seat.seatId, fixed: false, revision: 1 });
  copy.ticketProtections.push({ ...scope, attendeeId, issued: false, sent: false, hasIssuedHistory: false,
    activeCredentialId: null, ...state });
  return copy;
}
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
function rejects(code, f) { assert.throws(f, e => e instanceof SeatDomainError && e.code === code); }
function slideCommand(f, direction) { return { ...scope, operationId: uuid(20), sectionId: f.sectionId, direction, amount: 1,
  expectedVersions: { layoutRevision: 1, assignmentRevision: 2, ticketRevision: 3, controlRevision: 4 } }; }

test('DD91-T01 通常順・5種別は席だけを参照し、gapだけ番号を消費する', () => {
  const f = fixture(); assert.deepEqual(labels(f.layout), ['A-1', 'gap2', 'space', 'A-3', 'aisle', 'A-4']);
  assert.equal(model(f.layout).seats.length, 3); assert.equal(model(f.layout).section.lineSettings[0].nextAutomaticNumber, 5);
  assert.deepEqual(model(f.layout).section.cells.map(c => c.cellId), model(f.blank).section.cells.map(c => c.cellId));
});
test('DD91-T02 逆順は列内だけ反転し、開始番号と固定IDを維持する', () => {
  const f = fixture({ seatOrder: 'reverse', startNumber: 7 });
  assert.deepEqual(labels(f.layout), ['A-10', 'gap9', 'space', 'A-8', 'aisle', 'A-7']);
  assert.equal(model(f.layout).section.lineSettings[0].name, 'A');
  assert.deepEqual(model(f.layout).section.cells.map(c => c.cellId), model(f.blank).section.cells.map(c => c.cellId));
});
for (const seatOrder of ['forward', 'reverse']) test(`DD91-T03 縦・${seatOrder}でも列名A/Bの順を維持`, () => {
  const f = fixture({ rows: 3, columns: 2, axis: 'vertical', seatOrder, kinds: Array.from({ length: 6 }, (_, i) => [Math.floor(i / 2), i % 2, 'seat']) });
  assert.deepEqual(labels(f.layout), seatOrder === 'forward'
    ? ['A-1', 'B-1', 'A-2', 'B-2', 'A-3', 'B-3'] : ['A-3', 'B-3', 'A-2', 'B-2', 'A-1', 'B-1']);
});
test('DD91-T04 5種別の往復変更を未割当で計算し、未を確定案へ保持する', () => {
  let { layout, sectionId, opts } = fixture(); const id = cell(model(layout), 0, 0).cellId;
  for (const kind of ['gap', 'space', 'aisle', 'unset', 'seat']) {
    layout = reconfigureSection(layout, sectionId, { selections: { [id]: kind } }, opts).after;
    assert.equal(model(layout).section.cells.find(c => c.cellId === id).kind, kind); validateLayout(layout);
  }
});
for (const startNumber of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) test(`DD91-T05 不正開始番号 ${startNumber}`, () => {
  rejects('INVALID_LINE', () => fixture({ startNumber }));
});
test('DD91-T05 次番号のオーバーフローで入力を変更しない', () => {
  const { blank, opts, sectionId } = fixture({ startNumber: Number.MAX_SAFE_INTEGER, kinds: [] });
  const before = structuredClone(blank); frozen(blank);
  rejects('NUMBER_OVERFLOW', () => numberInitial(blank, sectionId, select(model(blank), [[0, 0, 'seat']]), opts));
  assert.deepEqual(blank, before);
});
test('DD91-T04・05 参照欠落、座標・ID重複と非席への偽の席参照を拒否', () => {
  const f = fixture();
  for (const [code, change] of [
    ['INVALID_SEAT_REFERENCE', l => { delete model(l).section.cells[0].seatId; }],
    ['DUPLICATE_COORDINATE', l => { model(l).section.cells[1].column = 0; }],
    ['DUPLICATE_ID', l => { model(l).section.cells[1].cellId = model(l).section.cells[0].cellId; }],
    ['NON_SEAT_REFERENCE', l => { model(l).section.cells[2].seatId = model(l).seats[0].seatId; }],
    ['SCOPE_MISMATCH', l => { model(l).seats[0].performanceId = uuid(3); }],
  ]) { const copy = structuredClone(f.layout); change(copy); rejects(code, () => validateLayout(copy)); }
});
test('DD91-T06 未発券の割当済み席も、構成操作では自動解除しない', () => {
  const f = fixture(), before = protect(f.layout); frozen(before);
  rejects('ASSIGNED_SEAT_REQUIRES_RELEASE', () => reconfigureSection(before, f.sectionId,
    { selections: { [model(before).section.cells[0].cellId]: 'gap' } }, f.opts));
  assert.equal(before.assignments.length, 1);
});
for (const state of [{ issued: true }, { issued: false, hasIssuedHistory: true }, { activeCredentialId: 'A'.repeat(22) }, { sent: true }])
  test(`DD91-T06・13 発券保護をチェック解除で迂回できない ${Object.keys(state).join('/')}`, () => {
    const f = fixture(), before = protect(f.layout, model(f.layout).seats[0], state);
    rejects('ISSUED_SEAT_PROTECTED', () => reconfigureSection(before, f.sectionId, { seatOrder: 'reverse' }, f.opts));
  });
test('DD91-T13 券参照欠落・二重割当を未発券や空席とみなさない', () => {
  const f = fixture(), before = protect(f.layout);
  const missing = structuredClone(before); missing.ticketProtections = [];
  rejects('MISSING_TICKET_PROTECTION', () => validateLayout(missing));
  before.assignments.push({ ...before.assignments[0] }); rejects('INVALID_ASSIGNMENT', () => validateLayout(before));
});
for (const [axis, seatOrder, dimension, edge] of [
  ['horizontal', 'forward', 'columns', 'right'], ['horizontal', 'reverse', 'columns', 'left'],
  ['vertical', 'forward', 'rows', 'bottom'], ['vertical', 'reverse', 'rows', 'top'],
]) test(`DD91-T26・27 ${edge}への拡張は発券済み席の番号・ID・相対位置を保持`, () => {
  const f = fixture({ rows: 2, columns: 2, axis, seatOrder, kinds: [[0, 0, 'seat'], [1, 1, 'gap']] });
  const before = protect(f.layout, model(f.layout).seats[0], { hasIssuedHistory: true }); frozen(before);
  const coordinate = axis === 'horizontal' ? `0,${seatOrder === 'reverse' ? 0 : 2}` : `${seatOrder === 'reverse' ? 0 : 2},0`;
  const p = extendSection(before, f.sectionId, { dimension, count: 1, selections: { [coordinate]: 'seat' } }, f.opts);
  const oldSeat = model(before).seats[0]; assert.deepEqual(model(p.after).seats.find(s => s.seatId === oldSeat.seatId), oldSeat);
  assert.deepEqual(p.after.assignments, before.assignments); assert.deepEqual(p.after.ticketProtections, before.ticketProtections);
  assert.equal(model(p.after).seats.length, 2); assert.equal(before.sections[0].section.rows, 2);
  assert.equal(model(p.after).section.cells.find(c => c.seatId === oldSeat.seatId).cellId,
    model(before).section.cells.find(c => c.seatId === oldSeat.seatId).cellId);
});
test('DD91-T27 既存セルを拡張分の採番に混ぜず、新しい採番列は明示設定する', () => {
  const f = fixture(); rejects('EXISTING_CELL_IN_EXTENSION', () => extendSection(f.layout, f.sectionId,
    { dimension: 'columns', count: 1, selections: { '0,0': 'seat' } }, f.opts));
  rejects('NEW_LINES_REQUIRED', () => extendSection(f.layout, f.sectionId, { dimension: 'rows', count: 1 }, f.opts));
  const p = extendSection(f.layout, f.sectionId, { dimension: 'rows', count: 1, lines: [{ name: '新列', startNumber: 11 }], selections: { '1,0': 'seat' } }, f.opts);
  assert.equal(displayNumber(model(p.after).seats.at(-1)), '新列-11');
  assert.deepEqual(model(p.after).section.lineSettings[0], model(f.layout).section.lineSettings[0]);
});
test('DD91-T28 舞台だけの切替は採番・方向と配置を変えない', () => {
  const f = fixture(), p = changeStage(protect(f.layout), f.sectionId, 'top');
  assert.equal(model(p.after).section.stagePosition, 'top'); assert.deepEqual(labels(p.after), labels(f.layout));
  assert.deepEqual(model(p.after).seats, model(f.layout).seats); assert.deepEqual(model(p.after).section.cells, model(f.layout).section.cells);
});
test('DD91-T30 未割当の番号変更はmanual化し、他席と次番号を保持', () => {
  const f = fixture(), original = model(f.layout).seats[0], p = editUnassignedSeat(f.layout, f.sectionId, original.seatId,
    { number: ' 補助-2a ', reason: '架空の番号修正' }, f.opts);
  const s = model(p.after).seats[0]; assert.equal(s.seatId, original.seatId); assert.equal(s.numberingMode, 'manual');
  assert.equal(displayNumber(s), '補助-2a'); assert.equal(s.number, undefined); assert.equal(s.prefix, undefined);
  assert.deepEqual(model(p.after).seats.slice(1), model(f.layout).seats.slice(1));
  assert.deepEqual(model(p.after).section.lineSettings, model(f.layout).section.lineSettings);
});
test('DD91-T30 別列への位置変更でも表示番号を変えず、両セルIDを保持', () => {
  const f = fixture({ rows: 2, columns: 2, kinds: [[0, 0, 'seat'], [1, 1, 'space']] });
  const target = cell(model(f.layout), 1, 1), source = cell(model(f.layout), 0, 0), seat = model(f.layout).seats[0];
  const p = editUnassignedSeat(f.layout, f.sectionId, seat.seatId, { targetCellId: target.cellId, reason: '架空の位置修正' }, f.opts);
  assert.equal(cell(model(p.after), 0, 0).kind, 'space'); assert.equal(cell(model(p.after), 0, 0).cellId, source.cellId);
  assert.equal(cell(model(p.after), 1, 1).cellId, target.cellId); assert.equal(displayNumber(model(p.after).seats[0]), displayNumber(seat));
  assert.equal(model(p.after).seats[0].numberingMode, 'manual');
});
test('DD91-T30 個別編集の空理由・占有先・割当済みを拒否', () => {
  const f = fixture(), seat = model(f.layout).seats[0];
  rejects('INVALID_REASON', () => editUnassignedSeat(f.layout, f.sectionId, seat.seatId, { number: '補助', reason: '　' }));
  rejects('OCCUPIED_MOVE_TARGET', () => editUnassignedSeat(f.layout, f.sectionId, seat.seatId,
    { targetCellId: model(f.layout).section.cells[3].cellId, reason: '架空' }));
  rejects('ASSIGNED_SEAT_REQUIRES_RELEASE', () => editUnassignedSeat(protect(f.layout), f.sectionId, seat.seatId, { number: '補助', reason: '架空' }));
});
test('DD91-T31 区画の同名・名前変更でsectionIdと他区画を変えない', () => {
  const f = fixture(), p = createSection(f.layout, { name: '架空区画', rows: 1, columns: 1, axis: 'horizontal', seatOrder: 'forward', lines: [{ name: 'A' }] }, f.opts);
  const renamed = renameSection(p.after, f.sectionId, 'バルコニー').after;
  assert.equal(model(renamed).section.sectionId, f.sectionId); assert.deepEqual(renamed.sections[1], p.after.sections[1]);
  assert.deepEqual(model(renamed).seats, model(f.layout).seats);
  rejects('INVALID_SECTION_NAME', () => renameSection(f.layout, f.sectionId, '　'));
});
for (const kind of ['unset', 'gap', 'space', 'aisle']) test(`DD91-T33・34 ${kind}からの手入力席は既存番号・次番号を保持`, () => {
  const f = fixture({ kinds: [[0, 0, 'seat'], [0, 1, kind], [0, 2, 'seat']] }), target = cell(model(f.layout), 0, 1);
  const p = addManualSeat(f.layout, f.sectionId, target.cellId, ' 臨時1 ', '架空の補助席', f.opts);
  const next = model(p.after), c = next.section.cells.find(c => c.cellId === target.cellId);
  assert.equal(c.cellId, target.cellId); assert.equal(c.consumedNumber, target.consumedNumber);
  assert.equal(displayNumber(next.seats.at(-1)), '臨時1'); assert.deepEqual(next.section.lineSettings, model(f.layout).section.lineSettings);
  assert.deepEqual(next.seats.slice(0, -1), model(f.layout).seats); assert.equal(p.after.assignments.length, 0);
});
test('DD91-T34 手入力と自動の重複、空番号、既存席への追加を拒否', () => {
  const f = fixture(), target = cell(model(f.layout), 0, 2);
  rejects('DUPLICATE_DISPLAY_NUMBER', () => addManualSeat(f.layout, f.sectionId, target.cellId, ' A-1 ', '架空', f.opts));
  rejects('INVALID_MANUAL_NUMBER', () => addManualSeat(f.layout, f.sectionId, target.cellId, '　', '架空', f.opts));
  rejects('INVALID_MANUAL_TARGET', () => addManualSeat(f.layout, f.sectionId, model(f.layout).section.cells[0].cellId, '補助', '架空', f.opts));
});
test('DD91-T33・36 手入力の大文字小文字・全半角を勝手に統合しない', () => {
  const f = fixture(), a = addManualSeat(f.layout, f.sectionId, cell(model(f.layout), 0, 2).cellId, 'a-1', '架空', f.opts).after;
  const b = addManualSeat(a, f.sectionId, cell(model(a), 0, 4).cellId, 'Ａ-1', '架空', f.opts).after;
  assert(labels(b).includes('A-1')); assert(labels(b).includes('a-1')); assert(labels(b).includes('Ａ-1'));
});
test('DD91-T27・34 後続の自動採番が手入力番号へ衝突したら全体を拒否', () => {
  const f = fixture(), m = model(f.layout), before = addManualSeat(f.layout, f.sectionId, cell(m, 0, 2).cellId, 'A-5', '架空', f.opts).after;
  frozen(before); rejects('DUPLICATE_DISPLAY_NUMBER', () => extendSection(before, f.sectionId,
    { dimension: 'columns', count: 1, selections: { '0,6': 'seat' } }, f.opts));
  assert.equal(model(before).section.columns, 6);
});
test('DD91-T33・35 当日の追加だけに緊急情報を付け、通常の舞台・スライドでは書換えない', () => {
  const f = fixture({ columns: 3, kinds: [[0, 0, 'seat']] });
  const emergency = { operationId: uuid(30), markedAt: 1000, reason: '架空の臨時設置' };
  const p = addManualSeat(f.layout, f.sectionId, cell(model(f.layout), 0, 1).cellId, '臨時1', emergency.reason,
    { ...f.opts, duringPerformance: true, emergency });
  assert.deepEqual(model(p.after).seats.at(-1).emergencyChange, { ...emergency, kind: 'add' });
  assert.deepEqual(model(changeStage(p.after, f.sectionId, 'top').after).seats, model(p.after).seats);
  rejects('EMERGENCY_CONTEXT_REQUIRED', () => addManualSeat(f.layout, f.sectionId, cell(model(f.layout), 0, 2).cellId,
    '臨時2', '架空', { ...f.opts, duringPerformance: true }));
  rejects('FULL_RECONFIGURATION_DURING_PERFORMANCE', () => reconfigureSection(p.after, f.sectionId, {}, { duringPerformance: true }));
});
for (const direction of ['up', 'down', 'left', 'right']) test(`DD91-T42 ${direction}全体スライドは発券済み・ID・列を保持`, () => {
  const f = fixture({ rows: 3, columns: 3, kinds: [[1, 1, 'seat']] });
  const before = protect(f.layout, model(f.layout).seats[0], { issued: true }); frozen(before);
  const p = slideSection(before, slideCommand(f, direction));
  assert.deepEqual(model(p.after).seats, model(before).seats); assert.deepEqual(p.after.assignments, before.assignments);
  assert.deepEqual(p.after.ticketProtections, before.ticketProtections);
  assert.deepEqual(model(p.after).section.cells.map(c => c.cellId).sort(), model(before).section.cells.map(c => c.cellId).sort());
  assert.equal(p.impact.affectedAttendeeIds.length, 1); assert.equal(Object.hasOwn(p.after, 'reason'), false);
  validateLayout(p.after);
});
for (const kind of ['seat', 'gap', 'space', 'aisle']) test(`DD91-T43 外周${kind}を空きと誤認しない`, () => {
  const f = fixture({ rows: 1, columns: 2, kinds: [[0, 1, kind]] });
  rejects('SLIDE_BOUNDARY_NOT_UNSET', () => slideSection(f.layout, slideCommand(f, 'right')));
});
test('DD91-T43 全未は変更なし。斜め・複数量・理由フィールドと別公演を拒否', () => {
  const f = fixture({ columns: 2, kinds: [] }), command = slideCommand(f, 'right');
  assert.equal(slideSection(f.layout, command).impact.changed, false);
  for (const extra of [{ direction: 'diagonal' }, { amount: 2 }]) rejects('INVALID_SLIDE_DIRECTION', () => slideSection(f.layout, { ...command, ...extra }));
  rejects('INVALID_SLIDE_COMMAND', () => slideSection(f.layout, { ...command, reason: '架空' }));
  rejects('SCOPE_MISMATCH', () => slideSection(f.layout, { ...command, performanceId: uuid(3) }));
});
test('DD91-T42 スライドで列ID・名前・次番号を追従し、縦・横と逆順で2回移動しない', () => {
  for (const axis of ['horizontal', 'vertical']) for (const seatOrder of ['forward', 'reverse']) {
    const f = fixture({ rows: 3, columns: 3, axis, seatOrder, kinds: [[1, 1, 'seat']] });
    const command = slideCommand(f, axis === 'horizontal' ? 'up' : 'left'), p = slideSection(f.layout, command);
    const seat = model(p.after).seats[0], line = model(p.after).section.lineSettings.find(l => l.lineId === seat.lineId);
    assert.equal(line.index, 0); assert.equal(line.nextAutomaticNumber, model(f.layout).section.lineSettings[1].nextAutomaticNumber);
    assert.deepEqual(slideSection(f.layout, command).after, p.after); // 同じ基準からの再計算。
  }
});
test('DD91-T11 購入者名を入力・出力せず、表示名の原値とUnicodeコードポイントを保持', () => {
  assert.deepEqual(formatSeatDisplayName('田中　太郎'), { raw: '田中　太郎', characterCount: 4, lines: ['田中', '太郎'] });
  assert.deepEqual(formatSeatDisplayName('一二三四五六').lines, ['一二三', '四五六']);
  assert.deepEqual(formatSeatDisplayName('一 二 三 四 五 六').lines, ['一二三', '四五六']);
  assert.equal(formatSeatDisplayName('😀😀😀😀😀😀').characterCount, 6);
  assert.deepEqual(formatSeatDisplayName('').lines, []);
  rejects('DISPLAY_NAME_TOO_LONG', () => formatSeatDisplayName('一二三四五六七'));
  rejects('INVALID_DISPLAY_NAME', () => formatSeatDisplayName('一\n二'));
});
test('DD91-T102 16区画・256列・総4096セルを検査し、他区画分も合算', () => {
  const opts = options(); let layout = createLayout(scope);
  for (let i = 0; i < 16; i++) layout = createSection(layout, { name: '架空区画', rows: 256, columns: 1,
    axis: 'horizontal', seatOrder: 'forward', lines: Array.from({ length: 256 }, () => ({ name: 'A' })) }, opts).after;
  validateLayout(layout); assert.equal(layout.sections.reduce((n, m) => n + m.section.cells.length, 0), 4096);
  rejects('SECTION_LIMIT', () => createSection(layout, { name: '超過', rows: 1, columns: 1, axis: 'horizontal', seatOrder: 'forward', lines: [{ name: 'A' }] }, opts));
  const large = fixture({ rows: 1, columns: 4096, kinds: [] });
  rejects('CELL_LIMIT', () => extendSection(large.layout, large.sectionId, { dimension: 'columns', count: 1 }, large.opts));
  rejects('LINE_LIMIT', () => createSection(createLayout(scope), { name: '超過', rows: 257, columns: 1, axis: 'horizontal', seatOrder: 'forward', lines: [] }, opts));
});
test('DD91-T102 文字長の境界と超過は生成前後で同じ上限', () => {
  const f = fixture(), p = renameSection(f.layout, f.sectionId, '区'.repeat(100)); validateLayout(p.after);
  rejects('INVALID_SECTION_NAME', () => renameSection(f.layout, f.sectionId, '区'.repeat(101)));
  const c = cell(model(f.layout), 0, 2);
  assert.equal(displayNumber(model(addManualSeat(f.layout, f.sectionId, c.cellId, '番'.repeat(64), '由'.repeat(200), f.opts).after).seats.at(-1)).length, 64);
  rejects('INVALID_MANUAL_NUMBER', () => addManualSeat(f.layout, f.sectionId, c.cellId, '番'.repeat(65), '架空', f.opts));
  rejects('INVALID_REASON', () => addManualSeat(f.layout, f.sectionId, c.cellId, '補助', '由'.repeat(201), f.opts));
});
test('DD91-T05・102 不正IDと過去IDの再利用を拒否し、削除IDを変更影響へ返す', () => {
  rejects('INVALID_OR_REUSED_ID', () => createSection(createLayout(scope), { name: '区画', rows: 1, columns: 1,
    axis: 'horizontal', seatOrder: 'forward', lines: [{ name: 'A' }] }, { newId: () => uuid(50), retiredIds: [uuid(50)] }));
  const f = fixture(), old = model(f.layout).seats[0];
  const p = reconfigureSection(f.layout, f.sectionId, { selections: { [cell(model(f.layout), 0, 0).cellId]: 'space' } }, f.opts);
  assert(p.impact.retiredIds.includes(old.seatId));
  rejects('INVALID_OR_REUSED_ID', () => addManualSeat(p.after, f.sectionId, cell(model(p.after), 0, 0).cellId, '補助', '架空',
    { newId: () => old.seatId, retiredIds: p.impact.retiredIds }));
});
test('DD91-T06・13 保存層からの構成案にも割当保護と参照不変を適用', () => {
  const f = fixture(), before = protect(f.layout), after = structuredClone(before);
  after.assignments = []; rejects('BUSINESS_REFERENCES_CHANGED', () => assessSeatChanges(before, after));
  const modified = structuredClone(before); model(modified).seats[0].number = 8;
  rejects('ASSIGNED_SEAT_REQUIRES_RELEASE', () => assessSeatChanges(before, modified));
});
test('DD91-T06 行列縮小は未割当だけ許可し、発券済み席を黙って削除しない', () => {
  const f = fixture(), last = model(f.layout).seats.at(-1);
  const p = reconfigureSection(f.layout, f.sectionId, { columns: 4 }, f.opts);
  assert.equal(model(p.after).section.columns, 4); assert(p.impact.retiredIds.includes(last.seatId));
  rejects('ISSUED_SEAT_PROTECTED', () => reconfigureSection(protect(f.layout, last, { issued: true }), f.sectionId, { columns: 4 }, f.opts));
});
test('DD91-T02・03 軸変更でも既存セル・席IDを作り直さず、列の対応を明示する', () => {
  const f = fixture({ rows: 2, columns: 3, kinds: [[0, 0, 'seat'], [1, 2, 'seat']] });
  const p = reconfigureSection(f.layout, f.sectionId, { axis: 'vertical', seatOrder: 'reverse',
    lines: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }, f.opts);
  assert.deepEqual(model(p.after).seats.map(s => s.seatId).sort(), model(f.layout).seats.map(s => s.seatId).sort());
  assert.deepEqual(model(p.after).section.cells.map(c => c.cellId), model(f.layout).section.cells.map(c => c.cellId));
  validateLayout(p.after);
});
test('DD91-T06 確保・特別席は採番案で一般席へ自動変更しない', () => {
  for (const category of ['reserved', 'special']) {
    const f = fixture(); model(f.layout).seats[0].category = category; model(f.layout).seats[0].reservedLabel = '架空の確保用途';
    const p = reconfigureSection(f.layout, f.sectionId, { seatOrder: 'reverse' }, f.opts);
    assert.equal(model(p.after).seats[0].category, category); assert.equal(model(p.after).seats[0].reservedLabel, '架空の確保用途');
    assert.equal(p.impact.confirmationRequired, true);
  }
});
test('DD91-T27 空の行列だけを当日拡張する場合も用途の確認を省略しない', () => {
  const f = fixture(); rejects('EMERGENCY_CONTEXT_REQUIRED', () => extendSection(f.layout, f.sectionId,
    { dimension: 'columns', count: 1 }, { ...f.opts, duringPerformance: true }));
});
test('DD91-T102 複数区画の合計が4096を超える拡張を拒否', () => {
  const f = fixture({ columns: 3072, kinds: [] });
  const combined = createSection(f.layout, { name: '別区画', rows: 1, columns: 1024, axis: 'horizontal',
    seatOrder: 'forward', lines: [{ name: 'A' }] }, f.opts).after;
  validateLayout(combined);
  rejects('CELL_LIMIT', () => extendSection(combined, f.sectionId, { dimension: 'columns', count: 1 }, f.opts));
});
test('DD91-T05・102 安全整数上限直前と長い接頭部を検査', () => {
  const f = fixture({ startNumber: Number.MAX_SAFE_INTEGER - 1, kinds: [[0, 0, 'seat']] });
  assert.equal(model(f.layout).section.lineSettings[0].nextAutomaticNumber, Number.MAX_SAFE_INTEGER);
  const before = structuredClone(f.layout);
  rejects('NUMBER_OVERFLOW', () => extendSection(f.layout, f.sectionId, { dimension: 'columns', count: 1, selections: { '0,6': 'seat' } }, f.opts));
  assert.deepEqual(f.layout, before);
  const spec = { name: '区'.repeat(100), rows: 1, columns: 1, axis: 'horizontal', seatOrder: 'forward', lines: [{ name: '列'.repeat(64), prefix: 'P'.repeat(48), startNumber: Number.MAX_SAFE_INTEGER - 1 }] };
  const blank = createSection(createLayout(scope), spec, options()).after;
  const numbered = numberInitial(blank, model(blank).section.sectionId, select(model(blank), [[0, 0, 'seat']]), { newId: () => uuid(2000) });
  assert.equal(displayNumber(model(numbered.after).seats[0]).length, 64);
});
test('DD91-T42 基準座標からの投影はスライド計算と一致し、ID・列と番号を保持', () => {
  const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  for (const axis of ['horizontal', 'vertical']) for (const direction of Object.keys(deltas)) {
    const f = fixture({ rows: 3, columns: 3, axis, kinds: [[1, 1, 'seat']] }), [rowOffset, columnOffset] = deltas[direction];
    const projected = projectBaseLayout({ coordinateSpace: 'base', layout: frozen(f.layout) }, { [f.sectionId]: { rowOffset, columnOffset } });
    assert.deepEqual(projected.layout, slideSection(f.layout, slideCommand(f, direction)).after);
    assert.equal(projected.coordinateSpace, 'logical');
  }
});
test('DD91-T42 論理座標へ移動量を二重適用しない', () => {
  const f = fixture({ rows: 3, columns: 3, kinds: [[1, 1, 'seat']] });
  const offsets = { [f.sectionId]: { rowOffset: 0, columnOffset: 1 } };
  const projected = projectBaseLayout({ coordinateSpace: 'base', layout: f.layout }, offsets);
  rejects('BASE_COORDINATES_REQUIRED', () => projectBaseLayout(projected, offsets));
  assert.equal(cell(model(projected.layout), 1, 2).kind, 'seat');
});
test('DD91-T42 基準投影は負の移動量を正規化し、不正な移動量・別区画を拒否', () => {
  const f = fixture({ rows: 3, columns: 3, kinds: [[1, 1, 'seat']] }), snapshot = { coordinateSpace: 'base', layout: f.layout };
  assert.deepEqual(projectBaseLayout(snapshot, { [f.sectionId]: { rowOffset: -1, columnOffset: 0 } }).layout,
    projectBaseLayout(snapshot, { [f.sectionId]: { rowOffset: 2, columnOffset: 0 } }).layout);
  rejects('INVALID_OFFSET', () => projectBaseLayout(snapshot, { [f.sectionId]: { rowOffset: 0.5, columnOffset: 0 } }));
  rejects('OFFSET_SECTION_NOT_FOUND', () => projectBaseLayout(snapshot, { [uuid(99)]: { rowOffset: 0, columnOffset: 0 } }));
});
