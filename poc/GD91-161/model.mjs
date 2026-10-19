import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateKeyPairSync, sign, verify} from 'node:crypto';
import {hash} from '../GD91-128/conversion.mjs';
import {marker} from '../GD91-159/protocol.mjs';
import {planRecovery, resumeRecovery, metadataSession, executeRecovery, wholeLossGate, business} from './recovery.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';

const root = new URL('./', import.meta.url), before = sourceHashes(root, ['model.mjs', 'recovery.mjs']);
const actuals = {person: {name: '架空', arrived: true}}, actualTotals = {part0: {total: 1, arrived: 1}}, closingResults = {close: {peopleCount: 1}};
const frozen = {schemaVersion: 1, performanceId: 'FAKE-performance', environment: 'source', ownerHumanUid: 'FAKE-human', mode: 'frozen', revision: 2,
  targetEnvironment: '', importId: '', deletionRevision: 1, deletionScope: 'reception-details', deletionOperationId: 'FAKE-deletion',
  actualsHash: hash(actuals), totalsHash: hash(actualTotals), closingResultsHash: hash(closingResults), updatedAt: 0, humanUid: 'FAKE-human', managerDeviceUid: 'FAKE-device'};
const data = {control: {state: 'closed'}, actuals, actualTotals, closingResults,
  retentionBoundary: {operationId: frozen.deletionOperationId, serverDeletionComplete: true, actualsHash: frozen.actualsHash, totalsHash: frozen.totalsHash, closingResultsHash: frozen.closingResultsHash},
  restoreBinding: {schemaVersion: 1, lineageId: frozen.performanceId}, restorePermit: marker('frozen', 2)};
const input = {source: {namespace: 'source', environment: 'source', performanceId: frozen.performanceId}, target: {namespace: 'target', environment: 'target', performanceId: frozen.performanceId},
  frozen, sourceData: data, targetData: business(data), operationId: 'FAKE-recovery'};
const plan = planRecovery(input), cases = [];
const live = {sourceAuthority: plan.locked, sourceData: {...data, restorePermit: marker('retired', plan.locked.revision)}, targetData: business(data), targetAuthority: null};
assert.deepEqual(resumeRecovery(JSON.parse(JSON.stringify(plan)), live), plan);
const changedDestination = planRecovery({...input, target: {...input.target, namespace: 'other-target'}});
assert.notDeepEqual(changedDestination.locked, plan.locked);
assert.throws(() => resumeRecovery(changedDestination, live), /live-source-authority-changed/);
const tampered = structuredClone(plan); tampered.steps[5].after.read = false;
assert.throws(() => resumeRecovery(tampered, live), /saved-plan-tampered/);
cases.push('serialized-plan-rebuilt-from-live-data', 'destination-database-substitution-rejected', 'saved-write-list-tampering-rejected');
const key = s => s.namespace + '/' + s.path;
function store() {
  const map = new Map(plan.steps.map(s => [key(s), {body: null, version: 0}]));
  for (const s of plan.steps.filter(s => s.namespace === 'source')) map.set(key(s), {body: structuredClone(s.before), version: 0});
  return map;
}
function transport(map, {lose = -1, beforeCommit = false, conflict = false} = {}) {
  let writes = 0;
  return {read: async s => {const v = map.get(key(s)); return {body: structuredClone(v.body), etag: String(v.version)};},
    put: async (s, etag) => {
      const v = map.get(key(s));
      if (conflict || String(v.version) !== etag) return {status: 412};
      const index = writes++;
      if (index === lose && beforeCommit) throw Error('injected-before-commit');
      map.set(key(s), {body: structuredClone(s.after), version: v.version + 1});
      if (index === lose) throw Error('injected-response-loss');
      return {status: 200};
    }};
}
for (const beforeCommit of [false, true]) for (let lose = 0; lose < plan.steps.length; lose++) {
  const map = store(), session = metadataSession({plan, transport: transport(map, {lose, beforeCommit}), expiresAt: Infinity});
  await assert.rejects(executeRecovery(plan, session, async () => {})); session.close();
  const resumed = metadataSession({plan, transport: transport(map), expiresAt: Infinity});
  await executeRecovery(plan, resumed, async () => {}); resumed.close();
  for (const s of new Map(plan.steps.map(step => [key(step), step])).values()) assert.deepEqual(map.get(key(s)).body, s.after);
  cases.push((beforeCommit ? 'before-' : 'after-') + lose + '-resumed');
}
for (const [label, mutate] of [
  ['missing-live-authority', x => x.frozen = null],
  ['not-frozen', x => x.frozen.mode = 'active'],
  ['wrong-performance', x => x.target.performanceId = 'other'],
  ['same-database', x => x.target.namespace = 'source'],
  ['path-in-environment', x => x.target.environment = '../other'],
  ['url-in-namespace', x => x.target.namespace = 'https://external.invalid'],
  ['path-in-performance', x => x.source.performanceId = 'FAKE/other'],
  ['old-business', x => x.targetData.receipts = {old: true}],
  ['wrong-deletion-id', x => x.sourceData.retentionBoundary.operationId = 'old'],
  ['forged-hash', x => x.frozen.actualsHash = 'wrong'],
  ['bound-target', x => x.targetData.restoreBinding = {}],
  ['post-deletion-correction-not-supported', x => {x.sourceData.actuals.person.arrived = false; x.targetData.actuals.person.arrived = false;}]
]) {const x = structuredClone(input); mutate(x); assert.throws(() => planRecovery(x)); cases.push(label);}
for (const label of ['outside-path', 'outside-namespace', 'changed-body', 'missing-etag', 'expired', 'closed', 'conflict', 'current-role-revoked']) {
  const s = metadataSession({plan, transport: transport(store(), {conflict: label === 'conflict'}), now: () => 10, expiresAt: label === 'expired' ? 9 : 11});
  const step = structuredClone(plan.steps[0]);
  if (label === 'outside-path') step.path += '/actuals';
  if (label === 'outside-namespace') step.namespace = 'other';
  if (label === 'changed-body') step.after.deletionRevision = 0;
  if (label === 'closed') s.close();
  if (label === 'conflict' || label === 'current-role-revoked') await assert.rejects(executeRecovery(plan, s, async () => {if (label === 'current-role-revoked') throw Error('revoked');}));
  else await assert.rejects(s.write(step, label === 'missing-etag' ? undefined : '0'));
  s.close(); cases.push(label);
}
// 同じ署名済みファイルを持つ「削除なし」と「その後削除し全DB喪失」を区別できない。
// ファイルの版・署名・時刻だけでは、未記録の後続削除がないことを証明できない。
const {privateKey, publicKey} = generateKeyPairSync('ed25519');
for (const revision of [0, 1]) {
  const bytes = Buffer.from(JSON.stringify({revision})), signature = sign(null, bytes, privateKey);
  assert(verify(null, bytes, publicKey, signature));
  const archive = {revision, signatureValid: true};
  assert.throws(() => wholeLossGate({liveAuthority: null, archive}), /latest-authority-unavailable/);
}
assert.throws(() => wholeLossGate({independentlyCurrentHead: {revision: 1}}), /provider-not-implemented/);
cases.push('signed-archive-alone-is-not-current-head', 'independent-head-provider-unimplemented');
assert.deepEqual(before, sourceHashes(root, ['model.mjs', 'recovery.mjs']));
fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
fs.writeFileSync(new URL('artifacts/model-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before, cases,
  results: {allPassed: true, lossPoints: 12, planningRejections: 12, executionRejections: 8, wholeLossFailClosed: true, archiveSignatureActuallyVerified: true},
  realCredentialLifecycleVerified: false, externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({modelCases: cases.length, allPassed: true}));
