// 画面の区画設定を既存の計算へ渡し、途中失敗と席の保護を確認する。

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLayout, createSection, numberInitial } from '../../src/domain/seats/layout.ts';
import { planSectionSettings } from '../../src/app/seat-section-settings.ts';

const scope = {
  environmentId: '00000000-0000-4000-8000-000000000001',
  performanceId: '00000000-0000-4000-8000-000000000002',
};

/** 席を持つ区画を作り、設定変更の前提にする。 */
function fixture() {
  const blank = createSection(createLayout(scope), {
    name: '確認区画', rows: 2, columns: 3, axis: 'horizontal', seatOrder: 'forward',
    lines: [{ name: 'A' }, { name: 'B' }],
  }).after;
  const section = blank.sections[0].section;
  const layout = numberInitial(blank, section.sectionId, {
    [section.cells[0].cellId]: 'seat', [section.cells[1].cellId]: 'seat',
  }).after;

  return { layout, sectionId: section.sectionId };
}

test('設定変更は縮小と拡張を一つの案にまとめ、既存席のIDを保持する', () => {
  const { layout, sectionId } = fixture();
  const original = structuredClone(layout);
  const plan = planSectionSettings(layout, sectionId, {
    name: '変更後', rows: 1, columns: 4, axis: 'horizontal', seatOrder: 'reverse',
    lines: [{ name: '前', prefix: '前方', startNumber: 7 }],
  });
  const next = plan.after.sections[0];
  assert.equal(next.section.rows, 1);
  assert.equal(next.section.columns, 4);
  assert.deepEqual(next.seats.map(seat => seat.seatId).sort(), layout.sections[0].seats.map(seat => seat.seatId).sort());
  assert.deepEqual(layout, original);
});

test('途中で上限を超える設定変更が拒否されても元データを保持する', () => {
  const { layout, sectionId } = fixture();
  const original = structuredClone(layout);
  assert.throws(() => planSectionSettings(layout, sectionId, {
    name: '失敗案', rows: 1, columns: 4097, axis: 'horizontal', seatOrder: 'forward',
    lines: [{ name: 'A' }],
  }));
  assert.deepEqual(layout, original);
});

test('割当済み・発券済みの席番号を設定変更で上書きしない', () => {
  for (const issued of [false, true]) {
    const { layout, sectionId } = fixture();
    const attendeeId = '00000000-0000-4000-8000-000000000010';
    layout.assignments.push({ ...scope, attendeeId, seatId: layout.sections[0].seats[0].seatId, fixed: false, revision: 1 });
    layout.ticketProtections.push({ ...scope, attendeeId, issued, sent: false, hasIssuedHistory: false, activeCredentialId: null });
    const original = structuredClone(layout);
    assert.throws(() => planSectionSettings(layout, sectionId, {
      name: '確認区画', rows: 2, columns: 3, axis: 'horizontal', seatOrder: 'reverse',
      lines: [{ name: 'A', startNumber: 9 }, { name: 'B' }],
    }), error => error.code === (issued ? 'ISSUED_SEAT_PROTECTED' : 'ASSIGNED_SEAT_REQUIRES_RELEASE'));
    assert.deepEqual(layout, original);
  }
});
