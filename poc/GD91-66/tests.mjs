import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {allocate, splitGroup, unlockGroup, reallocateGroup, undoReallocation, validateSnapshot} from './allocation.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const files = ['allocation.mjs', 'tests.mjs'];
const hashes = () => Object.fromEntries(files.map(f => [f, createHash('sha256').update(fs.readFileSync(root + f)).digest('hex')]));
const beforeHashes = hashes(), results = [], started = new Date().toISOString();
let serial = 0;
const person = (attendeeId, rosterOrder, groupId = null) => ({attendeeId, rosterOrder, groupId, attendancePlan: 'planned', everIssued: false, activeCredentialId: null});
const group = (count, groupId = 'G', offset = 0) => Array.from({length: count}, (_, i) => person(`${groupId}-P${i + 1}`, offset + i, groupId));
function model(pattern = 'GGGG', people = [], sectionId = '1F', lineId = 'A') {
  const seats = [...pattern].flatMap((type, column) => type === '.' ? [] : [{seatId: `${sectionId}-${lineId}${column + 1}`, sectionId, lineId,
    row: 0, column, lineOrder: 0, category: ({G: 'general', W: 'wheelchair', C: 'companion', H: 'reserved', X: 'unusable', '-': 'general'})[type], usable: type !== 'X'}]);
  const snapshot = {schemaVersion: 1, environmentId: 'FAKE-environment', performanceId: 'FAKE-performance', completeRoster: true,
    versions: {commit: 1, layout: 1, source: 1, assignment: 1, attendee: 1, ticket: 1, control: 1, reception: 1},
    sections: [{sectionId, displayOrder: 0, axis: 'horizontal', seatOrder: 'forward'}], seats, people: structuredClone(people), assignments: Object.fromEntries(seats.map(s => [s.seatId, ''])), groupStates: {}};
  for (const [column, type] of [...pattern].entries()) if (type === '-') {
    const attendeeId = `OCCUPIED-${column}`; snapshot.people.push(person(attendeeId, 10000 + column)); snapshot.assignments[`${sectionId}-${lineId}${column + 1}`] = attendeeId;
  }
  return snapshot;
}
function addLine(s, pattern, sectionId, lineId, order, row = order) {
  const extra = model(pattern, [], sectionId, lineId);
  if (!s.sections.some(x => x.sectionId === sectionId)) s.sections.push({...extra.sections[0], displayOrder: s.sections.length});
  s.seats.push(...extra.seats.map(seat => ({...seat, row, lineOrder: order})));
  Object.assign(s.assignments, extra.assignments); return s;
}
const command = (s, extra = {}) => ({environmentId: s.environmentId, performanceId: s.performanceId, operationId: `FAKE-op-${++serial}`, expectedVersions: structuredClone(s.versions), mode: 'roster', ...extra});
const contents = s => s.seats.map(seat => s.assignments[seat.seatId]);
function immutable(s, action) {
  const prior = structuredClone(s), result = action(); assert.deepEqual(s, prior); return result;
}
function rejected(s, action, code) {
  immutable(s, () => assert.throws(action, error => error.message === code));
}
function test(id, subject, action) {
  try { const evidence = action(); results.push({id, subject, passed: true, ...(evidence ?? {})}); }
  catch (error) { results.push({id, subject, passed: false, error: error.stack}); }
}
function splitFixture() {
  const original = addLine(model('GG-GG', group(4)), 'GGGG', '1F', 'B', 1);
  const split = splitGroup(original, command(original, {groupId: 'G', reason: '架空の通路配慮', seatIds: ['1F-A1', '1F-A2', '1F-A4', '1F-A5']}));
  return {original, split};
}
function reallocatedFixture() {
  const f = splitFixture(), unlocked = unlockGroup(f.split.after, command(f.split.after, {groupId: 'G'}));
  const reallocated = reallocateGroup(unlocked.after, command(unlocked.after, {groupId: 'G'}), unlocked.event);
  return {...f, unlocked, reallocated};
}

test('RES-005-T01', '10人を12席の先頭へ配置', () => {
  const s = model('G'.repeat(12), group(10)), r = immutable(s, () => allocate(s, command(s)));
  assert.deepEqual(contents(r.after), [...group(10).map(p => p.attendeeId), '', '']); assert.deepEqual(r.event.unplaced, []);
});
test('RES-005-T02', '11人は一部も配置しない', () => {
  const s = model('G'.repeat(12), group(11)), r = allocate(s, command(s));
  assert(contents(r.after).every(x => x === '')); assert.deepEqual(r.event.skipped, [{groupId: 'G', reason: 'GROUP_OVER_10'}]);
});
test('RES-005-T03', '3人組→2人組→個人の順', () => {
  const s = model('G'.repeat(8), [...group(2, 'G02'), ...group(3, 'G03', 2), ...['I01', 'I02', 'I03'].map((id, i) => person(id, i + 5))]);
  assert.deepEqual(contents(allocate(s, command(s)).after), ['G03-P1', 'G03-P2', 'G03-P3', 'G02-P1', 'G02-P2', 'I01', 'I02', 'I03']);
});
test('RES-005-T04', '空席総数が足りても連続不足は未配置', () => {
  const s = model('GG-GGG', group(4)), r = allocate(s, command(s));
  assert.deepEqual(r.after.assignments, s.assignments); assert.deepEqual(r.event.unplaced, [{groupId: 'G', reason: 'NO_CONTIGUOUS_GENERAL_SEATS'}]);
});
test('RES-005-T05', '特別席・確保席・使用不可を除外', () => {
  const s = model('GWCHXGGG', group(3)); assert.deepEqual(contents(allocate(s, command(s)).after), ['', '', '', '', '', 'G-P1', 'G-P2', 'G-P3']);
});
test('RES-005-T06', '列・区画をまたいで配置しない', () => {
  const s = addLine(addLine(model('GG', group(3)), 'GG', '1F', 'B', 1), 'GG', '2F', 'A', 0);
  const r = allocate(s, command(s)); assert.deepEqual(r.after.assignments, s.assignments); assert.equal(r.event.unplaced[0].reason, 'NO_CONTIGUOUS_GENERAL_SEATS');
});
test('RES-005-T07', '個人客の名簿順', () => {
  const s = model('GGGG', ['I03', 'I01', 'I04', 'I02'].map((id, i) => person(id, i)));
  assert.deepEqual(contents(allocate(s, command(s)).after), ['I03', 'I01', 'I04', 'I02']);
});
test('RES-005-T08', '生成済みランダム順を使用・記録', () => {
  const s = model('GGGG', ['I01', 'I02', 'I03', 'I04'].map((id, i) => person(id, i))), order = ['I04', 'I02', 'I01', 'I03'];
  const r = allocate(s, command(s, {mode: 'random', individualOrder: order})); assert.deepEqual(contents(r.after), order); assert.deepEqual(r.event.individualOrder, order);
});
test('RES-005-T09', '理由付き手動分割で全員固定', () => {
  const {split} = splitFixture(); assert.deepEqual(contents(split.after), ['G-P1', 'G-P2', 'OCCUPIED-2', 'G-P3', 'G-P4', '', '', '', '']);
  assert.deepEqual(split.after.groupStates.G, {fixed: true, manualReason: '架空の通路配慮'});
  assert.deepEqual(allocate(split.after, command(split.after)).event.skipped, [{groupId: 'G', reason: 'GROUP_FIXED'}]);
});
test('RES-005-T10', '解除後はBの4連続席へ再配置し旧席解放', () => {
  const {split, unlocked, reallocated} = reallocatedFixture(); assert.deepEqual(unlocked.after.assignments, split.after.assignments);
  assert.deepEqual(contents(reallocated.after), ['', '', 'OCCUPIED-2', '', '', 'G-P1', 'G-P2', 'G-P3', 'G-P4']); assert.equal(reallocated.after.groupStates.G.fixed, false);
});
test('RES-005-T11', '取消しで元の固定・理由へ復元し版は進める', () => {
  const {split, reallocated} = reallocatedFixture(), r = undoReallocation(reallocated.after, command(reallocated.after, {groupId: 'G'}), reallocated.event);
  assert.deepEqual(r.after.assignments, split.after.assignments); assert.deepEqual(r.after.groupStates, split.after.groupStates);
  assert.equal(r.event.undoOperationId, reallocated.event.operationId); assert.equal(r.after.versions.commit, reallocated.after.versions.commit + 1);
});
test('RES-005-T12', '一人でも発行履歴／有効QRがあれば3操作拒否', () => {
  for (const field of ['everIssued', 'activeCredentialId']) {
    const {split, unlocked, reallocated} = reallocatedFixture();
    for (const s of [split.after, unlocked.after, reallocated.after]) s.people[1][field] = field === 'everIssued' ? true : 'FAKE-credential';
    rejected(split.after, () => unlockGroup(split.after, command(split.after, {groupId: 'G'})), 'GROUP_ISSUED');
    rejected(unlocked.after, () => reallocateGroup(unlocked.after, command(unlocked.after, {groupId: 'G'}), unlocked.event), 'GROUP_ISSUED');
    rejected(reallocated.after, () => undoReallocation(reallocated.after, command(reallocated.after, {groupId: 'G'}), reallocated.event), 'GROUP_ISSUED');
    assert.equal(allocate(split.after, command(split.after)).event.skipped[0].reason, 'GROUP_ISSUED');
  }
});
test('E01', '同人数は最初の名簿位置・候補は区画と列表示順', () => {
  const s = addLine(addLine(model('GG', [...group(2, 'FIRST'), ...group(2, 'SECOND', 2)]), 'GG', '2F', 'A', 0), 'GG', '1F', 'B', 1);
  s.sections.reverse(); s.seats.reverse(); s.people.reverse();
  const r = allocate(s, command(s)); assert.equal(r.after.assignments['1F-A1'], 'FIRST-P1'); assert.equal(r.after.assignments['1F-B1'], 'SECOND-P1'); assert.equal(r.after.assignments['2F-A1'], '');
});
test('E02', '縦横・逆順と自由席番号でもセル位置で連続判定', () => {
  for (const axis of ['horizontal', 'vertical']) for (const order of ['forward', 'reverse']) {
    const s = model('GG.GG', group(3)); s.sections[0].axis = axis; s.sections[0].seatOrder = order;
    for (const seat of s.seats) { if (axis === 'vertical') [seat.row, seat.column] = [seat.column, seat.row]; seat.manualNumber = '文字番号'; }
    assert.equal(allocate(s, command(s)).event.unplaced.length, 1);
    const individual = model('GGGG', [person('P', 0)]); individual.sections[0] = {...individual.sections[0], axis, seatOrder: order};
    if (axis === 'vertical') for (const seat of individual.seats) [seat.row, seat.column] = [seat.column, seat.row];
    assert.equal(allocate(individual, command(individual)).after.assignments[order === 'forward' ? '1F-A1' : '1F-A4'], 'P');
    const contiguous = model('GGGG', group(3)); contiguous.sections[0] = {...contiguous.sections[0], axis, seatOrder: order};
    if (axis === 'vertical') for (const seat of contiguous.seats) [seat.row, seat.column] = [seat.column, seat.row];
    assert.deepEqual(contents(allocate(contiguous, command(contiguous)).after), order === 'forward' ? ['G-P1', 'G-P2', 'G-P3', ''] : ['', 'G-P3', 'G-P2', 'G-P1']);
  }
});
test('E03', '不参加・発券済み・一部既配置グループを組み替えない', () => {
  for (const kind of ['cancelled', 'issued', 'assigned']) {
    const s = model('GGGGGG', [...group(2), person('I', 2)]);
    if (kind === 'cancelled') s.people[0].attendancePlan = 'cancelled';
    if (kind === 'issued') s.people[0].everIssued = true;
    if (kind === 'assigned') s.assignments['1F-A6'] = 'G-P1';
    const r = allocate(s, command(s)); assert.equal(r.event.skipped.length, 1); assert.equal(r.after.assignments['1F-A1'], 'I');
    assert.equal(Object.values(r.after.assignments).filter(id => id.startsWith('G-')).length, kind === 'assigned' ? 1 : 0);
  }
});
test('E04', '大グループ配置不能でも別単位の配置案を保持', () => {
  const s = model('GG', [...group(3, 'LARGE'), ...group(2, 'SMALL', 3), person('I', 5)]), r = allocate(s, command(s));
  assert.deepEqual(contents(r.after), ['SMALL-P1', 'SMALL-P2']); assert.deepEqual(r.event.unplaced, [{groupId: 'LARGE', reason: 'NO_CONTIGUOUS_GENERAL_SEATS'}, {attendeeId: 'I', reason: 'NO_GENERAL_SEAT'}]);
});
test('E05', '理由・全員分の席数・重複・他客の席を検査', () => {
  const {original: s} = splitFixture(), base = {groupId: 'G', reason: '架空理由', seatIds: ['1F-A1', '1F-A2', '1F-A4', '1F-A5']};
  for (const [change, code] of [[{reason: '　 '}, 'REASON'], [{seatIds: ['1F-A1']}, 'SEAT_COUNT'], [{seatIds: ['1F-A1', '1F-A1', '1F-A4', '1F-A5']}, 'SEAT_COUNT'], [{seatIds: ['1F-A1', '1F-A2', '1F-A3', '1F-A5']}, 'MANUAL_SEAT'], [{seatIds: ['1F-A1', '1F-A2', 'OTHER-A4', '1F-A5']}, 'MANUAL_SEAT']])
    rejected(s, () => splitGroup(s, command(s, {...base, ...change})), code);
});
test('E06', '再配置不能時に元の席を解放しない', () => {
  const {split} = splitFixture(), s = split.after; for (const seat of s.seats.filter(x => x.lineId === 'B')) seat.usable = false;
  const unlocked = unlockGroup(s, command(s, {groupId: 'G'})); rejected(unlocked.after, () => reallocateGroup(unlocked.after, command(unlocked.after, {groupId: 'G'}), unlocked.event), 'NO_CONTIGUOUS_GENERAL_SEATS');
});
test('E07', '不完全名簿・重複・未知参照・不参加割当を拒否', () => {
  const variants = [
    [s => { s.completeRoster = false; }, 'INCOMPLETE_ROSTER'],
    [s => { s.people[1].rosterOrder = 0; }, 'ROSTER'],
    [s => { s.people[1].attendeeId = 'G-P1'; }, 'ROSTER'],
    [s => { s.assignments['1F-A1'] = 'UNKNOWN'; }, 'ASSIGNMENT'],
    [s => { s.assignments['1F-A1'] = 'G-P1'; s.assignments['1F-A2'] = 'G-P1'; }, 'ASSIGNMENT'],
    [s => { s.people[0].attendancePlan = 'cancelled'; s.assignments['1F-A1'] = 'G-P1'; }, 'ASSIGNMENT'],
    [s => { delete s.assignments['1F-A1']; }, 'ASSIGNMENT_KEYS'],
    [s => { s.seats[1].column = 0; }, 'DUPLICATE_POSITION'],
    [s => { s.groupStates.UNKNOWN = {fixed: true, manualReason: '架空'}; }, 'GROUP_STATE']
  ];
  for (const [mutate, code] of variants) { const s = model('GGGG', group(2)); mutate(s); rejected(s, () => allocate(s, command(s)), code); }
});
test('E08', '全期待版と公演・環境を照合', () => {
  const s = model('GGGG', group(2));
  for (const key of Object.keys(s.versions)) { const c = command(s); c.expectedVersions[key]++; rejected(s, () => allocate(s, c), 'STALE'); }
  for (const field of ['performanceId', 'environmentId']) rejected(s, () => allocate(s, command(s, {[field]: 'OTHER'})), 'SCOPE');
});
test('E09', 'ランダム順の重複・不足・別人を拒否し再計算で維持', () => {
  const s = model('GGGG', [person('I1', 0), person('I2', 1)]), c = command(s, {mode: 'random', individualOrder: ['I2', 'I1']});
  assert.deepEqual(allocate(s, c), allocate(s, c));
  for (const order of [['I1'], ['I1', 'I1'], ['I1', 'OTHER']]) rejected(s, () => allocate(s, command(s, {mode: 'random', individualOrder: order})), 'RANDOM_ORDER');
});
test('E10', '古い解除履歴・別公演・直前以外の取消しを拒否', () => {
  const {unlocked, reallocated} = reallocatedFixture(), bad = structuredClone(unlocked.event); bad.performanceId = 'OTHER';
  rejected(unlocked.after, () => reallocateGroup(unlocked.after, command(unlocked.after, {groupId: 'G'}), bad), 'UNLOCK_RECEIPT');
  const changed = structuredClone(unlocked.after); changed.versions.attendee++; rejected(changed, () => reallocateGroup(changed, command(changed, {groupId: 'G'}), unlocked.event), 'UNLOCK_RECEIPT');
  const later = structuredClone(reallocated.after); later.versions.commit++; rejected(later, () => undoReallocation(later, command(later, {groupId: 'G'}), reallocated.event), 'NOT_LAST_REALLOCATION');
  const undo = undoReallocation(reallocated.after, command(reallocated.after, {groupId: 'G'}), reallocated.event);
  rejected(undo.after, () => undoReallocation(undo.after, command(undo.after, {groupId: 'G'}), reallocated.event), 'NOT_LAST_REALLOCATION');
});
test('E11', '入金・表示名・券参照を変更せず一般不可席を使用しない', () => {
  const s = model('GGGG', group(2)); s.people[0].paid = false; s.people[0].seatDisplayName = '架空'; s.seats[0].usable = false;
  const r = immutable(s, () => allocate(s, command(s))); assert.deepEqual(r.after.people, s.people); assert.deepEqual(contents(r.after), ['', 'G-P1', 'G-P2', '']);
  for (const key of ['layout', 'source', 'attendee', 'ticket', 'control']) assert.equal(r.after.versions[key], s.versions[key]);
});
test('E12', '手動分割は特別席も可・自動配置では選ばない', () => {
  const s = model('WCGG', group(2)), r = splitGroup(s, command(s, {groupId: 'G', reason: '架空の配慮', seatIds: ['1F-A1', '1F-A2']}));
  assert.deepEqual(contents(r.after), ['G-P1', 'G-P2', '', '']); assert.deepEqual(contents(allocate(s, command(s)).after), ['', '', 'G-P1', 'G-P2']);
});
test('E13', '500人・複数区画で名簿順と逆順の計算を再現', () => {
  const people = Array.from({length: 500}, (_, i) => person(`I${String(i + 1).padStart(3, '0')}`, i)), s = model('G'.repeat(25), people);
  for (let i = 1; i < 20; i++) addLine(s, 'G'.repeat(25), i < 10 ? '1F' : '2F', `L${i}`, i % 10);
  const expected = people.map(p => p.attendeeId), roster = allocate(s, command(s)), random = allocate(s, command(s, {mode: 'random', individualOrder: [...expected].reverse()}));
  assert.deepEqual(contents(roster.after), expected); assert.deepEqual(contents(random.after), [...expected].reverse());
  assert.equal(new Set(Object.values(roster.after.assignments)).size, 500); assert.deepEqual(roster.after.seats, s.seats);
  return {attendees: 500, seats: 500, sections: 2, databaseWrites: 'not connected'};
});
test('E14', '500人中の50グループと個人を混在配置', () => {
  const people = [...Array.from({length: 50}, (_, i) => group(8, `G${i}`, i * 8)).flat(), ...Array.from({length: 100}, (_, i) => person(`I${i}`, 400 + i))];
  const s = model('G'.repeat(25), people); for (let i = 1; i < 20; i++) addLine(s, 'G'.repeat(25), i < 10 ? '1F' : '2F', `L${i}`, i % 10);
  const r = allocate(s, command(s)); assert.equal(r.event.unplaced.length, 0); assert.equal(new Set(Object.values(r.after.assignments)).size, 500);
  for (let i = 0; i < 50; i++) {
    const seats = r.after.seats.filter(seat => r.after.assignments[seat.seatId].startsWith(`G${i}-`));
    assert.equal(seats.length, 8); assert.equal(new Set(seats.map(seat => `${seat.sectionId}/${seat.lineId}`)).size, 1);
    assert.equal(Math.max(...seats.map(x => x.column)) - Math.min(...seats.map(x => x.column)), 7);
  }
});
test('E15', '取消しの差分へ他客・他グループを混入させない', () => {
  const {reallocated: r} = reallocatedFixture();
  for (const mutate of [e => { e.before.assignments['1F-A3'] = ''; e.after.assignments['1F-A3'] = 'OCCUPIED-2'; },
    e => { e.before.groupStates.OTHER = {fixed: true, manualReason: '架空'}; },
    e => { e.before.assignments['OTHER-1'] = ''; e.after.assignments['OTHER-1'] = ''; }]) {
    const event = structuredClone(r.event); mutate(event);
    rejected(r.after, () => undoReallocation(r.after, command(r.after, {groupId: 'G'}), event), 'UNDO_SCOPE');
  }
});

assert.deepEqual(hashes(), beforeHashes);
const output = {started, finished: new Date().toISOString(), node: process.version, scope: 'pure calculation; no Firebase/SDK/browser',
  sourceHashesBefore: beforeHashes, sourceHashesAfter: hashes(), total: results.length, passed: results.filter(x => x.passed).length, results};
fs.mkdirSync(root + 'artifacts', {recursive: true}); fs.writeFileSync(root + 'artifacts/calculation-summary.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({total: output.total, passed: output.passed, failed: results.filter(x => !x.passed)}));
if (output.passed !== output.total) process.exitCode = 1;
