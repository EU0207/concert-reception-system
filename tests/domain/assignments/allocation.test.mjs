import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayout, createSection, numberInitial, addManualSeat, SeatDomainError } from '../../../src/domain/seats/index.ts';
import { autoAllocate, listAssignmentCandidates, manualAssign, clearAssignment, splitGroup,
  unlockGroup, reallocateGroup, undoReallocation, validateAllocation } from '../../../src/domain/assignments/index.ts';

const uuid = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const scope = { environmentId: uuid(1), performanceId: uuid(2) };
const groupId = uuid(20);
const people = (n, grouped = true, start = 0) => Array.from({ length: n }, (_, i) => ({ ...scope,
  attendeeId: uuid(100 + i + start), groupId: grouped ? groupId : null, rosterOrder: i + start,
  paid: true, attendancePlan: 'planned' }));
function fixture(rows = ['GGGGGGGGGGGG'], roster = people(10), { axis = 'horizontal', seatOrder = 'forward' } = {}) {
  let seq = 10000;
  const options = { newId: () => uuid(seq++) };
  let layout = createLayout(scope);
  const sectionIds = [];
  for (let index = 0; index < rows.length; index++) {
    const chars = [...rows[index]], rowsCount = axis === 'horizontal' ? 1 : chars.length,
      columns = axis === 'horizontal' ? chars.length : 1;
    layout = createSection(layout, { name: `架空区画${index}`, displayOrder: index, rows: rowsCount, columns,
      axis, seatOrder, lines: [{ name: '架空列', prefix: `S${index}-` }] }, options).after;
    const model = layout.sections[index]; sectionIds.push(model.section.sectionId);
    const selections = Object.fromEntries(model.section.cells.map((c, i) => [c.cellId,
      chars[i] === '.' ? 'aisle' : chars[i] === 'U' ? 'unset' : chars[i] === 'N' ? 'gap' : 'seat']));
    layout = numberInitial(layout, model.section.sectionId, selections, options).after;
    layout.sections[index].seats.forEach(seat => {
      const cell = layout.sections[index].section.cells.find(c => c.seatId === seat.seatId);
      const symbol = chars[axis === 'horizontal' ? cell.column : cell.row];
      if (symbol === 'W' || symbol === 'C') seat.category = 'special';
      if (symbol === 'H') seat.category = 'reserved';
      if (symbol === 'X') seat.usable = false;
    });
  }
  layout.ticketProtections = roster.map(p => ({ ...scope, attendeeId: p.attendeeId, issued: false,
    sent: false, hasIssuedHistory: false, activeCredentialId: null }));
  return { layout, people: roster, groupStates: [...new Set(roster.map(p => p.groupId).filter(Boolean))]
    .map(groupId => ({ groupId, fixed: false, manualReason: null })),
    versions: { commit: 0, layout: 1, source: 1, assignment: 0, attendee: 1, ticket: 0, control: 1, reception: 0 } };
}
function command(s, extra = {}) {
  return { ...scope, operationId: uuid(5000 + s.versions.commit), actorId: uuid(3), deviceId: uuid(4),
    requestedAt: 1000, expectedVersions: structuredClone(s.versions), ...extra };
}
const auto = s => command(s, { mode: 'roster' });
const groupCommand = s => command(s, { groupId });
const seatAt = (s, position, section = 0) => {
  const m = s.layout.sections[section], c = m.section.cells.find(c =>
    (m.section.axis === 'horizontal' ? c.column : c.row) === position);
  return c.seatId;
};
const contents = s => s.layout.sections.flatMap(m => [...m.section.cells]
  .sort((a, b) => a.row - b.row || a.column - b.column).map(c =>
    s.layout.assignments.find(a => a.seatId === c.seatId)?.attendeeId ?? null));
const read = event => id => id === event.operationId ? event : undefined;
function rejects(code, f) { assert.throws(f, e => e instanceof SeatDomainError && e.code === code); }
function unchanged(s, f) { const before = structuredClone(s); const result = f(); assert.deepEqual(s, before); return result; }
function splitFixture() {
  const s = fixture(['GG.GG', 'GGGG'], people(4));
  const split = splitGroup(s, command(s, { groupId, seatIds: [0, 1, 3, 4].map(i => seatAt(s, i)), reason: '架空の通路配慮' }));
  const unlock = unlockGroup(split.after, groupCommand(split.after));
  const reallocated = reallocateGroup(unlock.after, groupCommand(unlock.after), unlock.event.operationId, read(unlock.event));
  return { s, split, unlock, reallocated };
}

test('RES-005-T01 最大10人を12席の先頭へ配置する', () => {
  const s = fixture(), r = unchanged(s, () => autoAllocate(s, auto(s)));
  assert.deepEqual(contents(r.after), [...s.people.map(p => p.attendeeId), null, null]); assert.deepEqual(r.event.problems, []);
});
test('RES-005-T02 11人は一部も配置しない', () => {
  const s = fixture(undefined, people(11)), r = autoAllocate(s, auto(s));
  assert.equal(r.after.layout.assignments.length, 0); assert.deepEqual(r.event.problems, [{ groupId, reason: 'GROUP_OVER_10' }]);
});
test('RES-005-T03 人数降順でグループを配置し、その後に個人を配置する', () => {
  const roster = [...people(2), ...people(3, true, 2).map(p => ({ ...p, groupId: uuid(21) })), ...people(3, false, 5)];
  const s = fixture(['GGGGGGGG'], roster), r = autoAllocate(s, auto(s));
  assert.deepEqual(contents(r.after), [2, 3, 4, 0, 1, 5, 6, 7].map(i => roster[i].attendeeId));
});
test('RES-005-T04 席総数が足りても通路をまたいだグループ配置をしない', () => {
  const s = fixture(['GG.GGG'], people(4)), r = autoAllocate(s, auto(s));
  assert.equal(r.after.layout.assignments.length, 0); assert.equal(r.event.problems[0].reason, 'NO_CONTIGUOUS_GENERAL_SEATS');
});
test('RES-005-T05 特別席・確保席・使用不可を自動配置から除外する', () => {
  const s = fixture(['GWCHXGGG'], people(3)), r = autoAllocate(s, auto(s));
  assert.deepEqual(contents(r.after), [null, null, null, null, null, ...s.people.map(p => p.attendeeId)]);
});
test('RES-005-T06 区画と列の境界を越えて連続席にしない', () => {
  const s = fixture(['GG', 'GG'], people(3)); assert.equal(autoAllocate(s, auto(s)).event.problems[0].reason, 'NO_CONTIGUOUS_GENERAL_SEATS');
  const t = fixture(['GGGG'], people(3));
  // 同一区画の2列へ変える。番号・IDと座標の参照も揃える。
  const m = t.layout.sections[0], second = structuredClone(m.section.lineSettings[0]);
  second.lineId = uuid(999); second.index = 1; second.name = '次列';
  m.section.lineSettings.push(second); m.section.rows = 2; m.section.columns = 2;
  m.section.cells.forEach((c, i) => { c.row = Math.floor(i / 2); c.column = i % 2; });
  m.seats.slice(2).forEach(seat => { seat.lineId = second.lineId; });
  assert.equal(autoAllocate(t, auto(t)).event.problems[0].reason, 'NO_CONTIGUOUS_GENERAL_SEATS');
});
test('RES-005-T07 個人は入力配列でなくrosterOrderに従う', () => {
  const s = fixture(['GGGG'], people(4, false)); s.people.reverse();
  assert.deepEqual(contents(autoAllocate(s, auto(s)).after), [...s.people].reverse().map(p => p.attendeeId));
});
test('RES-005-T08 生成済みランダム順を履歴へ残し、同じ入力で再現する', () => {
  const s = fixture(['GGGG'], people(4, false)), order = [3, 1, 0, 2].map(i => s.people[i].attendeeId);
  const c = command(s, { mode: 'random', individualOrder: order }), r = autoAllocate(s, c);
  assert.deepEqual(contents(r.after), order); assert.deepEqual(r.event.individualOrder, order);
  assert.deepEqual(autoAllocate(s, c), r);
});
test('RES-005-T09 理由付き手動分割で全員固定し、自動配置から除外する', () => {
  const { split } = splitFixture();
  assert(split.after.layout.assignments.every(a => a.fixed));
  assert.deepEqual(split.after.groupStates, [{ groupId, fixed: true, manualReason: '架空の通路配慮' }]);
  assert.equal(autoAllocate(split.after, auto(split.after)).event.problems[0].reason, 'GROUP_FIXED');
});
test('RES-005-T10 固定解除後の再配置は旧席を解放し、4連続席へ移す', () => {
  const { split, unlock, reallocated } = splitFixture();
  assert.deepEqual(contents(unlock.after), contents(split.after)); assert(unlock.after.layout.assignments.every(a => !a.fixed));
  assert.deepEqual(contents(reallocated.after), [null, null, null, null, null, ...split.after.people.map(p => p.attendeeId)]);
  assert.equal(reallocated.event.referenceOperationId, unlock.event.operationId);
});
test('RES-005-T11 直前再配置を取り消し、解除前の席・固定・理由を復元して版を進める', () => {
  const { split, reallocated } = splitFixture();
  const r = undoReallocation(reallocated.after, groupCommand(reallocated.after), reallocated.event.operationId, read(reallocated.event));
  assert.deepEqual(contents(r.after), contents(split.after)); assert.deepEqual(r.after.groupStates, split.after.groupStates);
  assert(r.after.layout.assignments.every(a => a.fixed && a.revision > split.after.layout.assignments[0].revision));
  assert.equal(r.after.versions.commit, reallocated.after.versions.commit + 1);
});
for (const field of ['issued', 'sent', 'hasIssuedHistory', 'activeCredentialId']) {
  test(`RES-005-T12 ${field}が一人にあれば固定解除・再配置・取消しを拒否する`, () => {
    const { split, unlock, reallocated } = splitFixture();
    for (const s of [split.after, unlock.after, reallocated.after]) {
      s.layout.ticketProtections[1][field] = field === 'activeCredentialId' ? 'fictional-reference' : true;
      assert.equal(autoAllocate(s, auto(s)).event.problems[0].reason, 'GROUP_ISSUED');
    }
    rejects('GROUP_ISSUED', () => unlockGroup(split.after, groupCommand(split.after)));
    rejects('GROUP_ISSUED', () => reallocateGroup(unlock.after, groupCommand(unlock.after), unlock.event.operationId, read(unlock.event)));
    rejects('GROUP_ISSUED', () => undoReallocation(reallocated.after, groupCommand(reallocated.after), reallocated.event.operationId, read(reallocated.event)));
  });
}
test('DD91-T07 入金済みが初期候補、不参加は全員候補からも除外する', () => {
  const s = fixture(['GGGG'], people(4, false)); s.people[1].paid = false; s.people[2].attendancePlan = 'cancelled';
  assert.deepEqual(listAssignmentCandidates(s), [s.people[0].attendeeId, s.people[3].attendeeId]);
  assert.deepEqual(listAssignmentCandidates(s, 'all'), [0, 1, 3].map(i => s.people[i].attendeeId));
  const r = autoAllocate(s, auto(s)); assert.equal(r.after.layout.assignments.length, 3);
  assert.equal(s.people[1].paid, false);
});
test('DD91-T25 不参加者を含むグループを残りだけで再編しない', () => {
  const s = fixture(undefined, people(3)); s.people[1].attendancePlan = 'cancelled';
  const r = autoAllocate(s, auto(s)); assert.equal(r.event.problems[0].reason, 'GROUP_CANCELLED'); assert.equal(r.after.layout.assignments.length, 0);
});
test('DD91-T92 一部既配置のグループを自動で再編しない', () => {
  const s = fixture(undefined, people(3)); s.layout.assignments.push({ ...scope, attendeeId: s.people[0].attendeeId,
    seatId: seatAt(s, 0), groupId, fixed: false, revision: 1 });
  const r = autoAllocate(s, auto(s)); assert.equal(r.event.problems[0].reason, 'GROUP_ALREADY_ASSIGNED'); assert.deepEqual(r.after.layout.assignments, s.layout.assignments);
});
test('DD91-T08 同人数では最初の名簿順、区画・列・採番方向の順を使う', () => {
  const s = fixture(['GG', 'GG'], [...people(2), ...people(2, true, 2).map(p => ({ ...p, groupId: uuid(21) }))]);
  s.layout.sections.reverse(); s.people.reverse(); s.groupStates.reverse();
  const r = autoAllocate(s, auto(s));
  assert.equal(r.after.layout.assignments.find(a => a.attendeeId === uuid(100)).seatId, seatAt(s, 0, 1));
});
for (const axis of ['horizontal', 'vertical']) for (const seatOrder of ['forward', 'reverse']) {
  test(`DD91-T08 ${axis}/${seatOrder}は自由番号でもセル位置で連続判定する`, () => {
    const s = fixture(['GGGG'], people(3), { axis, seatOrder });
    for (const [i, seat] of s.layout.sections[0].seats.entries()) {
      seat.numberingMode = 'manual'; seat.manualNumber = ['Z', '1', 'あ', '10'][i]; delete seat.prefix; delete seat.number;
    }
    const r = autoAllocate(s, auto(s)), expected = seatOrder === 'forward' ? [0, 1, 2] : [3, 2, 1];
    assert.deepEqual(s.people.map(p => r.after.layout.assignments.find(a => a.attendeeId === p.attendeeId).seatId), expected.map(i => seatAt(s, i)));
  });
}
test('CONF-073 非席から手入力した一般席も自動配置に使う', () => {
  const s = fixture(['GU'], people(2)); const m = s.layout.sections[0];
  s.layout = addManualSeat(s.layout, m.section.sectionId, m.section.cells[1].cellId, '補助', '架空の追加', { newId: () => uuid(999) }).after;
  assert.equal(autoAllocate(s, auto(s)).after.layout.assignments.length, 2);
});
test('DD91-T08 配置不能のグループがいても、配置できる個人の案を保持する', () => {
  const s = fixture(['GG.GG'], [...people(4), ...people(1, false, 4)]), r = autoAllocate(s, auto(s));
  assert.equal(r.event.problems[0].reason, 'NO_CONTIGUOUS_GENERAL_SEATS'); assert.equal(r.after.layout.assignments.length, 1);
});
test('DD91-T09 再配置に失敗しても旧席・固定理由と元入力を変更しない', () => {
  const s = fixture(['GG.GG'], people(4)); const split = splitGroup(s, command(s,
    { groupId, seatIds: [0, 1, 3, 4].map(i => seatAt(s, i)), reason: '架空' }));
  const unlock = unlockGroup(split.after, groupCommand(split.after));
  unchanged(unlock.after, () => rejects('NO_CONTIGUOUS_GENERAL_SEATS', () =>
    reallocateGroup(unlock.after, groupCommand(unlock.after), unlock.event.operationId, read(unlock.event))));
});
test('DD91-T09 手動分割は一般席以外でも利用可能席なら明示選択できる', () => {
  const s = fixture(['WH'], people(2)); const r = splitGroup(s, command(s, { groupId, seatIds: [seatAt(s, 0), seatAt(s, 1)], reason: '架空の個別対応' }));
  assert.equal(r.after.layout.assignments.length, 2);
});
test('DD91-T07 未入金の個人も手動設定でき、席解除は本人・券・入金を保持する', () => {
  const s = fixture(['GH'], people(1, false)); s.people[0].paid = false;
  const r = manualAssign(s, command(s, { attendeeId: s.people[0].attendeeId, seatId: seatAt(s, 1) }));
  const cleared = clearAssignment(r.after, command(r.after, { attendeeId: s.people[0].attendeeId }));
  assert.equal(cleared.after.layout.assignments.length, 0); assert.deepEqual(cleared.after.people, s.people);
  assert.deepEqual(cleared.after.layout.ticketProtections, s.layout.ticketProtections);
});
test('DD91-T09 グループの一人を手動設定しても全員を固定し、部分配置を自動再編しない', () => {
  const s = fixture(['GG'], people(2));
  rejects('INVALID_REASON', () => manualAssign(s, command(s, { attendeeId: s.people[0].attendeeId, seatId: seatAt(s, 0) })));
  const r = manualAssign(s, command(s, { attendeeId: s.people[0].attendeeId, seatId: seatAt(s, 0), reason: '架空の手動設定' }));
  assert.equal(r.after.groupStates[0].fixed, true); assert.equal(r.event.after.rows.length, 2);
  assert.equal(autoAllocate(r.after, auto(r.after)).event.problems[0].reason, 'GROUP_FIXED');
  const next = manualAssign(r.after, command(r.after, { attendeeId: s.people[1].attendeeId, seatId: seatAt(s, 1), reason: '架空の追加設定' }));
  assert(next.after.layout.assignments.every(a => a.fixed));
  const cleared = clearAssignment(next.after, command(next.after, { attendeeId: s.people[0].attendeeId, reason: '架空の解除' }));
  assert.equal(cleared.after.layout.assignments.length, 1); assert(cleared.after.layout.assignments[0].fixed);
  assert.equal(cleared.event.after.rows.length, 2);
});
test('DD91-T13 発行チェック解除後の個人も発行履歴で設定・解除を保護する', () => {
  const s = fixture(['GG'], people(1, false));
  const r = manualAssign(s, command(s, { attendeeId: s.people[0].attendeeId, seatId: seatAt(s, 0) }));
  r.after.layout.ticketProtections[0].hasIssuedHistory = true;
  rejects('PERSON_ISSUED', () => clearAssignment(r.after, command(r.after, { attendeeId: s.people[0].attendeeId })));
  rejects('PERSON_ISSUED', () => manualAssign(r.after, command(r.after, { attendeeId: s.people[0].attendeeId, seatId: seatAt(s, 1) })));
});
test('DD91-T92 不正な所属・順序・固定投影と欠落参照を拒否する', () => {
  for (const [code, mutate] of [
    ['INVALID_ROSTER', s => { s.people[1].rosterOrder = 0; }],
    ['SCOPE_MISMATCH', s => { s.people[0].performanceId = uuid(77); }],
    ['MISSING_GROUP_STATE', s => { s.groupStates = []; }],
    ['MISSING_TICKET_PROTECTION', s => { s.layout.ticketProtections.pop(); }],
    ['FIXED_REASON_REQUIRED', s => { s.groupStates[0].fixed = true; }],
  ]) { const s = fixture(['GG'], people(2)); mutate(s); rejects(code, () => autoAllocate(s, auto(s))); }
});
test('DD91-T09 空白理由・人数不一致・重複席・他人の席を拒否する', () => {
  const s = fixture(['GGG'], [...people(2), ...people(1, false, 2)]);
  for (const reason of ['', ' ', '\u3000', '\t']) rejects('INVALID_REASON', () => splitGroup(s, command(s, { groupId, seatIds: [seatAt(s, 0), seatAt(s, 1)], reason })));
  for (const seatIds of [[seatAt(s, 0)], [seatAt(s, 0), seatAt(s, 0)]]) rejects('INVALID_GROUP_SEAT_COUNT', () => splitGroup(s, command(s, { groupId, seatIds, reason: '架空' })));
  const r = manualAssign(s, command(s, { attendeeId: s.people[2].attendeeId, seatId: seatAt(s, 0) }));
  unchanged(r.after, () => rejects('MANUAL_SEAT_UNAVAILABLE', () => splitGroup(r.after, command(r.after, { groupId, seatIds: [seatAt(s, 0), seatAt(s, 1)], reason: '架空' }))));
});
test('DD91-T10 ランダム順の欠落・重複・余分なIDを拒否する', () => {
  const s = fixture(['GG'], people(2, false)), ids = s.people.map(p => p.attendeeId);
  for (const individualOrder of [[ids[0]], [ids[0], ids[0]], [ids[0], uuid(999)]])
    rejects('INVALID_RANDOM_ORDER', () => autoAllocate(s, command(s, { mode: 'random', individualOrder })));
});
test('DD91-T92 全期待版を照合し、別公演・操作ID不正と版溢れを拒否する', () => {
  const s = fixture();
  for (const key of Object.keys(s.versions)) { const c = auto(s); c.expectedVersions[key]++; rejects('STALE_ASSIGNMENT', () => autoAllocate(s, c)); }
  rejects('SCOPE_MISMATCH', () => autoAllocate(s, { ...auto(s), performanceId: uuid(999) }));
  rejects('INVALID_ASSIGNMENT_COMMAND', () => autoAllocate(s, { ...auto(s), operationId: 'invalid' }));
  s.versions.commit = Number.MAX_SAFE_INTEGER;
  rejects('ASSIGNMENT_VERSION_OVERFLOW', () => autoAllocate(s, { ...auto(s), operationId: uuid(5000) }));
});
test('DD91-T09 確定履歴欠落・別操作・範囲改変・非直前の履歴を拒否する', () => {
  const { unlock, reallocated } = splitFixture(), c = groupCommand(unlock.after);
  rejects('INVALID_HISTORY_REFERENCE', () => reallocateGroup(unlock.after, c, unlock.event.operationId, () => undefined));
  const bad = structuredClone(unlock.event); bad.before.rows.pop();
  rejects('INVALID_HISTORY_SCOPE', () => reallocateGroup(unlock.after, c, bad.operationId, read(bad)));
  const wrong = structuredClone(unlock.event); wrong.operationId = uuid(900);
  rejects('INVALID_HISTORY_REFERENCE', () => reallocateGroup(unlock.after, c, unlock.event.operationId, read(wrong)));
  const changed = structuredClone(reallocated.after); changed.versions.control++;
  rejects('NOT_LAST_GROUP_OPERATION', () => undoReallocation(changed, groupCommand(changed), reallocated.event.operationId, read(reallocated.event)));
});
test('DD91-T09 取消履歴の他人混入・現状態不一致・旧席競合を拒否する', () => {
  const { reallocated } = splitFixture();
  for (const [code, mutate] of [
    ['INVALID_HISTORY_SCOPE', e => { e.before.rows[0].attendeeId = uuid(999); }],
    ['HISTORY_STATE_MISMATCH', e => { e.after.rows[0].assignment.revision++; }],
    ['INVALID_HISTORY_STATE', e => { e.before.groups[0].fixed = false; e.before.rows.forEach(r => { r.assignment.fixed = false; }); }],
  ]) { const e = structuredClone(reallocated.event); mutate(e);
    rejects(code, () => undoReallocation(reallocated.after, groupCommand(reallocated.after), e.operationId, read(e))); }
});
for (const count of [500, 600, 1000]) for (const mode of ['roster', 'random']) {
  test(`DD91-T10 ${count}人・2区画/${mode}の順序計算を再現する（無料受入ではない）`, () => {
    const s = fixture(['G'.repeat(count / 2), 'G'.repeat(count / 2)], people(count, false));
    const individualOrder = s.people.map(p => p.attendeeId).reverse();
    const c = command(s, mode === 'random' ? { mode, individualOrder } : { mode });
    const r = autoAllocate(s, c);
    assert.deepEqual(contents(r.after), mode === 'random' ? individualOrder : s.people.map(p => p.attendeeId));
    assert.deepEqual(autoAllocate(s, c), r); validateAllocation(r.after);
  });
}
