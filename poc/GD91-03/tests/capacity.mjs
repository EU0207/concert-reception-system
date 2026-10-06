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
assert.equal(docBytes('users/jeff/tasks/my_task_id', { type: 'Personal', done: false, priority: 1, description: 'Learn Cloud Firestore' }), 147);
const reports = [];
for (const seatCount of [600, 900]) for (const marked of [false, true]) {
  const cells = {}, seats = {}, numberOwners = {}, lines = {}, sectionId = id(1);
  for (let line = 0; line < 30; line++) lines[id(100 + line)] = { name: `L${line}`, nextAutomaticNumber: 31 };
  for (let i = 0; i < 900; i++) {
    const cellId = id(1000 + i), lineId = id(100 + Math.floor(i / 30)), seatId = i < seatCount ? id(3000 + i) : '';
    cells[cellId] = { sectionId, lineId, row: Math.floor(i / 30), column: i % 30, kind: seatId ? 'seat' : 'unset', seatId, consumedNumber: null };
    if (seatId) {
      const number = '😀'.repeat(60) + String(i).padStart(4, '0');
      seats[seatId] = { cellId, lineId, displayNumber: number, numberingMode: 'manual', category: 'general', usable: true, reservedLabel: '', emergencyChange: marked ? { kind: 'add', operationId: id(6), reason: '😀'.repeat(200) } : null };
      numberOwners[`${lineId}|${number}`] = seatId;
    }
  }
  const catalog = { revision: 1, operationId: id(6), sectionId, rows: 30, columns: 30, axis: 'horizontal', reverse: false, stagePosition: 'left', lines, cells, seats, numberOwners };
  const size = docBytes(`environments/${id(8)}/performances/${id(9)}/catalog/current`, catalog);
  reports.push({ cells: 900, seats: seatCount, markedSeats: marked ? seatCount : 0, idsCharacters: 36, numberCodePoints: 64, reasonCodePoints: 200, catalogDocumentBytes: size, within1MiBForThisProfile: size < 1048576 });
}
assert(reports.some(r => !r.within1MiBForThisProfile), 'Capacity boundary must remain visible');
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const hash = createHash('sha256').update((await readFile(new URL('capacity.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
await writeFile(new URL('../artifacts/capacity-summary.json', import.meta.url), JSON.stringify({ scope: 'draft stress profile, not approved product limits; full catalog is not a production adoption candidate without capacity redesign', hashLineEndings: 'LF', sourceSha256: hash, reports }, null, 2) + '\n');
console.log(JSON.stringify(reports));
