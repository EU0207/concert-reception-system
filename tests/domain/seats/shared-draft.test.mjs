// 共有用の構成形式2と編集情報形式1が、製品入力を欠落なく往復することを確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLayout, createSection, numberInitial, editUnassignedSeat } from '../../../src/domain/seats/layout.ts';
import { planSharedDraft, restoreSharedDraft, sharedCanonical } from '../../../src/domain/seats/shared-draft.ts';

const scope = { environmentId: randomUUID(), performanceId: randomUUID() };
const basis = { ...scope, expectedSharedRevision: 0, baseLayoutGeneration: '', baseLayoutRevision: 0,
  sourceControlRevision: 1, calendarRevision: 1 };

/** 採番前・採番後の両方へ使う架空区画を作る。 */
function layout(rows = 1, columns = 5) {
  return createSection(createLayout(scope), { name: '架空区画', rows, columns,
    axis: 'horizontal', seatOrder: 'forward', lines: Array.from({ length: rows }, (_, index) => ({ name: `列${index}` })) }).after;
}

test('SHARE104-T01 未採番と空の任意設定を別々の形式へ固定し、推測せず復元する', () => {
  const source = { layout: layout(), editReasons: {}, imageBindings: {} };
  const fixed = planSharedDraft(source, basis, randomUUID(), {});
  assert.equal(fixed.schemaVersion, 1);
  assert.equal(Object.values(fixed.editor.sections)[0].initialNumbered, false);
  assert.deepEqual(restoreSharedDraft(fixed), source);
  source.layout.sections[0].section.name = '後の変更';
  assert.equal(Object.values(fixed.sections)[0].name, '架空区画');
});

test('SHARE104-T02 手動番号・元の消費番号と旧理由を保持し、未対応の5画像も一覧へ残す', () => {
  let source = layout();
  const section = source.sections[0].section;
  source = numberInitial(source, section.sectionId, Object.fromEntries(section.cells.map((cell) => [cell.cellId, 'seat']))).after;
  const seatId = source.sections[0].seats[3].seatId;
  source = editUnassignedSeat(source, section.sectionId, seatId, { number: '臨時-6', reason: '架空の旧理由' }).after;
  const input = { layout: source, editReasons: { [seatId]: '架空の旧理由' }, imageBindings: { [section.sectionId]: '0' } };
  const images = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index), {
    ...scope, schemaVersion: 1, active: true, bank: 'a', revision: 1, operationId: randomUUID(), sha256: 'a'.repeat(64),
  }]));
  const fixed = planSharedDraft(input, basis, randomUUID(), images);
  assert.deepEqual(restoreSharedDraft(fixed), input);
  assert.equal(Object.keys(fixed.editor.images).length, 5);
});

test('SHARE104-T03 最大4096セルを16セルずつに分割し、未知項目・欠損と別公演を拒否する', () => {
  const input = { layout: layout(64, 64) };
  const plan = planSharedDraft(input, basis, randomUUID(), {});
  assert.equal(plan.parts.length, 256);
  assert.ok(plan.parts.every((part) => part.count === 16 && Buffer.byteLength(JSON.stringify(part)) <= 65536));
  assert.equal(sharedCanonical(restoreSharedDraft(plan)), sharedCanonical(input));
  for (const alter of [
    (p) => { delete p.editor.sections[Object.keys(p.editor.sections)[0]].initialNumbered; },
    (p) => { p.extra = true; },
    (p) => { p.parts.pop(); },
    (p) => { p.performanceId = randomUUID(); },
  ]) {
    const invalid = structuredClone(plan); alter(invalid);
    assert.throws(() => restoreSharedDraft(invalid));
  }
});
