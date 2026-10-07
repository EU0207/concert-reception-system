import assert from 'node:assert/strict';

// 取得アダプターから独立した受信検証。端末永続化・画面への組込みは対象外。
const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const normalize = v => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, normalize(v[k])])) : v;
const integer = (v, min = 0) => Number.isSafeInteger(v) && v >= min;
const uuid = v => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);
const keys = (v, expected) => same(Object.keys(v).sort(), [...expected].sort());
function check(condition, code) { if (!condition) throw Object.assign(new Error(code), { code }); }
function validateManifest(m, performanceId) {
  check(m.schemaVersion === 2, 'unsupported-schema');
  check(m.performanceId === performanceId, 'wrong-performance');
  check(keys(m, ['schemaVersion', 'layoutRevision', 'performanceId', 'revision', 'operationId', 'assignmentRevision',
    'controlRevision', 'sectionId', 'rows', 'columns', 'axis', 'reverse', 'stagePosition', 'chunkVersions']), 'manifest-shape');
  check(integer(m.layoutRevision, 1) && integer(m.revision, 1) && integer(m.assignmentRevision) && integer(m.controlRevision), 'manifest-revision');
  check(uuid(m.sectionId) && (m.operationId === '' || uuid(m.operationId)), 'manifest-identity');
  check(integer(m.rows, 1) && integer(m.columns, 1) && ['horizontal', 'vertical'].includes(m.axis)
    && typeof m.reverse === 'boolean' && ['left', 'top'].includes(m.stagePosition), 'manifest-geometry');
  check(m.chunkVersions && Object.keys(m.chunkVersions).length > 0
    && Object.entries(m.chunkVersions).every(([id, revision]) => uuid(id) && integer(revision, 1)), 'manifest-chunks');
}
function validateSnapshot(m, chunks, state) {
  check(keys(chunks, Object.keys(m.chunkVersions)), 'missing-chunk');
  check(state.revision === m.assignmentRevision && state.catalogRevision === m.layoutRevision
    && state.controlRevision === m.controlRevision && state.operationId === m.operationId, 'assignment-version');
  const allSeats = new Set(), allCells = new Set(), positions = new Set();
  for (const [id, c] of Object.entries(chunks)) {
    check(c.chunkId === id && c.sectionId === m.sectionId && c.revision === m.chunkVersions[id], 'chunk-version');
    for (const [cellId, cell] of Object.entries(c.cells)) {
      const position = `${cell.row}:${cell.column}`;
      check(!allCells.has(cellId) && !positions.has(position) && cell.sectionId === m.sectionId
        && cell.lineId === c.lineId && integer(cell.row) && cell.row < m.rows
        && integer(cell.column) && cell.column < m.columns, 'cell-identity');
      allCells.add(cellId); positions.add(position);
      check(cell.kind === 'seat' ? c.seats[cell.seatId]?.cellId === cellId
        : ['unset', 'space', 'aisle', 'gap'].includes(cell.kind) && cell.seatId === '', 'cell-seat-reference');
    }
    for (const [seatId, seat] of Object.entries(c.seats)) {
      check(!allSeats.has(seatId) && c.cells[seat.cellId]?.seatId === seatId && seat.lineId === c.lineId, 'seat-identity');
      allSeats.add(seatId);
    }
  }
  check(keys(state.assignments, [...allSeats]), 'assignment-identity');
  const occupants = Object.values(state.assignments).filter(v => v !== '');
  check(occupants.every(uuid) && new Set(occupants).size === occupants.length, 'assignment-duplicate');
}

// 一時領域へ集め、前後の軽量版が同じ場合だけ一括返却する。
export async function receive(io, performanceId, local = null, maxAttempts = 2) {
  try {
    if (local) validateManifest(local.manifest, performanceId);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const manifest = await io.readManifest(); validateManifest(manifest, performanceId);
      if (local) {
        check(manifest.revision >= local.manifest.revision, 'version-rollback');
        if (manifest.revision === local.manifest.revision) {
          check(same(manifest, local.manifest), 'same-version-mismatch');
          return { status: 'unchanged', snapshot: local, attempts: attempt };
        }
      }
      const chunks = structuredClone(local?.chunks ?? {});
      for (const id of Object.keys(chunks)) if (!Object.hasOwn(manifest.chunkVersions, id)) delete chunks[id];
      const changed = Object.entries(manifest.chunkVersions).filter(([id, revision]) => local?.manifest.chunkVersions[id] !== revision);
      await Promise.all(changed.map(async ([id]) => { chunks[id] = await io.readChunk(id); }));
      // 割当は現行の単一正本を取得する。席替えを含む合同方式の差分化は別検証。
      const state = local?.manifest.assignmentRevision === manifest.assignmentRevision
        ? structuredClone(local.state) : await io.readAssignment();
      const end = await io.readManifest(); validateManifest(end, performanceId);
      if (!same(end, manifest)) continue;
      validateSnapshot(manifest, chunks, state);
      return { status: 'updated', snapshot: { manifest, chunks, state }, changedChunks: changed.length, attempts: attempt };
    }
    return { status: 'held', reason: 'version-changing', snapshot: local, attempts: maxAttempts };
  } catch (error) {
    return { status: 'held', reason: error.code ?? 'read-failed', snapshot: local };
  }
}

export class Receiver {
  constructor(performanceId, initial = null) { this.performanceId = performanceId; this.current = initial; this.request = 0; }
  async refresh(io) {
    const request = ++this.request;
    const result = await receive(io, this.performanceId, this.current);
    if (request !== this.request) return { status: 'held', reason: 'superseded', snapshot: this.current };
    if (result.status === 'updated') this.current = result.snapshot;
    assert(result.status === 'held' || this.current === result.snapshot);
    return result;
  }
}
