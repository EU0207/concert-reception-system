import assert from 'node:assert/strict';
import {hash} from '../GD91-128/conversion.mjs';
import {reconstruct} from '../GD91-154/reconstruct.mjs';
import {detailRoots} from '../GD91-154/rules.mjs';
import {planRecovery as baselinePlan, business} from '../GD91-161/recovery.mjs';
import {marker} from '../GD91-159/protocol.mjs';

export function retainedProof(data, authority) {
  assert.equal(authority.deletionRevision, 1, 'unsupported-deletion-revision');
  assert.equal(authority.deletionScope, 'reception-details');
  assert.equal(data.retentionBoundary?.operationId, authority.deletionOperationId);
  for (const field of ['actualsHash', 'totalsHash', 'closingResultsHash']) assert.equal(data.retentionBoundary[field], authority[field]);
  for (const name of ['receipts', 'quarantine', ...detailRoots]) assert.equal(data[name] ?? null, null, 'deleted-history-present:' + name);
  const decisions = data.actualAmendments ?? {}, windows = data.actualAmendmentWindows ?? {};
  assert.deepEqual(Object.keys(decisions).sort(), Object.keys(windows).sort(), 'unfinished-or-orphan-amendment-window');
  const result = reconstruct(data), baseline = structuredClone(data);
  const sorted = Object.entries(decisions).sort(([, a], [, b]) => a.partition.localeCompare(b.partition) || b.previousTotalRevision - a.previousTotalRevision);
  const latest = {};
  for (const [id, event] of sorted) {
    assert.equal(event.allCandidatesConfirmed, true);
    const fact = baseline.actuals[event.personId], total = baseline.actualTotals[event.partition];
    if (!latest[event.personId]) latest[event.personId] = id;
    fact.arrived = event.previousArrived; fact.revision = event.previousFactRevision; fact.lastCorrectionId = event.previousFactCorrectionId;
    total.arrived = event.previousTotalArrived; total.revision = event.previousTotalRevision; total.lastCorrectionId = event.previousTotalCorrectionId;
  }
  assert.deepEqual(data.actualAmendmentHeads ?? {}, latest, 'amendment-head-mismatch');
  assert.equal(hash(baseline.actuals), authority.actualsHash); assert.equal(hash(baseline.actualTotals), authority.totalsHash);
  assert.equal(hash(data.closingResults), authority.closingResultsHash);
  return {result, baseline};
}

export function planRecovery(input) {
  assert.equal(hash(business(input.sourceData)), hash(business(input.targetData)), 'current-business-copy-mismatch');
  const {result, baseline} = retainedProof(input.sourceData, input.frozen);
  // 161の削除時点の検査を通すための検証専用射影。DBへ保存する値ではない。
  // 現在実績と全訂正履歴の一致は上で別に照合し、計画の本文ハッシュも現在値に戻す。
  const sourceProjection = {...input.sourceData, actuals: baseline.actuals, actualTotals: baseline.actualTotals};
  const targetProjection = {...input.targetData, actuals: baseline.actuals, actualTotals: baseline.actualTotals};
  return {...baselinePlan({...input, sourceData: sourceProjection, targetData: targetProjection}),
    businessHash: hash(business(input.sourceData)), retainedEvidence: result};
}

export function resumeRecovery(saved, {sourceAuthority, sourceData, targetData, targetAuthority}) {
  const source = {...sourceData, restorePermit: marker('frozen', saved.frozen.revision)};
  const target = {...targetData}; delete target.restoreBinding; delete target.restorePermit;
  const rebuilt = planRecovery({...saved, sourceData: source, targetData: target});
  assert.equal(hash(saved), hash(rebuilt), 'saved-plan-tampered');
  assert([hash(rebuilt.frozen), hash(rebuilt.locked)].includes(hash(sourceAuthority)), 'live-authority-changed');
  assert([hash(marker('frozen', saved.frozen.revision)), hash(marker('retired', saved.locked.revision))].includes(hash(sourceData.restorePermit)));
  assert(targetAuthority === null || hash(targetAuthority) === hash(saved.active));
  assert(targetData.restoreBinding === undefined || hash(targetData.restoreBinding) === hash({schemaVersion: 1, lineageId: saved.source.performanceId}));
  assert(targetData.restorePermit === undefined || ['retired', 'active'].some(phase => hash(targetData.restorePermit) === hash(marker(phase, saved.locked.revision))));
  return rebuilt;
}
