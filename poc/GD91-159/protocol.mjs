import assert from 'node:assert/strict';
import {importer as existingImporter} from '../GD91-155/importer.mjs';

export const authorityPath = performanceId => 'restoreAuthorities/' + performanceId;
export const performancePath = (environment, performanceId) => 'environments/' + environment + '/performances/' + performanceId;
export const marker = (phase, revision) => ({phase, revision, read: ['active', 'frozen', 'staging'].includes(phase), write: ['active', 'staging'].includes(phase)});
export const revised = (current, changes, who) => ({...current, ...changes, revision: current.revision + 1,
  updatedAt: {'.sv': 'timestamp'}, humanUid: who.human.uid, managerDeviceUid: who.device.uid});
const accepted = result => {
  if (![200, 204].includes(result.status)) {const error = Error('normal-authority-request'); error.httpStatus = result.status; throw error;}
  return result.body;
};

export function beginBody(relativeBody, guard, who, targetEnvironment, performanceId) {
  const next = revised(guard, {mode: 'moving', targetEnvironment, importId: relativeBody.importHead}, who);
  const target = performancePath(targetEnvironment, performanceId);
  return {...Object.fromEntries(Object.entries(relativeBody).map(([path, value]) => [target + '/' + path, value])),
    [authorityPath(performanceId)]: next, [target + '/restorePermit']: marker('staging', next.revision)};
}

export async function freeze(io, who, guard) {
  const next = revised(guard, {mode: 'frozen'}, who), path = performancePath(guard.environment, io.performanceId);
  accepted(await io.atomic(who, {[authorityPath(io.performanceId)]: next, [path + '/restorePermit']: marker('frozen', next.revision)}));
  return io.guard(who);
}

export async function guardedImporter(io, bundle, who, {exportId, sourceEnvironment, authority}) {
  const wrapped = {...io, normal: async (actor, which, path = '', method = 'GET', body) => {
    if (which === 'target' && path === '' && method === 'PATCH' && body.importHead) {
      return io.atomic(actor, beginBody(body, authority, actor, io.targetEnvironment, io.performanceId));
    }
    if (which === 'target' && path === '' && method === 'PATCH' && body.activeImport) {
      const guard = await io.guard(actor), next = revised(guard, {mode: 'active', environment: io.targetEnvironment,
        targetEnvironment: '', importId: ''}, actor);
      const target = performancePath(io.targetEnvironment, io.performanceId), source = performancePath(guard.environment, io.performanceId);
      return io.atomic(actor, {...Object.fromEntries(Object.entries(body).map(([key, value]) => [target + '/' + key, value])),
        [authorityPath(io.performanceId)]: next, [target + '/restorePermit']: marker('active', next.revision),
        [source + '/restorePermit']: marker('retired', next.revision)});
    }
    return io.normal(actor, which, path, method, body);
  }};
  const client = await existingImporter(wrapped, bundle, who, {exportId, sourceEnvironment});
  client.p.manifest.authorityRevision = authority.revision + 1;
  // 元データにない削除版を現行台帳から補って、古いバックアップを新しく見せない。
  client.p.manifest.deletionRevision = bundle.provenance?.deletionRevision ?? 0;
  client.p.manifest.deletionOperationId = bundle.provenance?.deletionOperationId ?? '';
  return client;
}

export async function commitBoundary(io, who, receipt) {
  const current = await io.guard(who), next = revised(current, {deletionRevision: current.deletionRevision + 1,
    deletionOperationId: receipt.operationId, deletionScope: 'reception-details',
    ...Object.fromEntries(['actualsHash', 'totalsHash', 'closingResultsHash'].map(key => [key, receipt[key]]))}, who);
  assert.equal(current.environment, io.targetEnvironment);
  const target = performancePath(io.targetEnvironment, io.performanceId);
  return io.atomic(who, {[target + '/retentionBoundary']: receipt, [authorityPath(io.performanceId)]: next,
    [target + '/restorePermit']: marker('active', next.revision)});
}
