import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createSection, numberInitial} from '../GD91-07/planner.mjs';
import {indexSeatFacts} from '../GD91-48/comparison.mjs';
import {pack} from './codec.mjs';
const sources = ['analyze.mjs', 'codec.mjs', 'tests/codec.mjs', 'artifacts/codec-summary.json',
  '../GD91-47/artifacts/emulator-summary.json', '../GD91-48/comparison.mjs', '../GD91-07/planner.mjs'];
const read = async p => (await readFile(new URL(p, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async p => [p, createHash('sha256').update(await read(p)).digest('hex')])));
const sourceHashes = await hashes(), context = {maxCells: 10000};
const current = JSON.parse(await read('artifacts/codec-summary.json'));
assert.equal(current.reports.length, 20); assert(current.reports.every(r => r.status === 'passed'));
const old = JSON.parse(await read('../GD91-47/artifacts/emulator-summary.json'));
assert.equal(old.reports.length, 44); assert(old.reports.every(r => r.status === 'passed'));
const baseline = old.reports.find(r => r.id === 'R01');
assert.equal(baseline.preparationWrites, 1033); assert.equal(baseline.comparisonWrites, 171);
const previousTotalWrites = baseline.preparationWrites + baseline.comparisonWrites + 2 + 3;
assert.equal(previousTotalWrites, 1209);
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const measurements = [];
for (const [rows, columns] of [[10, 50], [1, 500], [500, 1]]) {
  const raw = createSection({name: '架空容量区画', rows, columns, axis: 'horizontal', seatOrder: 'forward',
    lines: Array.from({length: rows}, (_, i) => ({name: '列' + i}))}, context);
  const model = numberInitial(raw, Object.fromEntries(raw.section.cells.map(c => [c.row + ',' + c.column, 'seat'])), context);
  const entry = {environmentId: 'FAKE-environment', performanceId: 'FAKE-performance', generation: randomUUID(), model};
  const snapshot = pack(entry, 3, context), facts = Object.fromEntries(indexSeatFacts(entry, context).facts);
  const chunks = rows * Math.ceil(columns / 3); assert.equal(snapshot.chunks.length, chunks);
  const payloadDocs = snapshot.chunks.flatMap(p => [p.chunk, p.attributes]);
  const row = {rows, columns, cells: rows * columns, seats: model.seats.length, chunkSize: 3, chunks,
    chunkAndAttributeDocuments: payloadDocs.length, extraPerSeatFactDocuments: model.seats.length,
    combinedPayloadDocumentsWithDuplicatedFacts: payloadDocs.length + model.seats.length,
    chunkAndAttributeJsonBytes: payloadDocs.reduce((sum, p) => sum + bytes(p), 0),
    largestPayloadJsonBytes: Math.max(...payloadDocs.map(bytes)),
    singleFactMapJsonBytes: bytes(facts), duplicatedFactJsonBytes: Object.values(facts).reduce((sum, p) => sum + bytes(p), 0)};
  assert.equal(row.chunkAndAttributeDocuments, chunks * 2);
  measurements.push(row);
}
assert.equal(measurements[0].chunks, 170); assert.equal(measurements[0].chunkAndAttributeDocuments, 340);
const endSourceHashes = await hashes(); assert.deepEqual(sourceHashes, endSourceHashes);
const result = {executedAt: new Date().toISOString(), hashLineEndings: 'LF', sourceHashes, endSourceHashes,
  scope: 'Local format sizes and structural document counts. JSON bytes are not Firestore storage/index/request sizes. No new Rules, writes, billing or reference/expression budget measurement.',
  measuredPreviousReplacement: {source: 'GD91-47 R01', preparationWrites: 1033, comparisonWrites: 171, candidateWrites: 2, publicationWrites: 3, totalWrites: previousTotalWrites},
  conditionalDuplicatedFactCost: {condition: 'Only if GD91-47 pipeline remained unchanged and one extra write per seat were added.', addedWrites: 500, totalWrites: previousTotalWrites + 500},
  measurements, nextCandidate: 'Reuse chunk and attribute document families; derive logical facts in memory. Keep manual numbering mode/text and consumed cell number explicit. Candidate only, no production schema adoption.',
  newTotalWrites: null, referenceBudget: null, expressionBudget: null, realDeviceTested: false,
  nextGate: ['Server-validated manual and automatic construction including consumed-number and display-uniqueness checks.',
    'Complete old-seat enumeration with ID lookup into the new completed source; latest authorization and public-base checks.',
    'Emulator rejection/publication regression and measured complete-pipeline writes, references, expression evaluation and capacity.']};
await writeFile(new URL('artifacts/format-analysis.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({calculationCases: 20, measuredLayouts: measurements.length, payloadDocuments500: 340, avoidedDuplicatedFactDocuments500: 500, previousWrites: previousTotalWrites, newTotalWrites: null, emulatorExecuted: false}));
