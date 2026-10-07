import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const textBytes = s => Buffer.byteLength(s, 'utf8') + 1;
const bytes = value => value === null || typeof value === 'boolean' ? 1
  : typeof value === 'number' ? 8 : typeof value === 'string' ? textBytes(value)
  : Array.isArray(value) ? value.reduce((n, v) => n + bytes(v), 0)
  : 32 + Object.entries(value).reduce((n, [k, v]) => n + textBytes(k) + bytes(v), 0);
const docBytes = (path, value) => path.split('/').reduce((n, x) => n + textBytes(x), 16) + bytes(value);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const root = `environments/${id(8)}/performances/${id(9)}`;
assert.equal(docBytes('users/jeff/tasks/my_task_id', { type: 'Personal', done: false, priority: 1, description: 'Learn Cloud Firestore' }), 147);
const reports = [];
for (const lineCount of [30, 1]) {
  const cells = {}, seats = {}, numberOwners = {}, lines = {}, sectionId = id(1), chunkIds = Array.from({ length: lineCount }, (_, i) => id(100 + i));
  for (const lineId of chunkIds) lines[lineId] = { name: 'FAKE', nextAutomaticNumber: 901 };
  for (let i = 0; i < 900; i++) {
    const cellId = id(1000 + i), lineId = chunkIds[Math.floor(i / (900 / lineCount))], seatId = id(3000 + i), number = '😀'.repeat(60) + String(i).padStart(4, '0');
    cells[cellId] = { sectionId, lineId, row: Math.floor(i / (900 / lineCount)), column: i % (900 / lineCount), kind: 'seat', seatId, consumedNumber: null };
    seats[seatId] = { cellId, lineId, displayNumber: number, numberingMode: 'manual', category: 'general', usable: true, reservedLabel: '', emergencyChange: { kind: 'add', operationId: id(6), reason: '😀'.repeat(200) } };
    numberOwners[`${lineId}|${number}`] = seatId;
  }
  const full = { revision: 1, operationId: id(6), sectionId, rows: lineCount, columns: 900 / lineCount, axis: 'horizontal', reverse: false, stagePosition: 'left', lines, cells, seats, numberOwners };
  const storageIds = Array.from({ length: 30 }, (_, i) => id(7000 + i));
  const chunkSizes = storageIds.map((chunkId, i) => {
    const groupCells = Object.fromEntries(Object.entries(cells).slice(i * 30, i * 30 + 30)), groupIds = new Set(Object.keys(groupCells)), lineId = Object.values(groupCells)[0].lineId;
    return docBytes(`${root}/chunks/${chunkId}`, { revision: 1, operationId: id(6), sectionId, lineId, chunkId, nextAutomaticNumber: lines[lineId].nextAutomaticNumber,
      cells: groupCells, seats: Object.fromEntries(Object.entries(seats).filter(([, s]) => groupIds.has(s.cellId))) });
  });
  const head = { revision: 1, operationId: id(6), chunkId: storageIds[0], chunkIds: storageIds, numberOwners, sectionId, rows: lineCount, columns: 900 / lineCount, axis: 'horizontal', reverse: false, stagePosition: 'left' };
  const state = { revision: 1, operationId: id(6), catalogRevision: 1, controlRevision: 0, assignments: Object.fromEntries(Object.keys(seats).map((s, i) => [s, i < 500 ? id(5000 + i) : ''])) };
  reports.push({ cells: 900, seats: 900, occupants: 500, lines: lineCount, cellsPerLine: 900 / lineCount, numberCodePoints: 64, reasonCodePoints: 200,
    unpartitionedDocumentBytes: docBytes(`${root}/catalog/current`, full), maxChunkDocumentBytes: Math.max(...chunkSizes), totalChunkDocumentBytes: chunkSizes.reduce((a, b) => a + b, 0), headDocumentBytes: docBytes(`${root}/head/current`, head), assignmentDocumentBytes: docBytes(`${root}/assignmentState/current`, state),
    storageGroups: 30, cellsPerGroup: 30, eachDocumentWithin1MiBForThisProfile: [...chunkSizes, docBytes(`${root}/head/current`, head), docBytes(`${root}/assignmentState/current`, state)].every(n => n < 1048576) });
}
assert(reports.every(r => r.eachDocumentWithin1MiBForThisProfile));
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const hash = createHash('sha256').update((await readFile(new URL('capacity.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
await writeFile(new URL('../artifacts/capacity-summary.json', import.meta.url), JSON.stringify({ scope: 'draft stress profiles only; 30-cell group split with global number index does not establish product limits or index/request budgets', hashLineEndings: 'LF', sourceSha256: hash, reports }, null, 2) + '\n');
console.log(JSON.stringify(reports));
