import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generated as beforeObservation} from '../GD91-111/generate.mjs';
import {generated as afterObservation} from '../GD91-113/generate.mjs';
import {generated as current} from '../GD91-116/generate.mjs';

// V4の証拠照合専用。ネットワーク接続・業務試験の再実行はしない。
const root = new URL('./', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const fileHash = url => hash(fs.readFileSync(url, 'utf8').replace(/\r\n/g, '\n'));
let comparisons = 0;
const evidence = [];
function proof(folder, name, expected) {
  const path = `../GD91-${folder}/artifacts/${name}.json`, result = read(path);
  assert(!result.failure, path);
  assert.deepEqual(result.sourceHashes, result.endSourceHashes, path);
  assert(result.sourceHashes && Object.keys(result.sourceHashes).length > 0, path);
  for (const [source, digest] of Object.entries(result.sourceHashes)) {
    assert.equal(fileHash(new URL(`../GD91-${folder}/${source}`, root)), digest, source);
    comparisons++;
  }
  const count = (result.reports ?? result.runs).length;
  assert.equal(count, expected, path);
  if (result.cleanup) assert(result.cleanup.rulesClosed && result.cleanup.trialRootEmpty, path);
  evidence.push({path, groups: count, artifactHash: hash(JSON.stringify(result)),
    rulesSource: result.executedRulesSource ?? 'see-sourceHashes',
    historicalExecutionNotRerun: true});
  return result;
}

// GD91-73の225件は旧Firestore候補。RTDBの合格数へ加算しない。
const legacy = read('../GD91-73/artifacts/projection-summary.json');
assert(legacy.sourceHashes);
const regression = {
  section:18, 'section-common':4, 'geometry-slide':9, structural:9,
  'display-common':4, groups:19, 'groups-common':8, layout:21, 'layout-common':8,
  closed:20, 'closed-common':12, quarantine:13, sharing:14, manager:12, queue:12,
  general:4, clock:7, review:16, common:6, 'read-budget':4
};
for (const [name, count] of Object.entries(regression)) proof(111, `regression-${name}-summary`, count);
proof(111, 'numbering-regression-summary', 14);
proof(84, 'local-summary', 32);
proof(88, 'lifecycle-summary', 26);
proof(88, 'business-summary', 13);
proof(88, 'regression-summary', 32);
proof(88, 'receipt-regression-summary', 13);
proof(113, 'local-summary', 28);
proof(113, 'external-local-summary', 8);
for (const [name, count] of Object.entries({retention:8, registry:8, closing:17, collection:4})) {
  proof(114, `${name}-summary`, count);
}
proof(116, 'local-summary', 10);
proof(117, 'addition-summary', 2);
proof(119, 'local-summary', 14);
for (const people of [4, 600, 1000]) proof(121, `capacity-${people}-summary`, 1);

function changes(a, b, path = '', out = []) {
  if (a === b) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) changes(a[key], b[key], `${path}/${key}`, out);
  } else out.push(path);
  return out;
}
const observationChanges = changes(beforeObservation(), afterObservation()).sort();
assert.deepEqual(observationChanges, [
  '/rules/checks/$run/quarantine/$device/events/$key/.validate',
  '/rules/checks/$run/receipts/$device/events/$key/.validate'
]);
const limitChanges = changes(afterObservation(), current()).sort();
assert.deepEqual(limitChanges, [
  '/rules/checks/$run/.validate',
  '/rules/checks/$run/generations/$generation/.validate',
  '/rules/checks/$run/generations/$generation/sections/$section/.validate'
]);
assert.deepEqual(read('../GD91-121/database.rules.json'), current());
const interrupted = read('../GD91-113/artifacts/regression-scope-interruption.json');
assert.equal(interrupted.interruptedScopePassed, false);
const currentRulesHash = hash(JSON.stringify(current()));
assert.equal(read('../GD91-121/artifacts/audit-summary.json').rulesHash, currentRulesHash);
const sourceHashes = {'audit.mjs': fileHash(new URL('audit.mjs', root))};
const result = {
  sourceHashes, endSourceHashes: sourceHashes, sourceComparisons: comparisons,
  evidence, currentRulesHash, observationChanges, limitChanges,
  evidenceAuditOnly: true, businessScenariosExecuted: 0, externalRequestsExecuted: 0,
  legacyFirestore225AddedToRtdbPassCount: false,
  interruptedGd113StructuralSuiteCountedAsPassed: false,
  allScopesExecutedOnCurrentRulesClaimed: false,
  unresolvedAdoptionConditions: [
    'TECH-DD91-112: shared authorization boundary with ADR-006 Firestore images',
    'pre-adoption migration/rollback evidence and App Check evidence not located'
  ],
  methodDecisionApproved: false, issue101Complete: false,
  productionImplementation: false, fullBusinessFreeTierVerified: false, tested3000: false
};
fs.mkdirSync(new URL('artifacts/', root), {recursive:true});
fs.writeFileSync(new URL('artifacts/evidence-summary.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({evidenceFiles:evidence.length, sourceComparisons:comparisons,
  ruleChanges:observationChanges.length + limitChanges.length,
  externalRequestsExecuted:0, businessScenariosExecuted:0, adoptionBlocked:true}));
