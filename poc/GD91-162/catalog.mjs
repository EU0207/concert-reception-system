import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {hash} from '../GD91-128/conversion.mjs';
import {business} from '../GD91-161/recovery.mjs';
import {marker} from '../GD91-159/protocol.mjs';

// 隔離PoC。ここは独立保全端末の信頼境界であり、ブラウザーから公開しない。
// ハッシュ鎖は破損検出であって、台帳ファイル全体の巻戻しを防ぐ機構ではない。
const same = (a, b) => hash(a) === hash(b);
export function createCatalog(directory) {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  assert(fs.statSync(directory).isDirectory());
  const file = path.join(directory, 'catalog.ndjson');
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    const record = {sequence: 1, previous: '', kind: 'created', catalogId: randomUUID()};
    fs.writeFileSync(fd, JSON.stringify({...record, digest: hash(record)}) + '\n'); fs.fsyncSync(fd);
  } finally {fs.closeSync(fd);}
}

export function openCatalog(directory, {custody, beforeAppend = () => {}, afterAppend = () => {}} = {}) {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  assert(custody?.independentCurrentStore === true, 'current-custody-unconfirmed');
  const file = path.join(directory, 'catalog.ndjson'), lock = path.join(directory, 'catalog.lock');
  // 復旧では新規作成しない。台帳喪失時の版0再作成を防ぐ。
  assert(fs.statSync(file).isFile(), 'catalog-missing');
  const lockFd = fs.openSync(lock, 'wx', 0o600); let closed = false;
  function read() {
    assert(!closed, 'catalog-closed');
    const bytes = fs.readFileSync(file, 'utf8'); assert(bytes.endsWith('\n'), 'incomplete-catalog-tail');
    let previous = '', sequence = 0, catalogId;
    const states = new Map();
    for (const line of bytes.trimEnd().split('\n')) {
      const entry = JSON.parse(line), {digest, ...record} = entry;
      assert.equal(record.sequence, ++sequence, 'catalog-sequence-gap');
      assert.equal(record.previous, previous, 'catalog-chain-mismatch'); assert.equal(digest, hash(record), 'catalog-digest-mismatch');
      previous = digest;
      if (sequence === 1) {assert.equal(record.kind, 'created'); catalogId = record.catalogId;}
      else {
        assert.equal(record.catalogId, catalogId);
        const prior = states.get(record.lineage);
        if (record.kind === 'sealed') {
          assert(!prior || (prior.kind === 'activated' && record.authorityRevision > prior.authorityRevision && record.deletionRevision >= prior.deletionRevision), 'invalid-reseal');
        } else {
          assert(['activation-intent', 'activated'].includes(record.kind));
          assert(prior && same(record.certificate, prior.certificate), 'certificate-changed');
          assert.equal(prior.kind, record.kind === 'activation-intent' ? 'sealed' : 'activation-intent');
        }
        states.set(record.lineage, record);
      }
    }
    return {sequence, previous, catalogId, states};
  }
  function append(fields) {
    const current = read(), record = {...fields, sequence: current.sequence + 1, previous: current.previous, catalogId: current.catalogId};
    const entry = {...record, digest: hash(record)};
    beforeAppend(fields.kind);
    const fd = fs.openSync(file, 'a');
    try {fs.writeFileSync(fd, JSON.stringify(entry) + '\n'); fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    assert.equal(read().previous, entry.digest, 'catalog-readback-mismatch');
    afterAppend(fields.kind); return record;
  }
  try {read();} catch (error) {fs.closeSync(lockFd); fs.unlinkSync(lock); throw error;}
  function current(certificate) {
    const snapshot = read(); assert.equal(certificate.catalogId, snapshot.catalogId, 'wrong-catalog');
    const record = snapshot.states.get(certificate.lineage);
    assert(record && same(record.certificate, certificate), 'certificate-not-current'); return record;
  }
  return {
    async seal(plan, inspectSource) {
      const snapshot = read(), prior = snapshot.states.get(plan.source.performanceId);
      assert(!prior || prior.kind === 'activated', 'lineage-already-reserved');
      const proof = await inspectSource();
      assert(same(proof.authority, plan.locked), 'source-not-locked');
      assert(same(proof.data.restorePermit, marker('retired', plan.locked.revision)), 'source-still-readable');
      assert.equal(hash(business(proof.data)), plan.businessHash, 'source-body-changed');
      assert.equal(proof.targetAuthority, null, 'target-already-initialized');
      if (prior) {
        assert(plan.locked.revision > prior.authorityRevision, 'old-source-reseal');
        assert(plan.locked.deletionRevision >= prior.deletionRevision, 'deletion-revision-rollback');
      }
      const certificate = {catalogId: snapshot.catalogId, lineage: plan.source.performanceId, sealId: randomUUID(),
        businessHash: plan.businessHash, authorityHash: hash(plan.locked), deletionRevision: plan.locked.deletionRevision,
        deletionOperationId: plan.locked.deletionOperationId, target: plan.target};
      append({kind: 'sealed', lineage: certificate.lineage, certificate, authorityRevision: plan.locked.revision, deletionRevision: plan.locked.deletionRevision});
      return certificate;
    },
    eligible(certificate, {businessHash, target}) {
      const record = current(certificate); assert.equal(record.kind, 'sealed', 'restore-authorization-consumed');
      assert.equal(certificate.businessHash, businessHash, 'backup-body-mismatch'); assert(same(certificate.target, target), 'wrong-restore-target');
      return true;
    },
    async activate(certificate, {businessHash, target, authorize, publish}) {
      this.eligible(certificate, {businessHash, target});
      assert.equal(await authorize(), true, 'current-owner-not-authorized');
      const record = current(certificate); assert.equal(record.kind, 'sealed');
      // 全DB喪失後でも古い許可を再利用させないため、公開要求より先に永続化する。
      append({...record, kind: 'activation-intent'});
      await publish();
      append({...record, kind: 'activated'});
    },
    state: certificate => current(certificate).kind,
    close() {if (!closed) {fs.closeSync(lockFd); fs.unlinkSync(lock); closed = true;}}
  };
}
