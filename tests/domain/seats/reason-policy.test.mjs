// 下書きと確定時の理由条件を区分し、下書き指定で既存の席保護が外れないことを確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiresSeatEditReason, createLayout, createSection, numberInitial, editUnassignedSeat } from '../../../src/domain/seats/index.ts';
import { validateSeatEditReason } from '../../../src/domain/seats/reason-policy.ts';

for (const operation of ['layoutChange', 'slide']) {
  test(`CONF-283 下書きの${operation}は理由不要`, () => {
    const context = { phase: 'draft', operation };
    assert.equal(requiresSeatEditReason(context), false);
    assert.equal(requiresSeatEditReason({ ...context, isPerformanceDay: true, receptionStarted: true }), false);
    assert.doesNotThrow(() => validateSeatEditReason(undefined, context));
  });
  for (const hasConfirmedLayout of [false, true]) for (const isPerformanceDay of [false, true]) for (const receptionStarted of [false, true]) {
    test(`CONF-283 確定時 ${operation}/${hasConfirmedLayout}/${isPerformanceDay}/${receptionStarted}`, () => {
      const context = { phase: 'commit', operation, hasConfirmedLayout, isPerformanceDay, receptionStarted };
      const expected = operation !== 'slide' && (hasConfirmedLayout || isPerformanceDay || receptionStarted);
      assert.equal(requiresSeatEditReason(context), expected);
      if (expected) assert.throws(() => validateSeatEditReason(undefined, context), { code: 'INVALID_REASON' });
      else assert.doesNotThrow(() => validateSeatEditReason(undefined, context));
    });
  }
}

test('CONF-283 未知の段階・不明な確定状態を理由不要とせず、既存の呼出しは理由必須', () => {
  assert.throws(() => requiresSeatEditReason({ phase: 'unknown', operation: 'layoutChange' }), { code: 'INVALID_REASON_CONTEXT' });
  assert.throws(() => requiresSeatEditReason({ phase: 'commit', operation: 'layoutChange' }), { code: 'INVALID_REASON_CONTEXT' });
  assert.throws(() => validateSeatEditReason(undefined), { code: 'INVALID_REASON' });
});

test('CONF-283 下書きの理由省略でも割当済み席を編集せず、スライド例外へ偽装しない', () => {
  const scope = { environmentId: crypto.randomUUID(), performanceId: crypto.randomUUID() };
  let layout = createSection(createLayout(scope), { name: '架空区画', rows: 1, columns: 2,
    axis: 'horizontal', seatOrder: 'forward', lines: [{ name: 'A' }] }).after;
  const section = layout.sections[0].section;
  layout = numberInitial(layout, section.sectionId, { [section.cells[0].cellId]: 'seat' }).after;
  const seatId = layout.sections[0].seats[0].seatId;
  const options = { editReasonContext: { phase: 'draft', operation: 'layoutChange' } };
  assert.doesNotThrow(() => editUnassignedSeat(layout, section.sectionId, seatId, { number: '補助' }, options));
  assert.throws(() => editUnassignedSeat(layout, section.sectionId, seatId, { number: '補助' },
    { editReasonContext: { phase: 'draft', operation: 'slide' } }), { code: 'INVALID_REASON_CONTEXT' });
  const attendeeId = crypto.randomUUID();
  layout.assignments.push({ ...scope, attendeeId, seatId, fixed: false, revision: 1 });
  layout.ticketProtections.push({ ...scope, attendeeId, issued: false, sent: false, hasIssuedHistory: false, activeCredentialId: null });
  assert.throws(() => editUnassignedSeat(layout, section.sectionId, seatId, { number: '補助' }, options), { code: 'ASSIGNED_SEAT_REQUIRES_RELEASE' });
});
