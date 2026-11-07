// 端末の承認・停止・停止解除と廃止について、RTDBの保存規則を生成する。

/** 指定した子キーの値を参照するRules式を作る。 */
const f = (node, key) => `${node}.child('${key}').val()`;

const immutable = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'deviceUid',
  'humanUid',
  'storageEpoch',
  'preparedRole',
  'preparedRoleRevision',
];
const deviceFields = [...immutable, 'active', 'approved', 'retired', 'revision', 'lastOperationId'];
const operationFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'actorUid',
  'actorDeviceUid',
  'targetDeviceUid',
  'expectedRevision',
  'resultingRevision',
  'kind',
  'replacementDeviceUid',
  'committedAt',
  'previousActive',
  'previousApproved',
  'previousRetired',
  'nextActive',
  'nextApproved',
  'nextRetired',
];

/** 必須項目と許可・拒否の条件を持つ、厳密なレコード規則を作る。 */
function record(fields, read, write, required = fields) {
  return {
    '.read': read,
    '.write': `newData.exists() && newData.hasChildren(${JSON.stringify(required)}) && (${write})`,
    ...Object.fromEntries(fields.map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };
}

/** 既存端末の承認・停止・停止解除と廃止の規則を作る。 */
export function deviceManagementRules({
  root,
  manager,
  ownMetadata,
  roleValid,
  registrationProof,
}) {
  const ownDevice = `${root}.child('devices').child(auth.uid)`;
  const session = `${root}.child('sessions').child(auth.uid)`;
  const recent = `${manager} && ${f(session, 'humanAuthTime')} <= now && now - ${f(session, 'humanAuthTime')} <= 900000`;

  /** 台帳の現在版を参照し、版のない既存行は初期版1として扱う。 */
  const oldRevision = (node) => `(${node}.child('revision').exists() ? ${f(node, 'revision')} : 1)`;

  /** 指定した端末の台帳を参照する式を作る。 */
  const device = (base, uid) => `${base}.child('devices').child(${uid})`;

  /** 端末状態と操作結果の一体更新を検査する式を作る。 */
  function commit(post, id) {
    const operation = `${post}.child('deviceAuthorizationOperations').child(${id})`;
    const uid = f(operation, 'targetDeviceUid'),
      before = device(root, uid),
      after = device(post, uid);
    const oldRole = `${root}.child('roles').child(${f(before, 'humanUid')})`;
    const replacement = device(post, f(operation, 'replacementDeviceUid'));
    const replacementRole = `${post}.child('roles').child(${f(replacement, 'humanUid')})`;
    const replacementValid = `${f(replacement, 'deviceUid')} !== ${uid}
      && ${f(replacement, 'environmentId')} === $environmentId && ${f(replacement, 'performanceId')} === $performanceId
      && ${f(replacement, 'active')} === true && ${f(replacement, 'approved')} === true && ${f(replacement, 'retired')} === false
      && ${f(replacementRole, 'active')} === true && ${f(replacementRole, 'startsAt')} <= now && now < ${f(replacementRole, 'endsAt')}
      && ${f(replacementRole, 'environmentId')} === $environmentId && ${f(replacementRole, 'performanceId')} === $performanceId
      && ${f(replacement, 'preparedRole')} === ${f(replacementRole, 'role')}
      && ${f(replacement, 'preparedRoleRevision')} === ${f(replacementRole, 'revision')}
      && (${f(oldRole, 'role')} === 'owner'
        ? (${f(replacementRole, 'role')} === 'owner' && ${f(replacementRole, 'humanUid')} === ${f(oldRole, 'humanUid')})
        : (${f(replacementRole, 'role')} === 'owner' || ${f(replacementRole, 'role')} === 'deputy'))`;
    const transitions = `(${f(operation, 'kind')} === 'approve' && ${f(before, 'approved')} === false && ${f(oldRole, 'role')} !== 'owner'
        && ${roleValid(oldRole)} && ${registrationProof(before, oldRole)}
        && ${f(after, 'active')} === true && ${f(after, 'approved')} === true && ${f(after, 'retired')} === false)
      || (${f(operation, 'kind')} === 'stop' && ${f(before, 'approved')} === true && ${f(before, 'active')} === true
        && ${f(after, 'active')} === false && ${f(after, 'approved')} === true && ${f(after, 'retired')} === false)
      || (${f(operation, 'kind')} === 'resume' && ${f(before, 'approved')} === true && ${f(before, 'active')} === false
        && ${f(after, 'active')} === true && ${f(after, 'approved')} === true && ${f(after, 'retired')} === false)
      || (${f(operation, 'kind')} === 'retire' && ${f(after, 'active')} === false && ${f(after, 'retired')} === true
        && ${f(after, 'approved')} === ${f(before, 'approved')}
        && ((${f(oldRole, 'role')} !== 'owner' && ${f(oldRole, 'role')} !== 'deputy') || (${replacementValid})))`;

    return `(${recent} && !${root}.child('deviceAuthorizationOperations').child(${id}).exists()
      && ${operation}.hasChildren(${JSON.stringify(operationFields)}) && ${f(operation, 'schemaVersion')} === 1
      && ${f(operation, 'environmentId')} === $environmentId && ${f(operation, 'performanceId')} === $performanceId
      && ${f(operation, 'operationId')} === ${id} && ${f(operation, 'actorUid')} === ${f(ownDevice, 'humanUid')}
      && ${f(operation, 'actorDeviceUid')} === auth.uid && ${f(operation, 'committedAt')} === now
      && ${before}.exists() && ${f(before, 'retired')} === false
      && ${after}.hasChildren(${JSON.stringify(deviceFields.filter((key) => key !== 'preparedRole'))}) && ${f(after, 'deviceUid')} === ${uid}
      && ${f(after, 'lastOperationId')} === ${id} && ${f(after, 'revision')} === ${oldRevision(before)} + 1
      && ${after}.child('revision').isNumber() && ${f(after, 'revision')} % 1 === 0 && ${f(after, 'revision')} <= 9007199254740991
      && ${f(operation, 'expectedRevision')} === ${oldRevision(before)} && ${f(operation, 'resultingRevision')} === ${f(after, 'revision')}
      && ${immutable.map((key) => `${f(after, key)} === ${f(before, key)}`).join(' && ')}
      && ${f(before, 'environmentId')} === $environmentId && ${f(before, 'performanceId')} === $performanceId
      && ${['Active', 'Approved', 'Retired']
        .map(
          (key) => `${f(operation, `previous${key}`)} === ${f(before, key.toLowerCase())}
        && ${f(operation, `next${key}`)} === ${f(after, key.toLowerCase())}`,
        )
        .join(' && ')}
      && (${transitions}))`;
  }

  return {
    devices: {
      '.read': manager,
      $deviceUid: record(
        deviceFields,
        `${ownMetadata} || ${manager}`,
        `${f('newData', 'deviceUid')} === $deviceUid && ${commit('newData.parent().parent()', f('newData', 'lastOperationId'))}`,
        deviceFields.filter((key) => key !== 'preparedRole'),
      ),
    },
    deviceAuthorizationOperations: {
      $operationId: record(
        operationFields,
        `${manager} || (auth != null && auth.token.firebase.sign_in_provider === 'anonymous'
          && auth.uid === data.child('actorDeviceUid').val()
          && ${f(ownDevice, 'humanUid')} === data.child('actorUid').val())`,
        `!data.exists() && ${commit('newData.parent().parent()', '$operationId')}`,
      ),
    },
  };
}
