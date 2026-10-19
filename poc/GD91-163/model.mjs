import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from '../GD91-128/conversion.mjs';
import {marker} from '../GD91-159/protocol.mjs';
import {detailRoots} from '../GD91-154/rules.mjs';
import {business} from '../GD91-161/recovery.mjs';
import {planRecovery, resumeRecovery} from './recovery.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';

const root = new URL('./', import.meta.url), files = ['model.mjs', 'recovery.mjs'], before = sourceHashes(root, files), cases = [];
const person = 'FAKE-person', id = 'FAKE-amendment', candidate = 'FAKE-candidate';
const fact = {attendeeId: person, name: '架空氏名', partition: 'part0', arrived: true, revision: 1, lastCorrectionId: 'FAKE-close'};
const total = {total: 1, arrived: 1, revision: 1, lastCorrectionId: 'FAKE-close'}, closingResults = {close: {peopleCount: 1}};
const boundary = {operationId: 'FAKE-cut', serverDeletionComplete: true, actualsHash: hash({[person]: fact}), totalsHash: hash({part0: total}), closingResultsHash: hash(closingResults)};
const decision = {operationId: id, personId: person, partition: 'part0', chosenCandidateId: candidate, reviewedCount: 1,
  previousFactRevision: 1, previousFactCorrectionId: 'FAKE-close', previousArrived: true, previousTotalRevision: 1, previousTotalCorrectionId: 'FAKE-close', previousTotalArrived: 1,
  arrived: false, reason: '架空の訂正', allCandidatesConfirmed: true, retentionOperationId: 'FAKE-cut', humanUid: 'FAKE-human', managerDeviceUid: 'FAKE-device', decidedAt: 10};
const data = {control: {state: 'closed'}, retentionBoundary: boundary, closingResults,
  actuals: {[person]: {...fact, arrived: false, revision: 2, lastCorrectionId: id}}, actualTotals: {part0: {...total, arrived: 0, revision: 2, lastCorrectionId: id}},
  actualAmendmentHeads: {[person]: id}, actualAmendments: {[id]: decision}, actualAmendmentWindows: {[id]: {
    meta: {operationId: id, personId: person, partition: 'part0', phase: 'committed', baseFactRevision: 1, baseArrived: true, baseCorrectionId: 'FAKE-close', sealedCount: 1},
    progress: {count: 1}, candidates: {[candidate]: {operationId: candidate, personId: person, arrived: false}}, candidateOrder: {n0: candidate}}},
  restoreBinding: {schemaVersion: 1, lineageId: 'FAKE-performance'}, restorePermit: marker('frozen', 2)};
const frozen = {schemaVersion: 1, performanceId: 'FAKE-performance', ownerHumanUid: 'FAKE-human', environment: 'source', mode: 'frozen', revision: 2,
  targetEnvironment: '', importId: '', deletionRevision: 1, deletionOperationId: boundary.operationId, deletionScope: 'reception-details',
  actualsHash: boundary.actualsHash, totalsHash: boundary.totalsHash, closingResultsHash: boundary.closingResultsHash, updatedAt: 0, humanUid: 'FAKE-human', managerDeviceUid: 'FAKE-device'};
const input = {source: {namespace: 'source', environment: 'source', performanceId: frozen.performanceId}, target: {namespace: 'target', environment: 'target', performanceId: frozen.performanceId},
  frozen, sourceData: data, targetData: business(data), operationId: 'FAKE-recovery'};
const plan = planRecovery(input); assert.equal(plan.businessHash, hash(business(data))); assert.equal(plan.retainedEvidence.amendments, 1);
assert.notEqual(hash(data.actuals), frozen.actualsHash); assert.equal(plan.steps.length, 6);
const live = {sourceAuthority: plan.locked, sourceData: {...data, restorePermit: marker('retired', plan.locked.revision)}, targetData: business(data), targetAuthority: null};
assert.deepEqual(resumeRecovery(JSON.parse(JSON.stringify(plan)), live), plan);
cases.push('amended-current-facts-preserved', 'current-hash-not-baseline-hash', 'serialized-plan-resumed');
for (const [label, change] of [
  ['fact-revision-gap', d => d.actuals[person].revision++],
  ['fact-arrival-tampering', d => d.actuals[person].arrived = true],
  ['total-tampering', d => d.actualTotals.part0.arrived = 1],
  ['closing-result-tampering', d => d.closingResults.close.peopleCount++],
  ['missing-decision', d => delete d.actualAmendments[id]],
  ['missing-window', d => delete d.actualAmendmentWindows[id]],
  ['uncommitted-window', d => d.actualAmendmentWindows[id].meta.phase = 'open'],
  ['candidate-count-mismatch', d => d.actualAmendmentWindows[id].progress.count++],
  ['chosen-candidate-mismatch', d => d.actualAmendments[id].chosenCandidateId = 'unknown'],
  ['missing-current-head', d => delete d.actualAmendmentHeads[person]],
  ['wrong-retention-operation', d => d.actualAmendments[id].retentionOperationId = 'old'],
  ['baseline-hash-tampering', d => d.retentionBoundary.actualsHash = 'old']
]) {
  const x = structuredClone(input); change(x.sourceData); x.targetData = business(x.sourceData);
  assert.throws(() => planRecovery(x)); cases.push(label);
}
for (const name of ['receipts', 'quarantine', ...detailRoots]) {
  const x = structuredClone(input); x.sourceData[name] = {old: true}; x.targetData = business(x.sourceData);
  assert.throws(() => planRecovery(x)); cases.push('deleted-root-' + name + '-rejected');
}
const old = structuredClone(input); old.targetData.actuals[person].revision = 1; assert.throws(() => planRecovery(old)); cases.push('stale-target-facts-rejected');
const tampered = structuredClone(plan); tampered.businessHash = 'old'; assert.throws(() => resumeRecovery(tampered, live)); cases.push('saved-current-hash-tampering-rejected');
assert.deepEqual(before, sourceHashes(root, files)); fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
fs.writeFileSync(new URL('artifacts/model-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before, cases, modelConditions: cases.length,
  currentFactsPreserved: true, originalClosingPreserved: true, baselineProjectionIsValidationOnly: true,
  externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({modelConditions: cases.length, currentFactsPreserved: true}));
