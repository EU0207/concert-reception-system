import {generated as previous} from '../GD91-155/rules.mjs';
import {base, manager, recentManager} from '../GD91-84/auth-rules.mjs';
import {compact} from '../GD91-153/rules.mjs';
import {renameVariables} from './variables.mjs';
import {compactPaths} from './paths.mjs';

export const namespace = 'demo-concert-seat-gd91-84-restore-authority';
const authorityChild = path => `root.child('restoreAuthorities/'+$run+'/${path}')`;
const val = (node, path) => node === A ? `${authorityChild(path)}.val()` : `${node}.child('${path}').val()`;
const run = env => `root.child('environments').child(${env}).child('performances').child($run)`;
const R = "root.child('environments/'+$env+'/performances/'+$run)";
const A = "root.child('restoreAuthorities/'+$run)";
const S = run(val(A, 'environment')), T = run(val(A, 'targetEnvironment'));
const globalOwnerRole = `root.child('environments/'+${val(A, 'environment')}+'/performances/'+$run+'/roles/'+${val(A, 'ownerHumanUid')})`;
const ownerRoleValid = role => `${val(role, 'active')} === true && ${val(role, 'role')} === 'owner' && ${role}.child('revision').isNumber() && ${val(role, 'revision')} > 0 && ${val(role, 'revision')} % 1 === 0 && ${role}.child('receptionBaselineRevision').isNumber() && ${val(role, 'receptionBaselineRevision')} >= 0 && ${val(role, 'receptionBaselineRevision')} < ${val(role, 'revision')} && ${val(role, 'startsAt')} <= now && now < ${val(role, 'endsAt')}`;
const currentSourceOwner = `${authorityChild('environment')}.isString() && ${authorityChild('ownerHumanUid')}.isString() && ${ownerRoleValid(globalOwnerRole)}`;
const pendingOwnerValid = `(${val(A, 'mode')} !== 'moving' || ${val(A, 'targetEnvironment')} !== $env || (${currentSourceOwner}))`;
const auth = (node, recent = false) => (recent ? recentManager : manager).replaceAll(base, node);
const primary = node => `(${auth(node, true)} && ${val(node + ".child('roles').child(" + val(node + ".child('devices').child(auth.uid)", 'humanUid') + ')', 'role')} === 'owner')`;
const actor = node => val(node + ".child('devices').child(auth.uid)", 'humanUid');
const bound = node => `${val(node, 'restoreBinding/schemaVersion')} === 1 && ${val(node, 'restoreBinding/lineageId')} === $run`;
const fields = ['schemaVersion', 'performanceId', 'ownerHumanUid', 'environment', 'mode', 'revision',
  'targetEnvironment', 'importId', 'deletionRevision', 'deletionOperationId', 'deletionScope',
  'actualsHash', 'totalsHash', 'closingResultsHash', 'updatedAt', 'humanUid', 'managerDeviceUid'];
const cutFields = ['deletionRevision', 'deletionOperationId', 'deletionScope', 'actualsHash', 'totalsHash', 'closingResultsHash'];
const shape = names => ({...Object.fromEntries(names.map(name => [name, {'.validate': true}])), '$other': {'.validate': false}});
const changedStamp = ['revision', 'updatedAt', 'humanUid', 'managerDeviceUid'];
const same = except => fields.filter(k => !except.includes(k)).map(k => `${val('newData', k)} === ${val('data', k)}`).join(' && ');

export function generated() {
  const rules = previous(), r = rules.rules.environments.$env.performances.$run;
  const nr = 'newData.parent().parent()', NA = "newData.parent().parent().child('restoreAuthorities').child($run)";
  const source = run(val('data', 'environment'));
  const target = run(val('newData', 'targetEnvironment'));
  const pending = run(val('data', 'targetEnvironment'));
  const newRun = env => `${nr}.child('environments').child(${env}).child('performances').child($run)`;
  const ns = newRun(val('data', 'environment'));
  const nt = newRun(val('newData', 'targetEnvironment'));
  const np = newRun(val('data', 'targetEnvironment'));
  const owner = node => `${primary(node)} && ${actor(node)} === ${val('data', 'ownerHumanUid')}`;
  const stamp = node => `${val('newData', 'humanUid')} === ${actor(node)} && ${val('newData', 'managerDeviceUid')} === auth.uid`;
  const permit = (node, phase, read, write) => `${val(node, 'restorePermit/phase')} === '${phase}' && ${val(node, 'restorePermit/read')} === ${read} && ${val(node, 'restorePermit/write')} === ${write} && ${val(node, 'restorePermit/revision')} === ${val('newData', 'revision')}`;
  const sourceOwnerRole = `root.child('environments/'+${val('data', 'environment')}+'/performances/'+$run+'/roles/'+${val('data', 'ownerHumanUid')})`;
  const sourceOwnerCurrent = `data.child('environment').isString() && data.child('ownerHumanUid').isString() && ${ownerRoleValid(sourceOwnerRole)}`;
  const frozen = `${val('data', 'mode')} === 'active' && ${val('newData', 'mode')} === 'frozen' && ${owner(source)} && ${stamp(source)} && ${same([...changedStamp, 'mode'])} && ${val(source, 'control/state')} === 'closed' && ${permit(ns, 'frozen', true, false)}`;
  const thawed = `${val('data', 'mode')} === 'frozen' && ${val('newData', 'mode')} === 'active' && ${owner(source)} && ${stamp(source)} && ${same([...changedStamp, 'mode'])} && ${permit(ns, 'active', true, true)}`;
  const newJob = `${nt}.child('imports').child(${val('newData', 'importId')})`;
  const newManifest = `${newJob}.child('manifest')`;
  const begin = `${val('data', 'mode')} === 'frozen' && ${val('newData', 'mode')} === 'moving' && ${owner(target)} && ${stamp(target)} && ${sourceOwnerCurrent} && ${bound(target)} && ${val('newData', 'targetEnvironment')} !== ${val('data', 'environment')} && ${val('newData', 'targetEnvironment')} !== '' && ${val('newData', 'importId')} !== '' && ${same([...changedStamp, 'mode', 'targetEnvironment', 'importId'])} && !${target}.child('importHead').exists() && ${val(nt, 'importHead')} === ${val('newData', 'importId')} && ${val(newJob, 'meta/phase')} === 'uploading' && ${val(newManifest, 'authorityRevision')} === ${val('newData', 'revision')} && ${val(newManifest, 'deletionRevision')} === ${val('data', 'deletionRevision')} && ${val(newManifest, 'deletionOperationId')} === ${val('data', 'deletionOperationId')} && ${val(newManifest, 'sourceEnvironment')} === ${val('data', 'environment')} && ${val(newManifest, 'performanceId')} === $run && ${permit(nt, 'staging', true, true)}`;
  const oldJob = `${pending}.child('imports').child(${val('data', 'importId')})`;
  const afterJob = `${np}.child('imports').child(${val('data', 'importId')})`;
  const importedBoundary = `${np}.child('retentionBoundary')`;
  const deletionMatched = `(${val('data', 'deletionRevision')} === 0 || (${val(importedBoundary, 'serverDeletionComplete')} === true && ${val(importedBoundary, 'operationId')} === ${val('data', 'deletionOperationId')} && ${['actualsHash', 'totalsHash', 'closingResultsHash'].map(k => val(importedBoundary, k) + ' === ' + val('data', k)).join(' && ')}))`;
  const published = `${val('data', 'mode')} === 'moving' && ${val('newData', 'mode')} === 'active' && ${owner(pending)} && ${sourceOwnerCurrent} && ${stamp(pending)} && ${same([...changedStamp, 'mode', 'environment', 'targetEnvironment', 'importId'])} && ${val('newData', 'environment')} === ${val('data', 'targetEnvironment')} && ${val('newData', 'targetEnvironment')} === '' && ${val('newData', 'importId')} === '' && ${val(oldJob, 'meta/phase')} === 'ready' && ${val(afterJob, 'meta/phase')} === 'published' && ${val(np, 'activeImport')} === ${val('data', 'importId')} && ${permit(np, 'active', true, true)} && ${permit(ns, 'retired', false, false)} && ${deletionMatched}`;
  const boundary = `${ns}.child('retentionBoundary')`;
  const cut = `${val('data', 'mode')} === 'active' && ${val('newData', 'mode')} === 'active' && ${auth(source, true)} && ${stamp(source)} && ${same([...changedStamp, ...cutFields])} && ${val('data', 'deletionRevision')} === 0 && ${val('newData', 'deletionRevision')} === 1 && !${source}.child('retentionBoundary').exists() && ${val(boundary, 'serverDeletionComplete')} === true && ${val('newData', 'deletionOperationId')} === ${val(boundary, 'operationId')} && ${val('newData', 'deletionScope')} === 'reception-details' && ${['actualsHash', 'totalsHash', 'closingResultsHash'].map(k => val('newData', k) + ' === ' + val(boundary, k)).join(' && ')} && ${permit(ns, 'active', true, true)}`;
  rules.rules.restoreAuthorities = {$run: {
    '.read': compact(`(${auth(S)} || (${val(A, 'mode')} === 'moving' && ${auth(T)}))`),
    '.write': compact(`data.exists() && newData.exists() && (${frozen} || ${thawed} || ${begin} || ${published} || ${cut})`),
    '.validate': compact(`newData.hasChildren(${JSON.stringify(fields)}) && ${val('newData', 'schemaVersion')} === 1 && ${val('newData', 'performanceId')} === $run && newData.child('environment').isString() && newData.child('ownerHumanUid').isString() && newData.child('targetEnvironment').isString() && newData.child('importId').isString() && ${val('newData', 'revision')} === ${val('data', 'revision')} + 1 && ${val('newData', 'updatedAt')} === now`),
    ...shape(fields)
  }};

  // 既存の認証更新は凍結中も維持する。業務書込みだけに保護された許可の新状態を検査する。
  const skip = new Set(['roles', 'devices', 'sessions']);
  let readCount = 0, writeCount = 0;
  function protect(node, depth) {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') protect(value, depth + 1);
      else if (key === '.read' && value !== false && value !== 'false') {
        node[key] = compact(`(${A}.exists() && ${bound(R)} && ${val(R, 'restorePermit/read')} === true && ${pendingOwnerValid}) && (${value})`); readCount++;
      } else if (key === '.write' && value !== false && value !== 'false') {
        const future = 'newData' + '.parent()'.repeat(depth);
        node[key] = compact(`(${val(future, 'restorePermit/write')} === true) && (${value})`); writeCount++;
      }
    }
  }
  for (const [name, node] of Object.entries(r)) if (node && typeof node === 'object' && !skip.has(name)) protect(node, 1);
  const newRoot = 'newData.parent().parent().parent().parent()';
  const publicationAuthority = `${newRoot}.child('restoreAuthorities').child($run)`;
  const publicationCoupled = `(${val('newData', 'activeImport')} === ${val('data', 'activeImport')} || (${val(publicationAuthority, 'mode')} === 'active' && ${val(publicationAuthority, 'environment')} === $env && ${val('newData', 'restorePermit/phase')} === 'active' && ${val('newData', 'restorePermit/revision')} === ${val(publicationAuthority, 'revision')}))`;
  r['.validate'] = compact(`(${bound('newData')} && ${A}.exists() && ${pendingOwnerValid} && ${publicationCoupled}) && (${r['.validate'] ?? true})`);
  r.restoreBinding = {'.read': auth(R), '.write': false,
    '.validate': compact(`newData.hasChildren(['schemaVersion','lineageId']) && ${val('newData', 'schemaVersion')} === 1 && ${val('newData', 'lineageId')} === $run`), ...shape(['schemaVersion', 'lineageId'])};
  const futureRoot = 'newData.parent().parent().parent().parent().parent()';
  const futureA = `${futureRoot}.child('restoreAuthorities').child($run)`;
  const held = `${val(futureA, 'environment')} === $env`;
  const staging = `${val(futureA, 'mode')} === 'moving' && ${val(futureA, 'targetEnvironment')} === $env`;
  const markerShape = (phase, read, write) => `${val('newData', 'phase')} === '${phase}' && ${val('newData', 'read')} === ${read} && ${val('newData', 'write')} === ${write}`;
  r.restorePermit = {
    '.read': auth(R),
    '.write': compact(`newData.exists() && (${auth(R, true)} || ${auth(S, true)} || (${val(A, 'mode')} === 'moving' && ${auth(T, true)}))`),
    '.validate': compact(`newData.hasChildren(['phase','read','write','revision']) && ${bound('newData.parent()')} && ${val('newData', 'revision')} === ${val(futureA, 'revision')} && ((${held} && ${val(futureA, 'mode')} === 'active' && ${markerShape('active', true, true)}) || (${held} && (${val(futureA, 'mode')} === 'frozen' || ${val(futureA, 'mode')} === 'moving') && ${markerShape('frozen', true, false)}) || (${staging} && ${markerShape('staging', true, true)}) || (!(${held}) && !(${staging}) && ${markerShape('retired', false, false)}))`),
    ...shape(['phase', 'read', 'write', 'revision'])
  };
  const manifest = r.imports.$job.manifest;
  for (const key of ['authorityRevision', 'deletionRevision', 'deletionOperationId']) manifest[key] = {'.validate': true};
  const expected = `${A}.child('revision').val() + 1`;
  manifest['.validate'] = compact(`(${manifest['.validate']}) && ${val('newData', 'authorityRevision')} === ${expected} && ${val('newData', 'deletionRevision')} === ${val(A, 'deletionRevision')} && ${val('newData', 'deletionOperationId')} === ${val(A, 'deletionOperationId')}`);
  const entry = r.imports.$job.chunks.$chunk.entries.$entry;
  entry['.validate'] = compact(`(${entry['.validate']}) && (${val(A, 'deletionRevision')} === 0 || !${val('newData', 'path')}.matches(/^(receipts|quarantine|receiptClocks|receiptSources|receiptEventIds|quarantineReviewState|quarantineReviews|reviewOperations|managedReceipts|referenceClosures|reviewReleases|postClosePermits|postClosePermitHeads|lossDeclarations|postCloseCorrections|closingRuns)\\/.*$/))`);
  // 削除確定と正本台帳更新を切り離さない。
  const futureFromBoundary = 'newData.parent().parent().parent().parent().parent()';
  const cutA = `${futureFromBoundary}.child('restoreAuthorities').child($run)`;
  r.retentionBoundary['.validate'] = compact(`(${r.retentionBoundary['.validate']}) && ${val(cutA, 'environment')} === $env && ${val(cutA, 'deletionRevision')} === ${val(A, 'deletionRevision')} + 1 && ${val(cutA, 'deletionOperationId')} === ${val('newData', 'operationId')}`);
  const paths = compactPaths(rules), renamed = renameVariables(paths.rules);
  Object.defineProperty(renamed.rules, '__protectionCounts', {value: {readCount, writeCount, ...paths.stats, ...renamed.stats}, enumerable: false});
  return renamed.rules;
}
