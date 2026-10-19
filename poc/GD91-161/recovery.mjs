import assert from 'node:assert/strict';
import {hash} from '../GD91-128/conversion.mjs';
import {authorityPath, performancePath, marker} from '../GD91-159/protocol.mjs';

// 隔離PoC。実サービス用の資格発行・接続は実装しない。
export function business(data) {
  const copy = structuredClone(data);
  for (const key of ['roles', 'devices', 'sessions', 'restoreBinding', 'restorePermit']) delete copy[key];
  return copy;
}
const eq = (a, b) => hash(a) === hash(b);
export function planRecovery({source, target, frozen, sourceData, targetData, operationId}) {
  for (const endpoint of [source, target]) for (const field of ['namespace', 'environment', 'performanceId']) {
    assert(typeof endpoint[field] === 'string' && /^[A-Za-z0-9_-]+$/.test(endpoint[field]), 'invalid-endpoint-identifier');
  }
  assert(source.namespace !== target.namespace, 'distinct-databases-required');
  assert(/^[A-Za-z0-9-]+$/.test(operationId), 'invalid-operation');
  assert(frozen && frozen.mode === 'frozen', 'live-frozen-authority-required');
  assert.equal(frozen.performanceId, source.performanceId);
  assert.equal(source.performanceId, target.performanceId);
  assert.equal(frozen.environment, source.environment);
  assert.equal(frozen.targetEnvironment, ''); assert.equal(frozen.importId, '');
  assert(Number.isSafeInteger(frozen.revision) && frozen.revision >= 0);
  assert(Number.isSafeInteger(frozen.deletionRevision) && frozen.deletionRevision >= 0);
  assert(eq(sourceData.restorePermit, marker('frozen', frozen.revision)), 'source-not-frozen');
  assert(eq(sourceData.restoreBinding, {schemaVersion: 1, lineageId: source.performanceId}));
  assert.equal(sourceData.control.state, 'closed');
  assert.equal(targetData.restoreBinding ?? null, null, 'target-already-bound');
  assert.equal(targetData.restorePermit ?? null, null, 'target-already-permitted');
  assert(eq(business(sourceData), business(targetData)), 'business-copy-mismatch');
  const boundary = sourceData.retentionBoundary;
  if (frozen.deletionRevision > 0) {
    assert.equal(frozen.deletionScope, 'reception-details', 'unsupported-deletion-scope');
    assert(boundary?.serverDeletionComplete === true);
    assert.equal(boundary.operationId, frozen.deletionOperationId);
    for (const name of ['actuals', 'actualTotals', 'closingResults']) {
      const field = {actuals: 'actualsHash', actualTotals: 'totalsHash', closingResults: 'closingResultsHash'}[name];
      assert.equal(boundary[field], frozen[field]);
      // 削除後訂正を含む一般形への拡張前は、削除時点と一致する最小モデルだけを扱う。
      assert.equal(hash(sourceData[name]), frozen[field], 'unsupported-post-deletion-change');
    }
    for (const name of ['receipts', 'receiptIndex', 'receptionEvents']) assert.equal(sourceData[name] ?? null, null, 'deleted-body-present');
  }
  const sourcePath = performancePath(source.environment, source.performanceId);
  const targetPath = performancePath(target.environment, target.performanceId);
  const path = authorityPath(source.performanceId), revision = frozen.revision + 1;
  // 環境名が同じ別DBへの再開計画の差替えを、元DBの実値と照合して止める。
  const locked = {...frozen, mode: 'recovering', revision, targetEnvironment: target.environment, importId: operationId + '-' + hash({source, target})};
  const active = {...locked, mode: 'active', environment: target.environment, targetEnvironment: '', importId: ''};
  const binding = {schemaVersion: 1, lineageId: source.performanceId};
  const steps = [
    {namespace: source.namespace, path, before: frozen, after: locked},
    {namespace: source.namespace, path: sourcePath + '/restorePermit', before: sourceData.restorePermit, after: marker('retired', revision)},
    {namespace: target.namespace, path: targetPath + '/restorePermit', before: null, after: marker('retired', revision)},
    {namespace: target.namespace, path: targetPath + '/restoreBinding', before: null, after: binding},
    {namespace: target.namespace, path, before: null, after: active},
    {namespace: target.namespace, path: targetPath + '/restorePermit', before: marker('retired', revision), after: marker('active', revision)}
  ];
  return structuredClone({source, target, operationId, businessHash: hash(business(sourceData)), frozen, locked, active, steps});
}

export function resumeRecovery(saved, {sourceAuthority, sourceData, targetData, targetAuthority}) {
  // 保存した計画をそのまま実行器へ渡さず、現行本文から操作列を再生成する。
  const source = {...sourceData, restorePermit: marker('frozen', saved.frozen.revision)};
  const target = {...targetData}; delete target.restoreBinding; delete target.restorePermit;
  const rebuilt = planRecovery({...saved, sourceData: source, targetData: target});
  assert(eq(saved, rebuilt), 'saved-plan-tampered');
  assert(eq(sourceAuthority, rebuilt.frozen) || eq(sourceAuthority, rebuilt.locked), 'live-source-authority-changed');
  assert(eq(sourceData.restorePermit, marker('frozen', saved.frozen.revision)) || eq(sourceData.restorePermit, marker('retired', saved.locked.revision)), 'source-permit-conflict');
  assert(targetAuthority === null || eq(targetAuthority, rebuilt.active), 'target-authority-conflict');
  assert(targetData.restoreBinding === undefined || eq(targetData.restoreBinding, {schemaVersion: 1, lineageId: saved.source.performanceId}), 'target-binding-conflict');
  assert(targetData.restorePermit === undefined || ['retired', 'active'].some(phase => eq(targetData.restorePermit, marker(phase, saved.locked.revision))), 'target-permit-conflict');
  return rebuilt;
}

export function metadataSession({plan, transport, now = Date.now, expiresAt}) {
  // パス制限はこの実行器の制御。管理資格そのもののIAMパス制限ではない。
  const fixed = structuredClone(plan); let closed = false;
  function usable() {assert(!closed && now() < expiresAt, 'credential-unavailable');}
  return {
    read: async step => {usable(); assert(fixed.steps.some(s => s.namespace === step.namespace && s.path === step.path), 'outside-metadata-scope'); return transport.read(step);},
    write: async (step, etag) => {
      usable(); assert(fixed.steps.some(s => eq(s, step)), 'outside-metadata-plan');
      assert(typeof etag === 'string' && etag.length > 0, 'etag-required');
      return transport.put(step, etag);
    },
    close() {closed = true;}
  };
}

export async function executeRecovery(plan, session, inspect) {
  // inspectは各書込み前に現在認可・元台帳と本文を実DBから再取得する。
  // 再開情報だけを最新性の根拠にはしない。
  for (let i = 0; i < plan.steps.length; i++) {
    await inspect(plan, i);
    const step = plan.steps[i], current = await session.read(step);
    if (eq(current.body, step.after) || plan.steps.slice(i + 1).some(later => later.namespace === step.namespace && later.path === step.path && eq(current.body, later.after))) continue;
    assert(eq(current.body, step.before), 'metadata-conflict');
    const result = await session.write(step, current.etag);
    assert([200, 204].includes(result.status), 'conditional-metadata-write-rejected');
    const after = await session.read(step);
    assert(eq(after.body, step.after), 'metadata-readback-mismatch');
  }
  await inspect(plan, plan.steps.length);
}

export function wholeLossGate({liveAuthority, independentlyCurrentHead}) {
  assert(liveAuthority || independentlyCurrentHead, 'latest-authority-unavailable');
  // independentlyCurrentHeadを発行する実装は本PoCにはない。
  assert(liveAuthority, 'independent-head-provider-not-implemented');
}
