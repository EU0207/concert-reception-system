import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const textBytes = value => Buffer.byteLength(value, 'utf8') + 1;
const fieldBytes = value => {
  if (value === null || typeof value === 'boolean') return 1;
  if (typeof value === 'number' || value instanceof Date) return 8;
  if (typeof value === 'string') return textBytes(value);
  if (Array.isArray(value)) return value.reduce((n, v) => n + fieldBytes(v), 0);
  // Mapのフィールド名・値と32バイト。文書名はMapに加えない。
  return 32 + Object.entries(value).reduce((n, [k, v]) => n + textBytes(k) + fieldBytes(v), 0);
};
const docBytes = (path, value) => path.split('/').reduce((n, p) => n + textBytes(p), 16) + fieldBytes(value);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const limits = { documentBytes: 1048576, requestBytes: 10485760, callsPerOperation: 10, callsPerCommit: 20 };
const root = `environments/${id(1)}/performances/${id(2)}`;
const profiles = { sectionNameCodePoints: 64, lineNameCodePoints: 16, prefixCodePoints: 16, manualNumberCodePoints: 64, reasonCodePoints: 200 };
const longText = n => '😀'.repeat(n);

function layout(rows, columns) {
  return {
    environmentId: id(1), performanceId: id(2), sectionId: id(3), name: longText(profiles.sectionNameCodePoints),
    rows, columns, axis: 'vertical', seatOrder: 'reverse', stagePosition: 'top', displayOrder: 0,
    lineSettings: Array.from({ length: columns }, (_, i) => ({ lineId: id(i + 100), index: i, name: longText(profiles.lineNameCodePoints), prefix: longText(profiles.prefixCodePoints), startNumber: 1, nextAutomaticNumber: rows + 1 })),
    cells: Array.from({ length: rows * columns }, (_, i) => ({ cellId: id(i + 1000), row: Math.floor(i / columns), column: i % columns, kind: 'seat', seatId: id(i + 2000), consumedNumber: i + 1 }))
  };
}
function seat(i) {
  return { environmentId: id(1), performanceId: id(2), sectionId: id(3), lineId: id(100), seatId: id(i + 2000), numberingMode: 'manual', manualNumber: longText(profiles.manualNumberCodePoints), displayOrder: i, category: 'general', usable: true, assignedAttendeeId: id(i + 3000), revision: 1, emergencyChange: { kind: 'added', operationId: id(4), markedAt: new Date(0), reason: longText(profiles.reasonCodePoints) } };
}
const pairedDocuments = count => Array.from({ length: count }, (_, i) => [
  [`${root}/seats/${id(i + 2000)}`, seat(i)],
  [`${root}/assignments/${id(i + 3000)}`, { environmentId: id(1), performanceId: id(2), attendeeId: id(i + 3000), seatId: id(i + 2000), fixed: false, revision: 1 }]
]).flat();
function operationDocuments(count) {
  const pairs = Array.from({ length: count }, (_, i) => ({ attendeeId: id(i + 3000), fromSeatId: id(i + 2000), toSeatId: id(i + 4000) }));
  return [
    [`${root}/seatState/head`, { layoutRevision: 1, assignmentRevision: 1, operationId: id(4) }],
    [`${root}/seatOperations/${id(4)}`, { operationId: id(4), kind: 'assign', revision: 1, before: pairs, after: pairs }],
    [`${root}/events/${id(4)}`, { operationId: id(4), kind: 'assign', revision: 1, reason: longText(profiles.reasonCodePoints), before: pairs, after: pairs }]
  ];
}
const results = [];
for (const swap of [false, true]) {
  const documents = [...pairedDocuments(2).filter(([, value]) => swap || value.attendeeId !== id(3001)), ...operationDocuments(swap ? 2 : 1)];
  const sizes = documents.map(([path, value]) => docBytes(path, value));
  results.push({ scenario: swap ? 'swap-2' : 'move-1', documents: documents.length, largestDocumentBytes: Math.max(...sizes), documentBodyBytes: sizes.reduce((a, b) => a + b, 0), storageWithin1MiB: sizes.every(n => n < limits.documentBytes), minimumDistinctInverseReferences: swap ? 4 : 3, distinctReferencesWithSharedProof: swap ? 10 : 9 });
}
for (const count of [1, 2, 10, 500]) {
  const documents = [...pairedDocuments(count), ...operationDocuments(count)];
  const sizes = documents.map(([path, value]) => docBytes(path, value));
  results.push({ scenario: `assign-${count}`, documents: documents.length, largestDocumentBytes: Math.max(...sizes), documentBodyBytes: sizes.reduce((a, b) => a + b, 0), storageWithin1MiB: sizes.every(n => n < limits.documentBytes), minimumDistinctInverseReferences: 2 * count, distinctReferencesWithSharedProof: 2 * count + 6 });
}
for (const [rows, columns] of [[30, 30], [31, 30], [30, 31]]) {
  const data = layout(rows, columns);
  const bytes = docBytes(`${root}/layoutSections/${id(3)}`, data);
  results.push({ scenario: `layout-${rows}x${columns}`, cells: rows * columns, documentBytes: bytes, storageWithin1MiB: bytes < limits.documentBytes, proposalOnly: true });
}
// 公式文書の147バイト例に一致することを確認する。
assert.equal(docBytes('users/jeff/tasks/my_task_id', { type: 'Personal', done: false, priority: 1, description: 'Learn Cloud Firestore' }), 147);
assert.equal(textBytes('😀'), 5);
assert.equal(results.find(r => r.scenario === 'assign-500').storageWithin1MiB, true);
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/capacity-summary.json', import.meta.url), JSON.stringify({ basis: 'https://firebase.google.com/docs/firestore/storage-size', limits, profiles, profileStatus: 'proposal-not-approved-limits', requestSizeStatus: 'document sizes only; protobuf and index overhead not proven', results }, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
