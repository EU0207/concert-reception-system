// 匿名端末の仮登録だけで本人を装えないよう、本人Authによる証明と承認待ち台帳を一体作成する。
const f = (node, key) => `${node}.child('${key}').val()`;
const scope = (node) =>
  `${f(node, 'environmentId')} === $environmentId && ${f(node, 'performanceId')} === $performanceId`;
const requestFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'deviceUid',
  'humanUid',
  'storageEpoch',
  'revision',
  'requestedAt',
  'expiresAt',
];
const proofFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'deviceUid',
  'humanUid',
  'storageEpoch',
  'roleRevision',
  'authProvider',
  'emailVerified',
  'humanAuthTime',
  'issuedAt',
  'revision',
];
const binding = ['environmentId', 'performanceId', 'deviceUid', 'humanUid', 'storageEpoch'];
const same = (a, b, fields) => fields.map((key) => `${f(a, key)} === ${f(b, key)}`).join(' && ');
const positive = (node, key) =>
  `${node}.child('${key}').isNumber() && ${f(node, key)} >= 1 && ${f(node, key)} % 1 === 0 && ${f(node, key)} <= 9007199254740991`;

function record(fields, read, write) {
  return {
    '.read': read,
    '.write': `newData.exists() && newData.hasChildren(${JSON.stringify(fields)}) && (${write})`,
    ...Object.fromEntries(fields.map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };
}

/** 承認時も現在役割版へ結ぶ。古い役割の登録証明を、新しい役割へ流用しない。 */
export function registrationProofValid(root, device, role, provider) {
  const proof = `${root}.child('deviceRegistrationProofs').child(${f(device, 'deviceUid')})`;
  return `${proof}.exists() && ${scope(proof)} && ${f(proof, 'schemaVersion')} === 1
    && ${same(proof, device, ['deviceUid', 'humanUid', 'storageEpoch'])}
    && ${f(proof, 'roleRevision')} === ${f(role, 'revision')} && ${f(proof, 'emailVerified')} === true
    && ${f(proof, 'issuedAt')} <= now && ${f(proof, 'humanAuthTime')} <= ${f(proof, 'issuedAt')}
    && ${provider(role, f(proof, 'authProvider'))}`;
}

export function deviceRegistrationRules({ root, manager, roleValid, provider }) {
  const device = `${root}.child('devices').child($deviceUid)`;
  const request = `${root}.child('deviceRegistrationRequests').child($deviceUid)`;
  const ownRole = `${root}.child('roles').child(auth.uid)`;
  const currentHuman = `auth != null && auth.token.email_verified === true && ${roleValid(ownRole)}
    && ${f(ownRole, 'humanUid')} === auth.uid && ${provider(ownRole, 'auth.token.firebase.sign_in_provider')}
    && ((${f(ownRole, 'role')} === 'owner' || ${f(ownRole, 'role')} === 'deputy')
      || now < ${f(`${root}.child('control')`, 'staffDeadline')})`;
  const pending = (node) => `${scope(node)} && ${f(node, 'schemaVersion')} === 2
    && ${f(node, 'deviceUid')} === $deviceUid && ${f(node, 'active')} === false && ${f(node, 'approved')} === false
    && ${f(node, 'retired')} === false && ${f(node, 'preparedRole')} === null
    && ${f(node, 'preparedRoleRevision')} === 0 && ${f(node, 'revision')} === 1
    && !${node}.child('lastOperationId').exists()`;
  const read = `${manager} || (auth != null && ((auth.token.firebase.sign_in_provider === 'anonymous' && auth.uid === $deviceUid)
    || (auth.uid === data.child('humanUid').val() && (auth.token.firebase.sign_in_provider === 'google.com' || auth.token.firebase.sign_in_provider === 'password'))))`;
  const requestWrite = `auth != null && auth.token.firebase.sign_in_provider === 'anonymous' && auth.uid === $deviceUid
    && ${scope('newData')} && newData.child('schemaVersion').val() === 1 && newData.child('deviceUid').val() === auth.uid
    && newData.child('humanUid').isString() && newData.child('humanUid').val() !== auth.uid
    && newData.child('storageEpoch').isString()
    && newData.child('storageEpoch').val().matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    && ${positive('newData', 'revision')} && newData.child('revision').val() === (data.exists() ? data.child('revision').val() + 1 : 1)
    && newData.child('requestedAt').val() === now && newData.child('expiresAt').isNumber()
    && newData.child('expiresAt').val() % 1 === 0 && newData.child('expiresAt').val() > now
    && newData.child('expiresAt').val() <= now + 900000
    && (!data.exists() || (${same('newData', 'data', binding)}))
    && (!${device}.exists() || (${pending(device)} && ${same(device, 'newData', ['humanUid', 'storageEpoch'])}))`;

  function bind(post) {
    const proof = `${post}.child('deviceRegistrationProofs').child($deviceUid)`;
    const oldProof = `${root}.child('deviceRegistrationProofs').child($deviceUid)`;
    const after = `${post}.child('devices').child($deviceUid)`;
    return `(${currentHuman} && ${request}.exists() && ${scope(request)} && ${f(request, 'schemaVersion')} === 1
      && ${f(request, 'deviceUid')} === $deviceUid && ${f(request, 'humanUid')} === auth.uid
      && ${f(request, 'requestedAt')} <= now && now < ${f(request, 'expiresAt')}
      && ${proof}.hasChildren(${JSON.stringify(proofFields)}) && ${scope(proof)} && ${f(proof, 'schemaVersion')} === 1
      && ${same(proof, request, binding)} && ${f(proof, 'roleRevision')} === ${f(ownRole, 'revision')}
      && ${f(proof, 'authProvider')} === auth.token.firebase.sign_in_provider && ${f(proof, 'emailVerified')} === true
      && ${f(proof, 'humanAuthTime')} === auth.token.auth_time * 1000 && ${f(proof, 'humanAuthTime')} <= now
      && (${f(ownRole, 'role')} !== 'owner' || now - auth.token.auth_time * 1000 <= 900000)
      && ${f(proof, 'issuedAt')} === now && ${positive(proof, 'revision')}
      && ${f(proof, 'revision')} === (${oldProof}.exists() ? ${f(oldProof, 'revision')} + 1 : 1)
      && (!${oldProof}.exists() || (${same(proof, oldProof, binding)}))
      && ${after}.exists() && ${pending(after)} && ${same(after, proof, ['humanUid', 'storageEpoch'])}
      && (!${device}.exists() || (${pending(device)} && ${same(after, device, binding)})))`;
  }
  return {
    pendingDeviceWrite: `!data.exists() && newData.exists() && ${bind('newData.parent().parent()')}`,
    deviceRegistrationRequests: { $deviceUid: record(requestFields, read, requestWrite) },
    deviceRegistrationProofs: {
      $deviceUid: record(proofFields, read, bind('newData.parent().parent()')),
    },
  };
}
