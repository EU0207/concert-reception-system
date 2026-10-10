import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';

const sources = ['analyze.mjs', 'comparison.mjs', 'tests/comparison.mjs',
  '../GD91-47/firestore.rules', '../GD91-47/artifacts/emulator-summary.json', 'artifacts/comparison-summary.json'];
const read = async path => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await read(path)).digest('hex')])));
const sourceHashes = await hashes();
const current = JSON.parse(await read('artifacts/comparison-summary.json'));
assert.equal(current.reports.length, 36); assert(current.reports.every(r => r.status === 'passed'));
const old = JSON.parse(await read('../GD91-47/artifacts/emulator-summary.json'));
assert.equal(old.selectedCase, 'all'); assert.equal(old.reports.length, 44); assert(old.reports.every(r => r.status === 'passed'));
const baseline = old.reports.find(r => r.id === 'R01');
assert.equal(baseline.preparationWrites, 1033); assert.equal(baseline.comparisonWrites, 171);
const previousReplacementWrites = baseline.preparationWrites + baseline.comparisonWrites + 2 + 3;
assert.equal(previousReplacementWrites, 1209);
const rules = await read('../GD91-47/firestore.rules');
for (const marker of ['h.rows == old.rows && h.columns == old.columns', 'catalog.lines == oldCatalog.lines', 'h.chunkSize == 3 && old.chunkSize == 3']) assert(rules.includes(marker));
const requiredSourceProof = [
  'Both immutable generations must prove complete cell coverage and unique typed IDs.',
  'Automatic/manual fields, trimmed display uniqueness and consumed gap numbers must be server-validated.',
  'Line cursors and automatic numbering must be derived from all consuming cells, not accepted from comparison metadata.',
  'Every old seat must be enumerated once and compared by its own ID; absence is proven by the new completed ID registry.',
  'Published base, current authorization and control must be rechecked before emission and publication.',
  'Reference budgets, expression evaluation, capacity and actual write costs require an Emulator implementation.'
];
const endSourceHashes = await hashes(); assert.deepEqual(endSourceHashes, sourceHashes);
await writeFile(new URL('artifacts/contract-analysis.json', import.meta.url), JSON.stringify({executedAt: new Date().toISOString(),
  scope: 'Contract and preserved GD91-47 evidence analysis only. No new Rules or Emulator execution. No improvement in Firestore writes has been measured.',
  hashLineEndings: 'LF', sourceHashes, endSourceHashes, calculationScenarios: 36,
  previousReplacement: {seats: 500, preparationWrites: baseline.preparationWrites, comparisonWrites: baseline.comparisonWrites, candidateWrites: 2, publicationWrites: 3, totalWrites: previousReplacementWrites},
  nextPhysicalFormatSelected: false, nextReferenceBudgetMeasured: false, nextWriteCostMeasured: false, requiredSourceProof}, null, 2) + '\n');
console.log(JSON.stringify({calculationScenarios: 36, previousReplacementWrites, requiredSourceProof: requiredSourceProof.length, emulatorExecuted: false}));
