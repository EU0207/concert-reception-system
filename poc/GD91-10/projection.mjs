import { validate } from '../GD91-07/planner.mjs';

// 保存済みセルの座標を保持し、表示時に区画の移動量を適用する隔離検証。
export function project(model, head, context) {
  const s = model.section;
  for (const key of ['sectionId', 'rows', 'columns', 'axis', 'seatOrder', 'stagePosition']) {
    if (s[key] !== head[key]) throw new Error('section metadata mismatch');
  }
  if (!Number.isInteger(head.rowOffset) || head.rowOffset < 0 || head.rowOffset >= s.rows
    || !Number.isInteger(head.columnOffset) || head.columnOffset < 0 || head.columnOffset >= s.columns) throw new Error('invalid offset');
  const after = structuredClone(model);
  for (const c of after.section.cells) {
    c.row = (c.row + head.rowOffset) % s.rows;
    c.column = (c.column + head.columnOffset) % s.columns;
  }
  const delta = s.axis === 'horizontal' ? head.rowOffset : head.columnOffset;
  for (const line of after.section.lineSettings) line.index = (line.index + delta) % s.lineSettings.length;
  after.section.lineSettings.sort((a, b) => a.index - b.index);
  return validate(after, context);
}

// 初期集計の作成は試験用。正式な初期保存のサーバー検証を代替しない。
export function initialHead(model) {
  const s = model.section;
  const rowCounts = Object.fromEntries(Array.from({ length: s.rows }, (_, i) => [i, 0]));
  const columnCounts = Object.fromEntries(Array.from({ length: s.columns }, (_, i) => [i, 0]));
  for (const c of s.cells) if (c.kind !== 'unset') { rowCounts[c.row]++; columnCounts[c.column]++; }
  return { sectionId: s.sectionId, sectionName: s.name, rows: s.rows, columns: s.columns, axis: s.axis, seatOrder: s.seatOrder,
    stagePosition: s.stagePosition, initialNumbered: model.initialNumbered, rowOffset: 0, columnOffset: 0,
    rowCounts, columnCounts, nonEmptyCount: s.cells.filter(c => c.kind !== 'unset').length, sourceRevision: 1, revision: 1, operationId: '' };
}