import assert from 'node:assert/strict';
import {snapshot as readSnapshot} from '../GD91-96/snapshot.mjs';
import {decode} from './layout-model.mjs';

export async function snapshot(read, readReception, {cached, maxParts = 256, maxSections = 256, context = {}} = {}) {
  const raw = await readSnapshot(read, readReception, {cached, maxParts, maxSections});
  const models = raw.cachedGeometryUsed && cached.models ? cached.models : decode(raw.sections, Object.values(raw.cells), context);
  const cellsById = {}, seatsById = {};
  for (const m of models) {
    assert.equal(m.section.cells.length, m.section.rows * m.section.columns, 'snapshot-grid-incomplete');
    const coordinates = new Set();
    for (const c of m.section.cells) {
      assert(!cellsById[c.cellId], 'snapshot-cell-id-duplicate');
      const key = c.row + ',' + c.column;
      assert(!coordinates.has(key), 'snapshot-coordinate-duplicate'); coordinates.add(key);
      assert(Number.isSafeInteger(c.row) && c.row >= 0 && c.row < m.section.rows);
      assert(Number.isSafeInteger(c.column) && c.column >= 0 && c.column < m.section.columns);
      cellsById[c.cellId] = c;
    }
    for (const s of m.seats) {
      assert(!seatsById[s.seatId], 'snapshot-seat-id-duplicate'); seatsById[s.seatId] = s;
    }
  }
  for (const c of Object.values(cellsById)) assert(c.kind === 'seat' ? !!seatsById[c.seatId] : !c.seatId, 'snapshot-cell-seat-link');
  return {...raw, models, cellsById, seatsById};
}
