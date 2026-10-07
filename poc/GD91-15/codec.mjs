import assert from 'node:assert/strict';
import { validate } from '../GD91-07/planner.mjs';

// 隔離検証の物理形式。共通情報は親区画・列から復元し、業務のSeat契約は変えない。
export function pack(model, size, context) {
  validate(model, context); assert([1, 2, 3, 4, 5].includes(size));
  assert(model.seats.every(s => s.numberingMode === 'automatic'), 'manual seats are outside this proof');
  const allowed = new Set(['seatId', 'sectionId', 'lineId', 'numberingMode', 'prefix', 'number', 'category', 'usable', 'reservedLabel', 'displayOrder', 'emergencyChange']);
  assert(model.seats.every(s => Object.keys(s).every(k => allowed.has(k))), 'unknown Seat field');
  const section = model.section, seats = new Map(model.seats.map(s => [s.seatId, s])), chunks = [];
  for (let row = 0; row < section.rows; row++) for (let column = 0; column < section.columns; column += size) {
    const source = section.cells.filter(c => c.row === row && c.column >= column && c.column < column + size).sort((a,b) => a.column - b.column);
    const values = [], keys = [], cells = source.map(c => {
      const s = seats.get(c.seatId), line = section.lineSettings[section.axis === 'horizontal' ? c.row : c.column];
      const numberValue = s?.number ?? c.consumedNumber ?? null;
      values.push(s ? structuredClone(Object.fromEntries(Object.entries(s).filter(([k]) => ['category', 'usable', 'reservedLabel', 'displayOrder', 'emergencyChange'].includes(k)))) : null);
      keys.push(numberValue === null ? '' : line.lineId + ':' + numberValue);
      return {cellId:c.cellId,row:c.row,column:c.column,kind:c.kind,seatId:c.seatId ?? '',numberValue};
    });
    chunks.push({id:row+'-'+column,value:{row,startColumn:column,cells,cellIds:cells.map(c=>c.cellId),numberKeys:keys},attributes:{row,startColumn:column,values}});
  }
  return chunks;
}

export function unpack(head, catalog, chunk, attributes) {
  assert.equal(catalog.sectionId, head.sectionId); assert.equal(chunk.row, attributes.row); assert.equal(chunk.startColumn, attributes.startColumn);
  assert.equal(chunk.cells.length, attributes.values.length);
  const seats = [], cells = chunk.cells.map((c, i) => {
    const line = catalog.lines[head.axis === 'horizontal' ? c.row : c.column]; assert(line);
    const {numberValue, ...cell} = c;
    if (c.kind === 'seat') {
      const a = attributes.values[i]; assert(a && typeof a === 'object' && !Array.isArray(a));
      assert(Object.keys(a).every(k => ['category','usable','reservedLabel','displayOrder','emergencyChange'].includes(k)));
      seats.push({seatId:c.seatId,sectionId:head.sectionId,lineId:line.lineId,numberingMode:'automatic',prefix:line.prefix,number:numberValue,...structuredClone(a)});
    } else { assert.equal(attributes.values[i], null); delete cell.seatId; if(c.kind==='gap') cell.consumedNumber = numberValue; }
    return cell;
  });
  return {cells,seats};
}
