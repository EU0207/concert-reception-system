// 区画設定の画面入力を、既存の採番・縮小・拡張処理に渡して変更案をまとめる。

import { assessSeatChanges, extendSection, numberInitial, reconfigureSection, renameSection } from '../domain/seats/layout.ts';
import type { SeatLayout, SectionInput } from '../domain/seats/types.ts';

/** 作成済み区画の寸法と採番を変更する。途中の案は画面へ適用しない。 */
export function planSectionSettings(before: SeatLayout, sectionId: string, input: SectionInput) {
  let after = renameSection(before, sectionId, input.name).after;
  let model = after.sections.find(({ section }) => section.sectionId === sectionId)!;

  if (!model.initialNumbered) {
    after = numberInitial(after, sectionId, {}).after;
    model = after.sections.find(({ section }) => section.sectionId === sectionId)!;
  }

  const old = model.section;
  const rows = Math.min(old.rows, input.rows);
  const columns = Math.min(old.columns, input.columns);
  if (rows !== old.rows || columns !== old.columns) {
    after = reconfigureSection(after, sectionId, { rows, columns }).after;
  }

  // 拡張は現在の採番方向で既存席を保った後、最終設定の再構成へ渡す。
  for (const dimension of ['rows', 'columns'] as const) {
    const current = after.sections.find(({ section }) => section.sectionId === sectionId)!.section;
    const count = input[dimension] - current[dimension];
    if (count <= 0) continue;

    const addsLines = dimension === (current.axis === 'horizontal' ? 'rows' : 'columns');
    const size = current.lineSettings.length;
    after = extendSection(after, sectionId, {
      dimension, count,
      ...(addsLines ? { lines: Array.from({ length: count }, (_, index) =>
        input.lines[size + index] ?? { name: `列${size + index + 1}` }) } : {}),
    }).after;
  }

  after = reconfigureSection(after, sectionId, {
    axis: input.axis, seatOrder: input.seatOrder, lines: input.lines,
  }).after;

  return assessSeatChanges(before, after);
}
