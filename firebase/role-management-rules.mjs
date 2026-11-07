// 役割と臨時権限の変更について、固定入力・結果と監査のRTDB規則を生成する。

/** 指定した子キーの値を参照するRules式を作る。 */
const f = (node, key) => `${node}.child('${key}').val()`;

/** 指定した子キーを参照するRules式を作る。 */
const c = (node, key) => `${node}.child('${key}')`;

const keys = [
  'exceptionManage',
  'manualReception',
  'arrivalCorrection',
  'seatDisplayNameEdit',
  'receptionConflictResolve',
  'rereadManagementMemo',
  'dayManagementRead',
  'staffNoticeManage',
  'dayAuditRead',
];
const roleFields = [
  'environmentId',
  'performanceId',
  'humanUid',
  'role',
  'active',
  'revision',
  'startsAt',
  'endsAt',
  'lastOperationId',
];
const requestFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'actorUid',
  'actorDeviceUid',
  'targetUid',
  'expectedRevision',
  'previousRole',
  'nextRole',
  'startsAt',
  'endsAt',
  'requestedAt',
];
const resultFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'status',
  'operationId',
  'actorUid',
  'actorDeviceUid',
  'targetUid',
  'expectedRevision',
  'resultingRevision',
  'kind',
  'previousRole',
  'nextRole',
  'committedAt',
];
const profileFields = [
  'schemaVersion',
  'humanUid',
  'roleVersion',
  'status',
  'validFrom',
  'validUntil',
  'permissions',
];
const permissionRequestFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'actorUid',
  'actorDeviceUid',
  'targetUid',
  'expectedRevision',
  'validFrom',
  'validUntil',
  'revoke',
  'permissions',
  'requestedAt',
];
const auditFields = [
  ...resultFields,
  'previousStartsAt',
  'previousEndsAt',
  'nextStartsAt',
  'nextEndsAt',
  'previousProfileVersion',
  'nextProfileVersion',
  'previousPermissions',
  'nextPermissions',
];

/** 必須項目と許可・拒否の条件を持つ、厳密なレコード規則を作る。 */
function record(fields, read, write) {
  return {
    '.read': read,
    '.write': `newData.exists() && newData.hasChildren(${JSON.stringify(fields)}) && (${write})`,
    ...Object.fromEntries(fields.map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };
}

/** 環境IDと公演IDの一致を検査するRules式を作る。 */
function scope(node) {
  return `${f(node, 'environmentId')} === $environmentId && ${f(node, 'performanceId')} === $performanceId`;
}

/** 指定項目が下限以上の安全な整数か検査するRules式を作る。 */
function integer(node, key, min = 0) {
  return `${c(node, key)}.isNumber() && ${f(node, key)} >= ${min}
    && ${f(node, key)} % 1 === 0 && ${f(node, key)} <= 9007199254740991`;
}

/** 指定した各項目が変更前後で一致するRules式を作る。 */
function equalFields(a, b, fields) {
  return fields.map((key) => `${f(a, key)} === ${f(b, key)}`).join(' && ');
}

/** 役割変更・臨時権限と結果・監査の保存規則を作る。 */
export function roleManagementRules({ root, preparedAuthorization, roleRead, profileRead }) {
  // rootは変更前の公演、各関数のpostは一体更新後の公演を指す。
  const ownDevice = `${root}.child('devices').child(auth.uid)`;
  const ownSession = `${root}.child('sessions').child(auth.uid)`;
  const ownRole = `${root}.child('roles').child(${f(ownDevice, 'humanUid')})`;
  const manager = `(${preparedAuthorization()} && (${f(ownRole, 'role')} === 'owner' || ${f(ownRole, 'role')} === 'deputy'))`;
  const recent = `(${manager} && ${f(ownSession, 'humanAuthTime')} <= now
    && now - ${f(ownSession, 'humanAuthTime')} <= 900000)`;

  /** 指定した本人の役割台帳を参照する式を作る。 */
  const role = (base, uid) => `${base}.child('roles').child(${uid})`;

  /** 本人と役割版に対応する臨時権限設定の参照式を作る。 */
  const profile = (base, uid, version) =>
    `${base}.child('temporaryPermissionProfiles').child(${uid}).child(${version} + '')`;

  /** 対象役割の所属と有効状態を検査する式を作る。 */
  const targetActive = (target) => `(${scope(target)} && ${f(target, 'active')} === true
    && ${f(target, 'startsAt')} <= now && now < ${f(target, 'endsAt')})`;

  /** 固定9項目が真偽値でそろっているか検査する式を作る。 */
  const permissionsValid = (node) =>
    `${node}.hasChildren(${JSON.stringify(keys)}) && ` +
    keys.map((key) => `${c(node, key)}.isBoolean()`).join(' && ');

  const permissionsSchema = {
    ...Object.fromEntries(keys.map((key) => [key, { '.validate': 'newData.isBoolean()' }])),
    $other: { '.validate': false },
  };

  /** 操作者と対象役割から、変更後の役割を許可できるか検査する。 */
  function allowedRoles(target, next) {
    const old = f(target, 'role');

    return `(${old} !== ${next} && ${old} !== 'owner' && ${next} !== 'owner'
      && (${['deputy', 'temporary', 'receptionist'].map((value) => `${next} === '${value}'`).join(' || ')})
      && (${f(ownRole, 'role')} === 'owner' || ((${old} === 'temporary' || ${old} === 'receptionist')
        && (${next} === 'temporary' || ${next} === 'receptionist'))))`;
  }

  /** 役割変更案の所属・現在版と固定入力を検査する。 */
  function requestValid(request, operationId, target = role(root, f(request, 'targetUid'))) {
    return `${recent} && ${scope(request)} && ${f(request, 'schemaVersion')} === 1
      && ${f(request, 'operationId')} === ${operationId}
      && ${f(request, 'actorUid')} === ${f(ownRole, 'humanUid')} && ${f(request, 'actorDeviceUid')} === auth.uid
      && ${targetActive(target)} && ${f(target, 'humanUid')} === ${f(request, 'targetUid')}
      && ${f(request, 'expectedRevision')} === ${f(target, 'revision')}
      && ${f(request, 'previousRole')} === ${f(target, 'role')}
      && ${allowedRoles(target, f(request, 'nextRole'))}
      && ${integer(request, 'startsAt')} && ${integer(request, 'endsAt', 1)}
      && ${f(request, 'startsAt')} < ${f(request, 'endsAt')} && now < ${f(request, 'endsAt')}
      && (${f(request, 'nextRole')} === 'deputy' || ${f(request, 'endsAt')} <= ${f(`${root}.child('control')`, 'staffDeadline')})`;
  }

  /** 臨時権限設定の形式・期間と役割版を検査する。 */
  function profileValid(node, nextRole) {
    return `${node}.exists() && ${node}.hasChildren(${JSON.stringify(profileFields)})
      && ${f(node, 'schemaVersion')} === 1 && ${f(node, 'humanUid')} === ${f(nextRole, 'humanUid')}
      && ${f(node, 'roleVersion')} === ${f(nextRole, 'revision')}
      && (${f(node, 'status')} === 'active' || ${f(node, 'status')} === 'revoked')
      && ${integer(node, 'validFrom')} && ${integer(node, 'validUntil', 1)}
      && ${f(nextRole, 'startsAt')} <= ${f(node, 'validFrom')}
      && ${f(node, 'validFrom')} < ${f(node, 'validUntil')} && now < ${f(node, 'validUntil')}
      && ${f(node, 'validUntil')} <= ${f(nextRole, 'endsAt')}
      && ${f(node, 'validUntil')} <= ${f(`${root}.child('control')`, 'staffDeadline')}
      && ${permissionsValid(c(node, 'permissions'))}
      && (${f(node, 'status')} !== 'revoked' || (${keys.map((key) => `${f(c(node, 'permissions'), key)} === false`).join(' && ')}))`;
  }

  /** 臨時権限の変更入力と、対象役割・現在設定を検査する。 */
  function permissionRequestValid(
    request,
    operationId,
    target = role(root, f(request, 'targetUid')),
  ) {
    return `${recent} && ${scope(request)} && ${f(request, 'schemaVersion')} === 1
      && ${f(request, 'operationId')} === ${operationId} && ${f(request, 'actorDeviceUid')} === auth.uid
      && ${f(request, 'actorUid')} === ${f(ownRole, 'humanUid')}
      && ${f(request, 'targetUid')} !== ${f(ownRole, 'humanUid')}
      && ${f(target, 'humanUid')} === ${f(request, 'targetUid')}
      && ${targetActive(target)} && ${f(target, 'role')} === 'temporary'
      && ${f(request, 'expectedRevision')} === ${f(target, 'revision')}
      && ${integer(request, 'validFrom')} && ${integer(request, 'validUntil', 1)}
      && ${f(target, 'startsAt')} <= ${f(request, 'validFrom')}
      && ${f(request, 'validFrom')} < ${f(request, 'validUntil')} && now < ${f(request, 'validUntil')}
      && ${f(request, 'validUntil')} <= ${f(target, 'endsAt')}
      && ${f(request, 'validUntil')} <= ${f(`${root}.child('control')`, 'staffDeadline')}
      && ${c(request, 'revoke')}.isBoolean() && ${permissionsValid(c(request, 'permissions'))}`;
  }

  // 結果側から役割・監査の同時存在を検査し、役割側も同じ結果を参照する。
  /** 役割・設定と結果・監査が同じ確定に含まれるか検査する。 */
  function committed(post, operationId, kind) {
    const result = `${post}.child('${kind === 'roleChange' ? 'roleChangeResults' : 'temporaryPermissionOperations'}').child(${operationId})`;
    const oldResult = `${root}.child('${kind === 'roleChange' ? 'roleChangeResults' : 'temporaryPermissionOperations'}').child(${operationId})`;
    const request =
      kind === 'roleChange'
        ? `${root}.child('roleChangeRequests').child(${operationId})`
        : c(result, 'request');
    const body = kind === 'roleChange' ? result : c(result, 'result');
    // この完全検査はroles/{humanUid}の.writeだけで使う。
    const uid = '$humanUid',
      before = 'data',
      after = 'newData';
    const newProfile = profile(post, uid, f(after, 'revision'));
    const audit = `${post}.child('authorizationAudit').child(${operationId})`;
    const oldAudit = `${root}.child('authorizationAudit').child(${operationId})`;
    const acceptance = `${root}.child('roleChangeAcceptances').child(${operationId})`;
    const previousProfile = profile(root, uid, f(before, 'revision'));
    const auditDetails = `${f(audit, 'previousStartsAt')} === ${f(before, 'startsAt')}
      && ${f(audit, 'previousEndsAt')} === ${f(before, 'endsAt')}
      && ${f(audit, 'nextStartsAt')} === ${f(after, 'startsAt')} && ${f(audit, 'nextEndsAt')} === ${f(after, 'endsAt')}
      && ${f(audit, 'previousProfileVersion')} === (${f(before, 'role')} === 'temporary' ? ${f(before, 'revision')} : 0)
      && ${f(audit, 'nextProfileVersion')} === (${f(after, 'role')} === 'temporary' ? ${f(after, 'revision')} : 0)
      && ${keys
        .map(
          (
            key,
          ) => `${f(c(audit, 'previousPermissions'), key)} === (${f(before, 'role')} === 'temporary'
        ? ${f(c(previousProfile, 'permissions'), key)} : false)
        && ${f(c(audit, 'nextPermissions'), key)} === (${f(after, 'role')} === 'temporary'
          ? ${f(c(newProfile, 'permissions'), key)} : false)`,
        )
        .join(' && ')}`;
    const google = `(${f(request, 'nextRole')} !== 'deputy' || (${acceptance}.exists()
      && ${scope(acceptance)} && ${f(acceptance, 'schemaVersion')} === 1
      && ${f(acceptance, 'operationId')} === ${operationId} && ${f(acceptance, 'targetUid')} === ${uid}
      && ${f(acceptance, 'expectedRevision')} === ${f(before, 'revision')}
      && ${f(acceptance, 'provider')} === 'google.com' && ${f(acceptance, 'authenticatedAt')} <= now
      && now - ${f(acceptance, 'authenticatedAt')} <= 900000))`;
    const changed =
      kind === 'roleChange'
        ? `${requestValid(request, operationId, before)} && ${google}
        && ${f(after, 'role')} === ${f(request, 'nextRole')}
        && ${equalFields(after, request, ['startsAt', 'endsAt'])}
        && (${f(after, 'role')} !== 'temporary' || (${profileValid(newProfile, after)}
          && ${f(newProfile, 'status')} === 'active' && ${f(newProfile, 'validFrom')} === ${f(after, 'startsAt')}
          && ${f(newProfile, 'validUntil')} === ${f(after, 'endsAt')}))`
        : `${permissionRequestValid(request, operationId, before)} && ${equalFields(after, before, ['role', 'startsAt', 'endsAt'])}
        && ${profileValid(newProfile, after)} && ${equalFields(newProfile, request, ['validFrom', 'validUntil'])}
        && (${f(request, 'revoke')} === true ? ${f(newProfile, 'status')} === 'revoked'
          : (${f(newProfile, 'status')} === 'active' && ${equalFields(c(newProfile, 'permissions'), c(request, 'permissions'), keys)}))`;

    return `(${recent} && !${oldResult}.exists() && !${oldAudit}.exists()
      && ${body}.exists() && ${body}.hasChildren(${JSON.stringify(resultFields)})
      && ${scope(body)} && ${f(body, 'schemaVersion')} === 1 && ${f(body, 'status')} === 'committed'
      && ${f(body, 'kind')} === '${kind}' && ${f(body, 'operationId')} === ${operationId}
      && ${f(body, 'actorUid')} === ${f(ownRole, 'humanUid')} && ${f(body, 'actorDeviceUid')} === auth.uid
      && ${f(body, 'expectedRevision')} === ${f(before, 'revision')}
      && ${f(body, 'resultingRevision')} === ${f(before, 'revision')} + 1
      && ${f(body, 'previousRole')} === ${f(before, 'role')} && ${f(body, 'nextRole')} === ${f(after, 'role')}
      && ${f(body, 'committedAt')} === now
      && ${after}.hasChildren(${JSON.stringify(roleFields)}) && ${scope(after)}
      && ${f(after, 'humanUid')} === ${uid} && ${f(after, 'active')} === true
      && ${integer(after, 'revision', 1)} && ${f(after, 'revision')} === ${f(body, 'resultingRevision')}
      && ${f(after, 'lastOperationId')} === ${operationId}
      && ${changed} && ${audit}.exists() && ${equalFields(audit, body, resultFields)} && ${auditDetails})`;
  }

  // 役割以外の末端は、必ず同じ役割更新を要求する。許可表は役割側で評価する。
  /** 関連レコードの更新が、同じ役割の確定に結び付くか検査する。 */
  function boundCommit(post, operationId, kind) {
    const path = kind === 'roleChange' ? 'roleChangeResults' : 'temporaryPermissionOperations';
    const record = `${post}.child('${path}').child(${operationId})`;
    const body = kind === 'roleChange' ? record : c(record, 'result');
    const uid = f(body, 'targetUid'),
      before = role(root, uid),
      after = role(post, uid);
    const audit = `${post}.child('authorizationAudit').child(${operationId})`;

    return `(${recent} && !${root}.child('${path}').child(${operationId}).exists()
      && !${root}.child('authorizationAudit').child(${operationId}).exists()
      && ${body}.hasChildren(${JSON.stringify(resultFields)}) && ${scope(body)}
      && ${f(body, 'schemaVersion')} === 1 && ${f(body, 'status')} === 'committed'
      && ${f(body, 'kind')} === '${kind}' && ${f(body, 'operationId')} === ${operationId}
      && ${f(body, 'actorUid')} === ${f(ownRole, 'humanUid')} && ${f(body, 'actorDeviceUid')} === auth.uid
      && ${f(body, 'expectedRevision')} === ${f(before, 'revision')}
      && ${f(body, 'resultingRevision')} === ${f(before, 'revision')} + 1
      && ${f(after, 'humanUid')} === ${uid} && ${f(after, 'revision')} === ${f(body, 'resultingRevision')}
      && ${f(after, 'lastOperationId')} === ${operationId}
      && ${f(body, 'previousRole')} === ${f(before, 'role')} && ${f(body, 'nextRole')} === ${f(after, 'role')}
      && ${f(body, 'committedAt')} === now && ${audit}.exists() && ${equalFields(audit, body, resultFields)})`;
  }

  /** 役割と設定を変えず、取消し結果と監査だけを保存する条件を作る。 */
  function cancelled(post, operationId, kind) {
    const path = kind === 'roleChange' ? 'roleChangeResults' : 'temporaryPermissionOperations';
    const operation = `${post}.child('${path}').child(${operationId})`;
    const body = kind === 'roleChange' ? operation : c(operation, 'result');
    const request =
      kind === 'roleChange'
        ? `${root}.child('roleChangeRequests').child(${operationId})`
        : c(operation, 'request');
    const uid = f(body, 'targetUid'),
      before = role(root, uid),
      after = role(post, uid);
    const audit = `${post}.child('authorizationAudit').child(${operationId})`;
    const oldProfile = profile(root, uid, f(before, 'revision'));

    return `(${recent} && !${root}.child('${path}').child(${operationId}).exists()
      && !${root}.child('authorizationAudit').child(${operationId}).exists()
      && ${kind === 'roleChange' ? requestValid(request, operationId) : permissionRequestValid(request, operationId)}
      && ${body}.hasChildren(${JSON.stringify(resultFields)}) && ${scope(body)}
      && ${f(body, 'schemaVersion')} === 1 && ${f(body, 'status')} === 'cancelled'
      && ${f(body, 'kind')} === '${kind}' && ${f(body, 'operationId')} === ${operationId}
      && ${equalFields(body, request, ['actorUid', 'actorDeviceUid', 'targetUid', 'expectedRevision'])}
      && ${f(body, 'resultingRevision')} === ${f(before, 'revision')}
      && ${f(body, 'previousRole')} === ${f(before, 'role')} && ${f(body, 'nextRole')} === ${f(before, 'role')}
      && ${f(body, 'committedAt')} === now && ${equalFields(after, before, roleFields)}
      && ${audit}.hasChildren(${JSON.stringify(auditFields)}) && ${equalFields(audit, body, resultFields)}
      && ${f(audit, 'previousStartsAt')} === ${f(before, 'startsAt')} && ${f(audit, 'nextStartsAt')} === ${f(before, 'startsAt')}
      && ${f(audit, 'previousEndsAt')} === ${f(before, 'endsAt')} && ${f(audit, 'nextEndsAt')} === ${f(before, 'endsAt')}
      && ${f(audit, 'previousProfileVersion')} === (${f(before, 'role')} === 'temporary' ? ${f(before, 'revision')} : 0)
      && ${f(audit, 'nextProfileVersion')} === ${f(audit, 'previousProfileVersion')}
      && ${keys
        .map(
          (
            key,
          ) => `${f(c(audit, 'previousPermissions'), key)} === (${f(before, 'role')} === 'temporary' ? ${f(c(oldProfile, 'permissions'), key)} : false)
        && ${f(c(audit, 'nextPermissions'), key)} === ${f(c(audit, 'previousPermissions'), key)}`,
        )
        .join(' && ')})`;
  }

  /** 役割変更または臨時権限変更の取消し条件をまとめる。 */
  const anyCancellation = (post, id) =>
    `(${cancelled(post, id, 'roleChange')} || ${cancelled(post, id, 'permissionChange')})`;

  /** 操作種別に対応する確定条件を選び、対象役割との結合を検査する。 */
  const anyCommit = (post, operationId, targetUid, full = false) => {
    /** 指定した操作種別と結果保存先に対応する確定条件を作る。 */
    const bound = (kind, path) =>
      `(${full ? committed(post, operationId, kind) : boundCommit(post, operationId, kind)} ${
        targetUid
          ? `&& ${f(`${post}.child('${path}').child(${operationId})${kind === 'permissionChange' ? ".child('result')" : ''}`, 'targetUid')} === ${targetUid}`
          : ''
      })`;

    return `(${bound('roleChange', 'roleChangeResults')} || ${bound('permissionChange', 'temporaryPermissionOperations')})`;
  };

  const rolePost = 'newData.parent().parent()';
  const roleWrite =
    `${f('newData', 'humanUid')} === $humanUid && ` +
    anyCommit(rolePost, f('newData', 'lastOperationId'), '$humanUid', true);
  const requestRead = `${manager} || (auth != null && auth.token.email_verified === true
    && auth.uid === data.child('targetUid').val()
    && (auth.token.firebase.sign_in_provider === 'google.com' || auth.token.firebase.sign_in_provider === 'password'))`;
  const acceptanceRequest = `${root}.child('roleChangeRequests').child($operationId)`;
  const acceptance = record(
    [
      'schemaVersion',
      'environmentId',
      'performanceId',
      'operationId',
      'targetUid',
      'expectedRevision',
      'provider',
      'authenticatedAt',
    ],
    `${manager} || (auth != null && auth.uid === data.child('targetUid').val())`,
    `!data.exists() && auth != null && auth.token.email_verified === true
      && auth.token.firebase.sign_in_provider === 'google.com' && ${scope('newData')}
      && newData.child('schemaVersion').val() === 1 && newData.child('operationId').val() === $operationId
      && newData.child('targetUid').val() === auth.uid && newData.child('provider').val() === 'google.com'
      && newData.child('expectedRevision').val() === ${f(acceptanceRequest, 'expectedRevision')}
      && ${f(acceptanceRequest, 'targetUid')} === auth.uid && ${f(acceptanceRequest, 'nextRole')} === 'deputy'
      && ${f(role(root, 'auth.uid'), 'revision')} === ${f(acceptanceRequest, 'expectedRevision')}
      && !${root}.child('roleChangeResults').child($operationId).exists()
      && newData.child('authenticatedAt').val() === auth.token.auth_time * 1000
      && auth.token.auth_time * 1000 <= now && now - auth.token.auth_time * 1000 <= 900000`,
  );
  const newProfile = record(
    profileFields,
    `${manager} || (${profileRead})`,
    `!data.exists() && newData.child('humanUid').val() === $humanUid
      && newData.child('roleVersion').val() + '' === $roleVersion
      && ${profileValid('newData', role('newData.parent().parent().parent()', '$humanUid'))}
      && ${anyCommit('newData.parent().parent().parent()', f(role('newData.parent().parent().parent()', '$humanUid'), 'lastOperationId'), '$humanUid')}`,
  );

  newProfile.permissions = {
    '.validate': permissionsValid('newData'),
    ...permissionsSchema,
  };

  const operation = record(
    ['request', 'result'],
    manager,
    `!data.exists() && (${boundCommit('newData.parent().parent()', '$operationId', 'permissionChange')}
      || ${cancelled('newData.parent().parent()', '$operationId', 'permissionChange')})`,
  );

  operation.request = {
    '.validate': `newData.hasChildren(${JSON.stringify(permissionRequestFields)})
    && ${integer('newData', 'requestedAt')} && newData.child('requestedAt').val() <= now`,
    ...Object.fromEntries(permissionRequestFields.map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };
  operation.request.permissions = {
    '.validate': permissionsValid('newData'),
    ...permissionsSchema,
  };
  operation.result = {
    '.validate': `newData.hasChildren(${JSON.stringify(resultFields)})`,
    ...Object.fromEntries(resultFields.map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };

  const auditRule = record(
    auditFields,
    manager,
    `!data.exists() && (${anyCommit('newData.parent().parent()', '$operationId')}
      || ${anyCancellation('newData.parent().parent()', '$operationId')})`,
  );

  auditRule.previousPermissions = {
    '.validate': permissionsValid('newData'),
    ...permissionsSchema,
  };
  auditRule.nextPermissions = { '.validate': permissionsValid('newData'), ...permissionsSchema };

  return {
    manager,
    roles: {
      '.read': manager,
      $humanUid: record(roleFields, `${roleRead} || ${manager}`, roleWrite),
    },
    roleChangeRequests: {
      $operationId: record(
        requestFields,
        requestRead,
        `!data.exists() && ${requestValid('newData', '$operationId')}
        && newData.child('requestedAt').val() === now
        && !${root}.child('roleChangeResults').child($operationId).exists()`,
      ),
    },
    roleChangeAcceptances: { $operationId: acceptance },
    roleChangeResults: {
      $operationId: record(
        resultFields,
        manager,
        `!data.exists() && (${boundCommit('newData.parent().parent()', '$operationId', 'roleChange')}
          || ${cancelled('newData.parent().parent()', '$operationId', 'roleChange')})`,
      ),
    },
    temporaryPermissionProfiles: { $humanUid: { $roleVersion: newProfile } },
    temporaryPermissionOperations: { $operationId: operation },
    authorizationAudit: {
      '.read': manager,
      $operationId: auditRule,
    },
  };
}
