import assert from 'node:assert/strict';
import {exportBundle as initial, business} from '../GD91-148/bundle.mjs';
import {excluded} from '../GD91-145/bundle.mjs';
import {noSecrets} from '../GD91-143/contract.mjs';
import {hash} from '../GD91-128/conversion.mjs';

const originFields = ['schemaVersion', 'sourceBusinessHash', 'sourceReferencesHash',
  'sourceControlHash', 'sourceDeviceRoster', 'referenceCount', 'disabledReferenceCount',
  'removedGenerationPinCount', 'importArchives', 'importArchiveHashes'];
const jobFields = ['manifest', 'meta', 'lease', 'leaseEvents', 'receipt'];
const keys = (value, expected, label) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);

// 来歴の階層を移行回数に比例して深くしない。認可に使わない過去の取込記録である。
export function flatten(value) {
  noSecrets(value);
  const result = {};
  function walk(node, path) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      assert(Object.keys(node).length, 'empty-archive-object');
      for (const [key, child] of Object.entries(node)) {
        assert(/^[^.#$\[\]\/\u0000-\u001f\u007f]+$/u.test(key), 'archive-key');
        walk(child, [...path, key]);
      }
    } else {
      assert(['string', 'number', 'boolean'].includes(typeof node), 'archive-primitive');
      if (typeof node === 'number') assert(Number.isFinite(node), 'archive-number');
      result[Buffer.from(JSON.stringify(path)).toString('hex')] = node;
    }
  }
  walk(value, []);
  return result;
}

export function unflatten(records) {
  const result = {};
  for (const [encoded, value] of Object.entries(records)) {
    assert(/^(?:[0-9a-f]{2})+$/.test(encoded), 'archive-path-encoding');
    const path = JSON.parse(Buffer.from(encoded, 'hex').toString());
    assert(Array.isArray(path) && path.length && path.every(k => typeof k === 'string'), 'archive-path');
    assert(path.every(k => !['__proto__', 'constructor', 'prototype'].includes(k)), 'archive-prototype');
    let parent = result;
    for (const key of path.slice(0, -1)) {
      assert(!Object.hasOwn(parent, key) || (parent[key] && typeof parent[key] === 'object'), 'archive-prefix-collision');
      parent = parent[key] ??= {};
    }
    assert(!Object.hasOwn(parent, path.at(-1)), 'archive-leaf-collision');
    parent[path.at(-1)] = value;
  }
  assert.equal(hash(flatten(result)), hash(records), 'archive-roundtrip');
  return result;
}

function completedJob(id, job) {
  keys(job, jobFields, 'unmapped-import-job');
  const {manifest: m, meta, lease, receipt} = job;
  keys(m, ['format', 'sourceHash', 'sourceEnvironment', 'performanceId', 'sourceState',
    'totalChunks', 'ownerDevice', 'ownerHuman'], 'unmapped-import-manifest');
  keys(meta, ['phase', 'uploaded', 'copied', 'cleaned', 'verifiedSourceHash'], 'unmapped-import-meta');
  keys(receipt, ['exportId', 'sourceHash', 'ownerDevice', 'ownerHuman', 'committedAt'], 'unmapped-import-receipt');
  assert.equal(m.format, 'gd91-native-rtdb-closed-v2');
  assert.equal(m.sourceState, 'closed');
  assert(/^[a-f0-9]{64}$/.test(m.sourceHash));
  assert(Number.isSafeInteger(m.totalChunks) && m.totalChunks > 0);
  assert.equal(meta.phase, 'cleaned', 'unfinished-import');
  for (const key of ['uploaded', 'copied', 'cleaned']) assert.equal(meta[key], m.totalChunks, 'incomplete-import-count');
  assert.equal(meta.verifiedSourceHash, m.sourceHash);
  assert.equal(receipt.exportId, id);
  assert.equal(receipt.sourceHash, m.sourceHash);
  assert.equal(receipt.ownerHuman, m.ownerHuman);
  assert.equal(receipt.ownerDevice, lease.ownerDevice);
  assert(Number.isFinite(receipt.committedAt));
  assert(Number.isSafeInteger(lease.revision) && lease.revision > 0);
  keys(job.leaseEvents, Array.from({length: lease.revision}, (_, i) => 'r' + (i + 1)), 'lease-history-gap');
  for (let i = 1; i <= lease.revision; i++) {
    const event = job.leaseEvents['r' + i];
    keys(event, ['revision', 'issuedAt', 'expiresAt', 'ownerDevice', 'ownerHuman'], 'unmapped-import-lease');
    assert.equal(event.revision, i);
    assert.equal(event.ownerHuman, m.ownerHuman);
    assert(typeof event.ownerDevice === 'string' && event.ownerDevice.length);
    assert(Number.isFinite(event.issuedAt) && Number.isFinite(event.expiresAt) && event.expiresAt > event.issuedAt);
  }
  assert.equal(hash(lease), hash(job.leaseEvents['r' + lease.revision]));
  noSecrets(job);
}

export function exportBundle(source) {
  for (const key of Object.keys(source)) assert([...business, ...excluded, 'imports', 'importHead', 'activeImport'].includes(key), 'unmapped-remigration-root:' + key);
  if (!source.migrationOrigins) {
    assert(!source.imports && !source.importHead && !source.activeImport, 'missing-migration-origin');
    return initial(source);
  }
  const origins = structuredClone(source.migrationOrigins);
  for (const key of Object.keys(origins)) assert(originFields.includes(key), 'unmapped-origin-field:' + key);
  assert.equal(origins.schemaVersion, 1);
  const archives = origins.importArchives ?? {}, archiveHashes = origins.importArchiveHashes ?? {};
  keys(archives, Object.keys(archiveHashes), 'archive-index-mismatch');
  for (const [id, records] of Object.entries(archives)) {
    const prior = unflatten(records);
    completedJob(id, prior);
    assert.equal(hash(prior), archiveHashes[id], 'archive-content-hash');
  }
  assert(source.imports && source.importHead === source.activeImport && source.imports[source.activeImport], 'current-import-required');
  // 一つの公開先に複数の未完了作業が混ざっていれば、推測で回収しない。
  keys(source.imports, [source.activeImport], 'unexpected-current-import');
  const id = source.activeImport, job = source.imports[id];
  completedJob(id, job);
  assert(!Object.hasOwn(archives, id), 'duplicate-import-lineage');
  archives[id] = flatten(job);
  archiveHashes[id] = hash(job);
  origins.importArchives = archives;
  origins.importArchiveHashes = archiveHashes;
  const stripped = Object.fromEntries(Object.entries(source).filter(([key]) => !['migrationOrigins', 'imports', 'importHead', 'activeImport'].includes(key)));
  // 現在の稼働端末台帳を、元の締めの登録端末台帳に読み替えない。
  stripped.deviceRoster = structuredClone(origins.sourceDeviceRoster);
  const result = initial(stripped);
  assert.equal(hash(result.areas.migrationOrigins.sourceDeviceRoster), hash(origins.sourceDeviceRoster));
  result.areas.migrationOrigins = origins;
  noSecrets(result.areas);
  result.hashes = Object.fromEntries(Object.entries(result.areas).map(([key, value]) => [key, hash(value)]));
  result.sourceHash = hash(result.areas);
  result.provenance = {...result.provenance, priorImportCount: Object.keys(archives).length,
    previousOriginsHash: hash(source.migrationOrigins), sourceRuntimeAuthorizationNotCopied: true};
  return result;
}
