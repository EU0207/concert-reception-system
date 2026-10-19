import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash} from '../GD91-128/conversion.mjs';
import {marker} from '../GD91-159/protocol.mjs';
import {createCatalog, openCatalog} from './catalog.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';

const root = new URL('./', import.meta.url), before = sourceHashes(root, ['model.mjs', 'catalog.mjs']);
const cache = new URL('node_modules/.cache/', root); fs.mkdirSync(cache, {recursive: true});
const custody = {independentCurrentStore: true}, cases = [];
const source = {namespace: 'FAKE-source-db', environment: 'FAKE-source', performanceId: 'FAKE-performance'};
const target = {...source, namespace: 'FAKE-target-db', environment: 'FAKE-target'};
const data = {control: {state: 'closed'}, actuals: {person: {name: '架空の保持実績', arrived: true}}, restorePermit: marker('retired', 3)};
const plan = {source, target, locked: {mode: 'recovering', revision: 3, deletionRevision: 1, deletionOperationId: 'FAKE-cut', importId: 'FAKE-lock'},
  businessHash: hash({control: data.control, actuals: data.actuals})};
const proof = () => ({authority: plan.locked, data, targetAuthority: null});
function directory(label) {const url = new URL(label + '-' + randomUUID() + '/', cache); fs.mkdirSync(url); return url;}
async function fixture(label, options = {}) {
  const dir = directory(label); createCatalog(dir); const book = openCatalog(dir, {custody, ...options});
  const certificate = await book.seal(plan, proof); return {dir, book, certificate};
}
const params = {businessHash: plan.businessHash, target, authorize: async () => true};
{
  const {dir, book, certificate} = await fixture('normal');
  book.close(); const restarted = openCatalog(dir, {custody}); assert(restarted.eligible(certificate, params));
  let published = 0;
  await restarted.activate(certificate, {...params, publish: async () => {assert.equal(restarted.state(certificate), 'activation-intent'); published++;}});
  assert.equal(published, 1); assert.equal(restarted.state(certificate), 'activated');
  assert.throws(() => restarted.eligible(certificate, params), /consumed/);
  await assert.rejects(restarted.activate(certificate, {...params, publish: async () => published++})); assert.equal(published, 1);
  restarted.close(); const again = openCatalog(dir, {custody}); assert.throws(() => again.eligible(certificate, params), /consumed/); again.close();
  cases.push('reopen-and-authorize-sealed-copy-after-database-loss', 'intent-durable-before-publication', 'no-second-activation', 'old-certificate-rejected-after-restart');
}
for (const point of ['before-intent', 'after-intent', 'during-publication', 'before-activated-record', 'after-activated-record']) {
  let phase = 'setup', published = false;
  const options = {
    beforeAppend: kind => {if (phase === 'activate' && ((point === 'before-intent' && kind === 'activation-intent') || (point === 'before-activated-record' && kind === 'activated'))) throw Error('injected-stop');},
    afterAppend: kind => {if (phase === 'activate' && ((point === 'after-intent' && kind === 'activation-intent') || (point === 'after-activated-record' && kind === 'activated'))) throw Error('injected-stop');}
  };
  const {dir, book, certificate} = await fixture(point, options); phase = 'activate';
  await assert.rejects(book.activate(certificate, {...params, publish: async () => {if (point === 'during-publication') throw Error('injected-stop'); published = true;}}));
  book.close(); const restarted = openCatalog(dir, {custody});
  if (point === 'before-intent') {assert(restarted.eligible(certificate, params)); assert.equal(published, false);}
  else assert.throws(() => restarted.eligible(certificate, params), /consumed/);
  restarted.close(); cases.push(point + '-recovered-safely');
}
for (const [label, change] of [
  ['source-not-fenced', p => p.authority = {...p.authority, mode: 'frozen'}],
  ['source-readable', p => p.data.restorePermit = marker('frozen', 3)],
  ['source-body-changed', p => p.data.actuals.person.arrived = false],
  ['target-already-active', p => p.targetAuthority = {mode: 'active'}]
]) {
  const dir = directory(label); createCatalog(dir); const book = openCatalog(dir, {custody});
  await assert.rejects(book.seal(plan, () => {const p = structuredClone(proof()); change(p); return p;})); book.close(); cases.push(label);
}
for (const label of ['wrong-target', 'wrong-body', 'old-or-forged-certificate', 'revoked-current-owner', 'concurrent-issuer', 'unconfirmed-custody']) {
  const {dir, book, certificate} = await fixture(label);
  if (label === 'wrong-target') assert.throws(() => book.eligible(certificate, {...params, target: {...target, namespace: 'FAKE-other'}}));
  if (label === 'wrong-body') assert.throws(() => book.eligible(certificate, {...params, businessHash: 'old'}));
  if (label === 'old-or-forged-certificate') assert.throws(() => book.eligible({...certificate, deletionRevision: 0}, params));
  if (label === 'revoked-current-owner') await assert.rejects(book.activate(certificate, {...params, authorize: async () => false, publish: async () => assert.fail('must-not-publish')}));
  if (label === 'concurrent-issuer') assert.throws(() => openCatalog(dir, {custody}), /EEXIST/);
  if (label === 'unconfirmed-custody') assert.throws(() => openCatalog(dir, {custody: {independentCurrentStore: false}}));
  book.close(); cases.push(label);
}
for (const label of ['missing-file', 'incomplete-tail', 'changed-record', 'record-gap']) {
  const {dir, book} = await fixture(label); book.close(); const file = new URL('catalog.ndjson', dir);
  if (label === 'missing-file') {const missing = directory('no-catalog'); assert.throws(() => openCatalog(missing, {custody}), /ENOENT/);}
  else {
    const text = fs.readFileSync(file, 'utf8');
    if (label === 'incomplete-tail') fs.writeFileSync(file, text.slice(0, -5));
    if (label === 'changed-record') fs.writeFileSync(file, text.replace('FAKE-cut', 'FAKE-old'));
    if (label === 'record-gap') fs.writeFileSync(file, text.split('\n').filter((_, n) => n !== 0).join('\n'));
    assert.throws(() => openCatalog(dir, {custody}));
  }
  cases.push(label + '-fails-closed');
}
// 過去の完全な台帳まで巻き戻す攻撃は、ハッシュ鎖だけでは検出できない。
// 独立した保全先の最新性を信頼できない場合は、openCatalog前の管轄確認で止める。
{
  const {dir, book, certificate} = await fixture('rollback-limit'), old = fs.readFileSync(new URL('catalog.ndjson', dir));
  await book.activate(certificate, {...params, publish: async () => {}}); book.close();
  fs.writeFileSync(new URL('catalog.ndjson', dir), old);
  const rolledBack = openCatalog(dir, {custody}); assert(rolledBack.eligible(certificate, params)); rolledBack.close();
  assert.throws(() => openCatalog(dir, {custody: {independentCurrentStore: false}}));
  cases.push('whole-catalog-rollback-is-a-custody-limit-not-a-pass');
}
assert.deepEqual(before, sourceHashes(root, ['model.mjs', 'catalog.mjs']));
fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
fs.writeFileSync(new URL('artifacts/model-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before, cases,
  modelConditions: cases.length, recoveryFromSealedCheckpointOnly: true,
  catalogWritesFsyncedBeforePublication: true, independentCurrentCatalogAssumed: true,
  wholeCatalogRollbackDetected: false, routineBackupRecoveryVerified: false,
  realCredentialLifecycleVerified: false, externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({modelConditions: cases.length, wholeCatalogRollbackIsLimitation: true}));
