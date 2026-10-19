import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// GD91-154の契約に従う単一候補の通常訂正。試験用管理権限では訂正本文を更新しない。
export async function amend(ok, who, arrived) {
  const person = 'FAKE-person', fact = await ok('actuals/' + person), id = randomUUID();
  const meta = {operationId: id, personId: person, partition: fact.partition, baseFactRevision: fact.revision, baseArrived: fact.arrived,
    baseCorrectionId: fact.lastCorrectionId, controlRevision: 4, humanUid: who.human.uid, managerDeviceUid: who.device.uid,
    createdAt: {'.sv': 'timestamp'}, phase: 'open', sealedCount: 0, sealedHumanUid: '', sealedDeviceUid: '', sealedAt: 0};
  const job = 'actualAmendmentWindows/' + id;
  await ok('', 'PATCH', {['actualAmendmentHeads/' + person]: id, [job + '/meta']: meta, [job + '/progress']: {count: 0, lastCandidateId: ''}});
  const candidateId = randomUUID(), candidate = {operationId: candidateId, personId: person, originalRevision: fact.revision, arrived,
    reason: '架空の紙原本から訂正候補を記録', humanUid: who.human.uid, managerDeviceUid: who.device.uid, createdAt: {'.sv': 'timestamp'}};
  await ok('', 'PATCH', {[job + '/candidates/' + candidateId]: candidate, [job + '/progress']: {count: 1, lastCandidateId: candidateId}, [job + '/candidateOrder/n0']: candidateId});
  const open = await ok(job + '/meta');
  await ok(job + '/meta', 'PUT', {...open, phase: 'sealed', sealedCount: 1, sealedHumanUid: who.human.uid, sealedDeviceUid: who.device.uid, sealedAt: {'.sv': 'timestamp'}});
  const sealed = await ok(job + '/meta'), total = await ok('actualTotals/' + fact.partition), boundary = await ok('retentionBoundary');
  const decision = {operationId: id, personId: person, partition: fact.partition, chosenCandidateId: candidateId, reviewedCount: 1,
    previousFactRevision: fact.revision, previousFactCorrectionId: fact.lastCorrectionId, previousArrived: fact.arrived,
    previousTotalRevision: total.revision, previousTotalCorrectionId: total.lastCorrectionId, previousTotalArrived: total.arrived,
    arrived, reason: '全候補と現在の実績を確認して確定', allCandidatesConfirmed: true, controlRevision: 4,
    retentionOperationId: boundary.operationId, humanUid: who.human.uid, managerDeviceUid: who.device.uid, decidedAt: {'.sv': 'timestamp'}};
  await ok('', 'PATCH', {['actualAmendments/' + id]: decision, ['actuals/' + person]: {...fact, arrived, revision: fact.revision + 1, lastCorrectionId: id},
    ['actualTotals/' + fact.partition]: {...total, arrived: total.arrived + (arrived ? 1 : 0) - (fact.arrived ? 1 : 0), revision: total.revision + 1, lastCorrectionId: id},
    [job + '/meta']: {...sealed, phase: 'committed'}});
  const after = await ok('actuals/' + person); assert.equal(after.arrived, arrived); assert.equal(after.revision, fact.revision + 1);
  return id;
}
