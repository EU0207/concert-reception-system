// 匿名端末の仮登録と本人Authの証明、承認待ち台帳のRTDB規則を生成する。

/** 指定した子キーの値を参照するRules式を作る。 */
const f = (node, key) => `${node}.child('${key}').val()`;

/** 環境IDと公演IDの一致を検査するRules式を作る。 */
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

/** 指定した各項目が変更前後で一致するRules式を作る。 */
const same = (a, b, fields) => fields.map((key) => `${f(a, key)} === ${f(b, key)}`).join(' && ');

/** 指定項目が1以上の安全な整数か検査する式を作る。 */
const positive = (node, key) =>
  `${node}.child('${key}').isNumber() && ${f(node, key)} >= 1 && ${f(node, key)} % 1 === 0 && ${f(node, key)} <= 9007199254740991`;

/** 必須項目と許可・拒否の条件を持つ、厳密なレコード規則を作る。 */
function record(fields, read, write) {
  return {
    '.read': read,
    '.write': `newData.exists() && newData.hasChildren(${JSON.stringify(fields)}) && (${write})`,
    ...Object.fromEntries(fields.map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };
}

/** 登録証明の所属・本人と現在役割版を検査する式を作る。 */
export function registrationProofValid(root, device, role, provider) {
  const proof = `${root}.child('deviceRegistrationProofs').child(${f(device, 'deviceUid')})`;

  return `${proof}.exists() && ${scope(proof)} && ${f(proof, 'schemaVersion')} === 1
    && ${same(proof, device, ['deviceUid', 'humanUid', 'storageEpoch'])}
    && ${f(proof, 'roleRevision')} === ${f(role, 'revision')} && ${f(proof, 'emailVerified')} === true
    && ${f(proof, 'issuedAt')} <= now && ${f(proof, 'humanAuthTime')} <= ${f(proof, 'issuedAt')}
    && ${provider(role, f(proof, 'authProvider'))}`;
}

/** 端末の仮登録・本人証明と承認待ち台帳の規則を作る。 */
export function deviceRegistrationRules({ root, manager, roleValid, provider }) {
  const device = `${root}.child('devices').child($deviceUid)`;
  const request = `${root}.child('deviceRegistrationRequests').child($deviceUid)`;
  const ownRole = `${root}.child('roles').child(auth.uid)`;
  const currentHuman = `auth != null && auth.token.email_verified === true && ${roleValid(ownRole)}
    && ${f(ownRole, 'humanUid')} === auth.uid && ${provider(ownRole, 'auth.token.firebase.sign_in_provider')}
    && ((${f(ownRole, 'role')} === 'owner' || ${f(ownRole, 'role')} === 'deputy')
      || now < ${f(`${root}.child('control')`, 'staffDeadline')})`;

  /** 端末が初期版の承認待ち状態か検査する式を作る。 */
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

  /** 本人Authによる証明と、承認待ち端末の一体作成を検査する。 */
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
