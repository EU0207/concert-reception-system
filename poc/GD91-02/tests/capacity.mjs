import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const textBytes = s => Buffer.byteLength(s, 'utf8') + 1;
const bytes = value => value === null || typeof value === 'boolean' ? 1
  : typeof value === 'number' || value instanceof Date ? 8
  : typeof value === 'string' ? textBytes(value)
  : Array.isArray(value) ? value.reduce((n, v) => n + bytes(v), 0)
  : 32 + Object.entries(value).reduce((n, [k, v]) => n + textBytes(k) + bytes(v), 0);
const docBytes = (path, value) => path.split('/').reduce((n, x) => n + textBytes(x), 16) + bytes(value);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const root = `environments/${id(1)}/performances/${id(2)}`;
const reports = [];
for (const seats of [500, 900]) {
  const seatIds = Array.from({ length: seats }, (_, i) => id(1000 + i));
  const attendees = Array.from({ length: 500 }, (_, i) => id(3000 + i));
  const before = Object.fromEntries(seatIds.map(s => [s, '']));
  const after = Object.fromEntries(seatIds.map((s, i) => [s, i < 500 ? attendees[i] : '']));
  const state = { revision: 1, operationId: id(4), catalogRevision: 1, eligibilityRevision: 1, controlRevision: 1, assignments: after };
  const history = { mode: 'bulk', kind: 'assign', deviceUid: id(5), revision: 1, baseRevision: 0, reason: '😀'.repeat(200), before, after };
  const swapHistory = { mode: 'small', kind: 'swap', deviceUid: id(5), revision: 2, baseRevision: 1, reason: '😀'.repeat(200), seat1: seatIds[0], seat2: seatIds[1], before1: attendees[0], before2: attendees[1], after1: attendees[1], after2: attendees[0] };
  // 後続の全員再配置では履歴の前後双方に500人分のIDが入る。
  const fullHistory = { ...history, before: after, after: { ...after, [seatIds[0]]: attendees[1], [seatIds[1]]: attendees[0] } };
  const catalog = { revision: 1, seatIds, lockedSeatIds: seatIds };
  const eligibility = { revision: 1, attendeeIds: attendees };
  const sizes = { assignmentState: docBytes(`${root}/assignmentState/current`, state), initialHistory: docBytes(`${root}/operations/${id(4)}`, history), occupiedHistory: docBytes(`${root}/operations/${id(4)}`, fullHistory), swapHistory: docBytes(`${root}/operations/${id(4)}`, swapHistory), catalog: docBytes(`${root}/catalog/current`, catalog), eligibility: docBytes(`${root}/eligibility/current`, eligibility) };
  assert(Object.values(sizes).every(n => n < 1048576));
  reports.push({ seats, occupants: 500, idsCharacters: 36, reasonCodePoints: 200, documentBytes: sizes, writesPerAssignmentCommit: 2, callsPerDocumentWithoutCache: { assignment: 7, history: 5 }, callsPerCommitWithoutCache: 12, within1MiBForThisProfile: true });
}
assert.equal(docBytes('users/jeff/tasks/my_task_id', { type: 'Personal', done: false, priority: 1, description: 'Learn Cloud Firestore' }), 147);
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const hash = createHash('sha256').update((await readFile(new URL('capacity.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')).digest('hex');
await writeFile(new URL('../artifacts/capacity-summary.json', import.meta.url), JSON.stringify({ scope: 'draft profile; not approved input limits or actual request/index size', hashLineEndings: 'LF', sourceSha256: hash, reports }, null, 2) + '\n');
console.log(JSON.stringify(reports));
