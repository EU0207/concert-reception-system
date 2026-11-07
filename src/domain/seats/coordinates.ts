// 保存された基準座標を画面・計算用の論理座標へ変換する。入力の構成は変更しない。

import type { BaseLayoutSnapshot, Id, LogicalLayoutSnapshot, SectionOffset } from './types.ts';
import { requireValue, validateLayout } from './validation.ts';

// 保存アダプターが取得した基準構成から、一度だけ論理座標を作る。

// # 本文：基準座標から論理座標への変換

/** 区画の移動量を一度だけ適用し、列設定の順序を整えた構成を返す。 */
export function projectBaseLayout(
  snapshot: BaseLayoutSnapshot,
  offsets: Readonly<Record<Id, SectionOffset>>,
): LogicalLayoutSnapshot {
  requireValue(snapshot.coordinateSpace === 'base', 'BASE_COORDINATES_REQUIRED');
  validateLayout(snapshot.layout);

  const layout = structuredClone(snapshot.layout),
    ids = new Set(layout.sections.map((m) => m.section.sectionId));

  requireValue(
    Object.keys(offsets).every((id) => ids.has(id)),
    'OFFSET_SECTION_NOT_FOUND',
  );

  for (const model of layout.sections) {
    const s = model.section,
      offset = offsets[s.sectionId] ?? { rowOffset: 0, columnOffset: 0 };

    requireValue(
      Number.isSafeInteger(offset.rowOffset) && Number.isSafeInteger(offset.columnOffset),
      'INVALID_OFFSET',
    );

    const row = ((offset.rowOffset % s.rows) + s.rows) % s.rows;
    const column = ((offset.columnOffset % s.columns) + s.columns) % s.columns;

    for (const c of s.cells) {
      c.row = (c.row + row) % s.rows;
      c.column = (c.column + column) % s.columns;
    }

    const delta = s.axis === 'horizontal' ? row : column,
      count = s.lineSettings.length;

    for (const line of s.lineSettings) line.index = (line.index + delta) % count;

    s.lineSettings.sort((a, b) => a.index - b.index);
  }

  return { coordinateSpace: 'logical', layout: validateLayout(layout) };
}
