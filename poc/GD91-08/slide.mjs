import { validate } from '../GD91-07/planner.mjs';

// CONF-075の計算部分だけを検証する。認可・公演日時と永続化は保存層の責務。
const directions = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export function slide(before, command, context) {
  validate(before, context);
  requireValue(before.initialNumbered === true, 'initial numbering required');
  requireValue(Object.hasOwn(directions, command.direction) && command.amount === 1, 'invalid slide command');
  const [rowDelta, columnDelta] = directions[command.direction];
  const s = before.section;
  const boundary = s.cells.filter(c => rowDelta < 0 ? c.row === 0
    : rowDelta > 0 ? c.row === s.rows - 1
      : columnDelta < 0 ? c.column === 0 : c.column === s.columns - 1);
  requireValue(boundary.every(c => c.kind === 'unset' && c.seatId === undefined && c.consumedNumber === undefined), 'boundary is not empty');
  const after = structuredClone(before);
  const change = { direction: command.direction, amount: 1, rowDelta, columnDelta,
    changed: s.cells.some(c => c.kind !== 'unset') };
  if (!change.changed) return { after, change };

  // 外へ出るのは検査済みの未セルだけ。席を含むセルは一律に平行移動する。
  for (const c of after.section.cells) {
    c.row = (c.row + rowDelta + s.rows) % s.rows;
    c.column = (c.column + columnDelta + s.columns) % s.columns;
  }
  const lineDelta = s.axis === 'horizontal' ? rowDelta : columnDelta;
  if (lineDelta) {
    const count = s.lineSettings.length;
    for (const line of after.section.lineSettings) line.index = (line.index + lineDelta + count) % count;
    after.section.lineSettings.sort((a, b) => a.index - b.index);
  }
  validate(after, context);
  return { after, change };
}
