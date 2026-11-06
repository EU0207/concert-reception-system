// 現主担当の開始と後任のGoogle受諾を分け、常に主担当UIDと2人の役割を一体変更する。
const f = (node, key) => `${node}.child('${key}').val()`;
const fields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'actorUid',
  'actorDeviceUid',
  'targetUid',
  'actorExpectedRevision',
  'targetExpectedRevision',
  'previousOwnerDisposition',
  'successorDeviceUid',
  'requestedAt',
];
const acceptanceFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'targetUid',
  'targetExpectedRevision',
  'provider',
  'authenticatedAt',
  'accepted',
];
const resultFields = [
  ...fields.filter((key) => key !== 'requestedAt'),
  'actorResultingRevision',
  'targetResultingRevision',
  'committedAt',
];
const same = (a, b, keys) => keys.map((key) => `${f(a, key)} === ${f(b, key)}`).join(' && ');
const scope = (node) =>
  `${f(node, 'environmentId')} === $environmentId && ${f(node, 'performanceId')} === $performanceId`;
function record(keys, read, write) {
  return {
    '.read': read,
    '.write': `newData.exists() && newData.hasChildren(${JSON.stringify(keys)}) && (${write})`,
    ...Object.fromEntries(keys.map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };
}

export function ownerHandoverRules({ root, preparedAuthorization, manager }) {
  const ownDevice = `${root}.child('devices').child(auth.uid)`;
  const ownRole = `${root}.child('roles').child(${f(ownDevice, 'humanUid')})`;
  const ownSession = `${root}.child('sessions').child(auth.uid)`;
  const currentOwner = `${preparedAuthorization()} && ${f(ownRole, 'role')} === 'owner'
    && ${f(`${root}.child('control')`, 'ownerUid')} === ${f(ownRole, 'humanUid')}
    && ${f(ownSession, 'humanAuthTime')} <= now && now - ${f(ownSession, 'humanAuthTime')} <= 900000`;
  function requestValid(request, id) {
    const target = `${root}.child('roles').child(${f(request, 'targetUid')})`;
    return `${currentOwner} && ${scope(request)} && ${f(request, 'schemaVersion')} === 1
      && ${f(request, 'operationId')} === ${id} && ${f(request, 'actorUid')} === ${f(ownRole, 'humanUid')}
      && ${f(request, 'actorDeviceUid')} === auth.uid && ${f(request, 'targetUid')} !== ${f(request, 'actorUid')}
      && ${f(request, 'actorExpectedRevision')} === ${f(ownRole, 'revision')}
      && ${scope(target)} && ${f(target, 'humanUid')} === ${f(request, 'targetUid')} && ${f(target, 'role')} === 'deputy'
      && ${f(target, 'active')} === true && ${f(target, 'startsAt')} <= now && now < ${f(target, 'endsAt')}
      && ${f(request, 'targetExpectedRevision')} === ${f(target, 'revision')}
      && (${f(request, 'previousOwnerDisposition')} === 'deputy' || ${f(request, 'previousOwnerDisposition')} === 'inactive')`;
  }
  function commit(post, id) {
    const request = `${root}.child('ownerHandoverRequests').child(${id})`;
    const acceptance = `${root}.child('ownerHandoverAcceptances').child(${id})`;
    const result = `${post}.child('ownerHandoverResults').child(${id})`;
    const audit = `${post}.child('ownerHandoverAudit').child(${id})`;
    const oldOwner = `${root}.child('roles').child(${f(request, 'actorUid')})`;
    const oldTarget = `${root}.child('roles').child(${f(request, 'targetUid')})`;
    const afterOwner = `${post}.child('roles').child(${f(request, 'actorUid')})`;
    const afterTarget = `${post}.child('roles').child(${f(request, 'targetUid')})`;
    const deviceUid = f(result, 'successorDeviceUid');
    const successorDevice = `${post}.child('devices').child(${deviceUid})`;
    return `(${requestValid(request, id)} && !${root}.child('ownerHandoverResults').child(${id}).exists()
      && !${root}.child('ownerHandoverAudit').child(${id}).exists()
      && ${acceptance}.exists() && ${same(acceptance, request, ['environmentId', 'performanceId', 'operationId', 'targetUid', 'targetExpectedRevision'])}
      && ${f(acceptance, 'schemaVersion')} === 1 && ${f(acceptance, 'provider')} === 'google.com' && ${f(acceptance, 'accepted')} === true
      && ${f(acceptance, 'authenticatedAt')} <= now && now - ${f(acceptance, 'authenticatedAt')} <= 900000
      && ${result}.hasChildren(${JSON.stringify(resultFields)})
      && ${same(
        result,
        request,
        fields.filter((key) => key !== 'requestedAt'),
      )}
      && ${f(result, 'committedAt')} === now && ${f(result, 'actorResultingRevision')} === ${f(oldOwner, 'revision')} + 1
      && ${f(result, 'targetResultingRevision')} === ${f(oldTarget, 'revision')} + 1
      && ${same(afterOwner, oldOwner, ['environmentId', 'performanceId', 'humanUid', 'startsAt', 'endsAt'])}
      && ${same(afterTarget, oldTarget, ['environmentId', 'performanceId', 'humanUid', 'startsAt', 'endsAt'])}
      && ${f(afterOwner, 'revision')} === ${f(result, 'actorResultingRevision')}
      && ${f(afterTarget, 'revision')} === ${f(result, 'targetResultingRevision')}
      && ${f(afterOwner, 'lastOperationId')} === ${id} && ${f(afterTarget, 'lastOperationId')} === ${id}
      && (${f(request, 'previousOwnerDisposition')} === 'deputy'
        ? (${f(afterOwner, 'role')} === 'deputy' && ${f(afterOwner, 'active')} === true)
        : (${f(afterOwner, 'role')} === 'owner' && ${f(afterOwner, 'active')} === false))
      && ${f(afterTarget, 'role')} === 'owner' && ${f(afterTarget, 'active')} === true
      && ${f(`${post}.child('control')`, 'ownerUid')} === ${f(request, 'targetUid')}
      && ${f(`${post}.child('control')`, 'ownerHandoverOperationId')} === ${id}
      && ${scope(successorDevice)} && ${f(successorDevice, 'deviceUid')} === ${deviceUid}
      && ${f(successorDevice, 'humanUid')} === ${f(request, 'targetUid')}
      && ${f(successorDevice, 'active')} === true && ${f(successorDevice, 'approved')} === true && ${f(successorDevice, 'retired')} === false
      && ${f(successorDevice, 'preparedRole')} === 'deputy'
      && ${f(successorDevice, 'preparedRoleRevision')} === ${f(oldTarget, 'revision')}
      && ${audit}.exists() && ${same(audit, result, resultFields)})`;
  }
  const selectedRequest = `${root}.child('ownerHandoverRequests').child($operationId)`;
  const humanRead = `auth != null && auth.token.email_verified === true && auth.uid === data.child('targetUid').val()
    && auth.token.firebase.sign_in_provider === 'google.com'`;
  const keys = resultFields;
  const receiptRead = `${manager} || (auth != null && auth.token.firebase.sign_in_provider === 'anonymous'
    && ((auth.uid === data.child('actorDeviceUid').val() && ${f(ownDevice, 'humanUid')} === data.child('actorUid').val())
      || ${f(ownDevice, 'humanUid')} === data.child('targetUid').val()))`;
  return {
    roleWrite: `newData.child('humanUid').val() === $humanUid
      && ($humanUid === ${f(`${root}.child('ownerHandoverRequests').child(${f('newData', 'lastOperationId')})`, 'actorUid')}
        || $humanUid === ${f(`${root}.child('ownerHandoverRequests').child(${f('newData', 'lastOperationId')})`, 'targetUid')})
      && ${commit('newData.parent().parent()', f('newData', 'lastOperationId'))}`,
    ownerUidWrite: commit(
      'newData.parent().parent()',
      f('newData.parent()', 'ownerHandoverOperationId'),
    ),
    pointerWrite: commit('newData.parent().parent()', 'newData.val()'),
    ownerHandoverRequests: {
      $operationId: record(
        fields,
        `${manager} || (${humanRead})`,
        `!data.exists() && ${requestValid('newData', '$operationId')} && newData.child('requestedAt').val() === now
        && !${root}.child('ownerHandoverResults').child($operationId).exists()`,
      ),
    },
    ownerHandoverAcceptances: {
      $operationId: record(
        acceptanceFields,
        `${manager} || (${humanRead})`,
        `!data.exists() && auth != null && auth.token.email_verified === true && auth.token.firebase.sign_in_provider === 'google.com'
        && ${scope('newData')} && newData.child('schemaVersion').val() === 1 && newData.child('operationId').val() === $operationId
        && newData.child('targetUid').val() === auth.uid && newData.child('provider').val() === 'google.com' && newData.child('accepted').val() === true
        && ${f(selectedRequest, 'targetUid')} === auth.uid && newData.child('targetExpectedRevision').val() === ${f(selectedRequest, 'targetExpectedRevision')}
        && ${f(`${root}.child('roles').child(auth.uid)`, 'revision')} === ${f(selectedRequest, 'targetExpectedRevision')}
        && !${root}.child('ownerHandoverResults').child($operationId).exists()
        && newData.child('authenticatedAt').val() === auth.token.auth_time * 1000
        && auth.token.auth_time * 1000 <= now && now - auth.token.auth_time * 1000 <= 900000`,
      ),
    },
    ownerHandoverResults: {
      $operationId: record(
        keys,
        receiptRead,
        `!data.exists() && ${commit('newData.parent().parent()', '$operationId')}`,
      ),
    },
    ownerHandoverAudit: {
      $operationId: record(
        keys,
        manager,
        `!data.exists() && ${commit('newData.parent().parent()', '$operationId')}`,
      ),
    },
  };
}
