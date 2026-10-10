import assert from 'node:assert/strict';
import {indexSeatFacts} from '../GD91-48/comparison.mjs';

const attributes = ['category', 'usable', 'reservedLabel', 'displayOrder', 'emergencyChange'];
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const validSize = size => assert(Number.isInteger(size) && size >= 1 && size <= 5, 'unsupported chunk size');

// 隔離した物理形式候補。サーバー側の完成証明や認可を代替しない。
export function pack(entry, size, context) {
  validSize(size); indexSeatFacts(entry, context);
  const {cells, ...section} = structuredClone(entry.model.section);
  const seats = new Map(entry.model.seats.map(s => [s.seatId, s]));
  const byPosition = new Map(cells.map(c => [c.row + ':' + c.column, c]));
  const chunks = [];
  for (let row = 0; row < section.rows; row++) for (let column = 0; column < section.columns; column += size) {
    const content = [], values = [];
    for (let col = column; col < Math.min(column + size, section.columns); col++) {
      const cell = byPosition.get(row + ':' + col), seat = seats.get(cell.seatId);
      const numbering = seat ? seat.numberingMode === 'automatic'
        ? {mode: 'automatic', number: seat.number} : {mode: 'manual', manualNumber: seat.manualNumber} : null;
      content.push({cell: structuredClone(cell), numbering});
      values.push(seat ? structuredClone(Object.fromEntries(attributes.filter(k => Object.hasOwn(seat, k)).map(k => [k, seat[k]]))) : null);
    }
    const id = row + '-' + column;
    chunks.push({id, chunk: {formatVersion: 2, row, startColumn: column, content},
      attributes: {formatVersion: 2, row, startColumn: column, values}});
  }
  return {formatVersion: 2, environmentId: entry.environmentId, performanceId: entry.performanceId,
    generation: entry.generation, initialNumbered: true, section, chunkSize: size, chunks};
}

export function unpack(snapshot, context) {
  assert(exact(snapshot, ['formatVersion', 'environmentId', 'performanceId', 'generation', 'initialNumbered', 'section', 'chunkSize', 'chunks']), 'snapshot schema');
  assert.equal(snapshot.formatVersion, 2); assert.equal(snapshot.initialNumbered, true); validSize(snapshot.chunkSize);
  assert(Array.isArray(snapshot.chunks));
  const section = structuredClone(snapshot.section);
  assert(!Object.hasOwn(section, 'cells')); section.cells = [];
  const seats = [], seen = new Set();
  for (const part of snapshot.chunks) {
    assert(exact(part, ['id', 'chunk', 'attributes']), 'part schema');
    const c = part.chunk, a = part.attributes;
    assert(exact(c, ['formatVersion', 'row', 'startColumn', 'content']) && exact(a, ['formatVersion', 'row', 'startColumn', 'values']), 'document schema');
    assert.equal(c.formatVersion, 2); assert.equal(a.formatVersion, 2);
    assert.equal(a.row, c.row); assert.equal(a.startColumn, c.startColumn);
    assert(Number.isInteger(c.row) && c.row >= 0 && c.row < section.rows);
    assert(Number.isInteger(c.startColumn) && c.startColumn >= 0 && c.startColumn < section.columns && c.startColumn % snapshot.chunkSize === 0);
    assert.equal(part.id, c.row + '-' + c.startColumn); assert(!seen.has(part.id), 'duplicate chunk'); seen.add(part.id);
    assert(Array.isArray(c.content) && Array.isArray(a.values));
    assert.equal(c.content.length, Math.min(snapshot.chunkSize, section.columns - c.startColumn));
    assert.equal(a.values.length, c.content.length);
    c.content.forEach((item, i) => {
      assert(exact(item, ['cell', 'numbering']), 'item schema');
      const cell = structuredClone(item.cell); assert.equal(cell.row, c.row); assert.equal(cell.column, c.startColumn + i);
      section.cells.push(cell);
      if (cell.kind !== 'seat') { assert.equal(item.numbering, null); assert.equal(a.values[i], null); return; }
      const n = item.numbering, values = a.values[i];
      assert(values && typeof values === 'object' && !Array.isArray(values) && Object.keys(values).every(k => attributes.includes(k)));
      assert(Object.hasOwn(values, 'category') && Object.hasOwn(values, 'usable'));
      assert(n && (n.mode === 'automatic' ? exact(n, ['mode', 'number']) : n.mode === 'manual' && exact(n, ['mode', 'manualNumber'])), 'numbering schema');
      const line = section.lineSettings[section.axis === 'horizontal' ? cell.row : cell.column]; assert(line);
      seats.push({seatId: cell.seatId, sectionId: section.sectionId, lineId: line.lineId,
        numberingMode: n.mode, ...(n.mode === 'automatic' ? {prefix: line.prefix, number: n.number} : {manualNumber: n.manualNumber}), ...structuredClone(values)});
    });
  }
  assert.equal(seen.size, section.rows * Math.ceil(section.columns / snapshot.chunkSize), 'incomplete chunks');
  const entry = {environmentId: snapshot.environmentId, performanceId: snapshot.performanceId, generation: snapshot.generation,
    model: {section, seats, assignments: [], ticketRefs: [], initialNumbered: true}};
  indexSeatFacts(entry, context); return entry;
}
