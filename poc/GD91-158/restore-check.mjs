import assert from 'node:assert/strict';
import {hash} from '../GD91-128/conversion.mjs';

// 検査モデル。呼出側が渡す台帳の真正性や、Rulesでの拒否を証明するものではない。
export function inspect(backup, current) {
  assert(current && current.status === 'available', 'current-ledger-unavailable');
  assert.equal(current.schemaVersion, 1, 'current-ledger-schema');
  assert(typeof current.performanceId === 'string' && current.performanceId.length, 'current-performance');
  assert.equal(backup.performanceId, current.performanceId, 'performance-mismatch');
  assert(Number.isSafeInteger(current.revision) && current.revision >= 0, 'ledger-revision');
  assert(Array.isArray(current.forbiddenExportIds), 'backup-denial-list-required');
  assert(!current.forbiddenExportIds.includes(backup.exportId), 'forbidden-backup-generation');
  assert(Number.isSafeInteger(backup.deletionRevision) && backup.deletionRevision >= 0, 'backup-deletion-revision-required');
  assert.equal(backup.deletionRevision, current.revision, 'backup-deletion-revision-mismatch');
  assert(Array.isArray(current.deletions), 'deletion-scopes-required');
  assert.equal(new Set(current.deletions.map(d => d.operationId)).size, current.deletions.length, 'duplicate-deletion-operation');
  assert(current.revision !== 0 || current.deletions.length === 0, 'zero-revision-with-deletions');
  assert(current.revision === 0 || current.deletions.length > 0, 'nonzero-revision-without-deletions');
  for (const deletion of current.deletions) {
    assert(typeof deletion.operationId === 'string' && deletion.operationId.length, 'deletion-operation-required');
    // 全件の受付詳細削除以外を、同じ検査で対応済みにしない。
    assert.equal(deletion.scope, 'reception-details', 'unsupported-deletion-scope');
    const boundary = backup.areas.retentionBoundary;
    assert(boundary?.serverDeletionComplete && boundary.operationId === deletion.operationId, 'deletion-boundary-missing-or-different');
    assert(Array.isArray(deletion.deletedRoots) && deletion.deletedRoots.length, 'deletion-root-list-required');
    for (const key of deletion.deletedRoots) assert(!Object.hasOwn(backup.areas, key), 'deleted-root-restored:' + key);
    // 最新実績の書換えではなく、削除時の基準と元締め結果の保持を検査する。
    for (const key of ['actualsHash', 'totalsHash', 'closingResultsHash']) assert.equal(boundary[key], deletion[key], 'deletion-baseline-mismatch:' + key);
    assert.equal(hash(backup.areas.closingResults), deletion.closingResultsHash, 'closing-results-changed');
  }
  return {performanceId: current.performanceId, deletionRevision: current.revision,
    ledgerHash: hash(current), backupHash: hash(backup), exportId: backup.exportId};
}

export function recheckBeforePublication(backup, current, checked) {
  const fresh = inspect(backup, current);
  assert.equal(fresh.ledgerHash, checked.ledgerHash, 'ledger-changed-after-inspection');
  assert.equal(fresh.backupHash, checked.backupHash, 'backup-changed-after-inspection');
  assert.equal(fresh.exportId, checked.exportId, 'export-changed-after-inspection');
  return fresh;
}
