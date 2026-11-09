// 製品の認可境界を生成する。本人の証跡だけを書かせ、業務経路は既定で拒否する。

import { roleManagementRules } from './role-management-rules.mjs';
import { deviceManagementRules } from './device-management-rules.mjs';
import { ownerHandoverRules } from './owner-handover-rules.mjs';
import { deviceRegistrationRules, registrationProofValid } from './device-registration-rules.mjs';
import { ownerDeviceLinkRules } from './owner-device-link-rules.mjs';
import { performanceInitializationRules } from './performance-initialization-rules.mjs';

/** 指定した子キーの値を参照するRules式を作る。 */
const field = (node, key) => `${node}.child('${key}').val()`;

/** 指定した子キーを参照するRules式を作る。 */
const child = (node, key) => `${node}.child('${key}')`;

const root = "root.child('environments/'+$environmentId+'/performances/'+$performanceId)";
const ownDevice = `${root}.child('devices').child(auth.uid)`;
const ownSession = `${root}.child('sessions').child(auth.uid)`;
const ownRole = `${root}.child('roles').child(${field(ownDevice, 'humanUid')})`;

/** 環境IDと公演IDの一致を検査するRules式を作る。 */
function scope(node) {
  return `${field(node, 'environmentId')} === $environmentId && ${field(node, 'performanceId')} === $performanceId`;
}

/** 指定した下限以上の安全な整数か検査するRules式を作る。 */
function integer(expression, minimum = 0) {
  return `(${expression} >= ${minimum} && ${expression} % 1 === 0 && ${expression} <= 9007199254740991)`;
}

/** 役割の所属・形式と有効期間を検査するRules式を作る。 */
function roleValid(node) {
  return `(${scope(node)} && ${field(node, 'active')} === true
    && (${['owner', 'deputy', 'temporary', 'receptionist'].map((role) => `${field(node, 'role')} === '${role}'`).join(' || ')})
    && ${child(node, 'revision')}.isNumber() && ${integer(field(node, 'revision'), 1)}
    && ${child(node, 'startsAt')}.isNumber() && ${child(node, 'endsAt')}.isNumber()
    && ${field(node, 'startsAt')} <= now && now < ${field(node, 'endsAt')})`;
}

/** 役割に対応する本人の認証方式を検査するRules式を作る。 */
function provider(role, providerExpression) {
  return `((${field(role, 'role')} === 'owner' || ${field(role, 'role')} === 'deputy')
    ? ${providerExpression} === 'google.com' : ${providerExpression} === 'password')`;
}

/** 本人と端末の結合・現在役割と期限を検査する共通Rules式を作る。 */
export function currentAuthorization() {
  return `(auth != null && auth.token.firebase.sign_in_provider === 'anonymous'
    && ${scope(ownDevice)} && ${scope(ownSession)}
    && ${field(ownDevice, 'schemaVersion')} === 2 && ${field(ownSession, 'schemaVersion')} === 2
    && ${field(ownDevice, 'deviceUid')} === auth.uid && ${field(ownSession, 'deviceUid')} === auth.uid
    && ${field(ownDevice, 'humanUid')} !== auth.uid
    && ${field(ownDevice, 'humanUid')} === ${field(ownSession, 'humanUid')}
    && ${field(ownDevice, 'active')} === true && ${field(ownDevice, 'approved')} === true
    && ${field(ownDevice, 'retired')} === false
    && ${field(ownSession, 'active')} === true && ${field(ownSession, 'emailVerified')} === true
    && ${child(ownSession, 'issuedAt')}.isNumber() && ${child(ownSession, 'expiresAt')}.isNumber()
    && ${field(ownSession, 'issuedAt')} <= now && now < ${field(ownSession, 'expiresAt')}
    && ${field(ownSession, 'humanAuthTime')} <= ${field(ownSession, 'issuedAt')}
    && ${field(ownSession, 'expiresAt')} <= ${field(ownSession, 'issuedAt')} + 43200000
    && ${roleValid(ownRole)} && ${provider(ownRole, field(ownSession, 'authProvider'))}
    && ((${field(ownRole, 'role')} === 'owner' || ${field(ownRole, 'role')} === 'deputy')
      || now < ${field(`${root}.child('control')`, 'staffDeadline')}))`;
}

/** 現在認可に加えて、端末と本人証跡の準備版を検査する式を作る。 */
export function preparedAuthorization() {
  return `(${currentAuthorization()} && ${field(ownDevice, 'preparedRoleRevision')} === ${field(ownRole, 'revision')}
    && ${field(ownSession, 'roleRevision')} === ${field(ownRole, 'revision')}
    && ${field(ownDevice, 'preparedRole')} === ${field(ownRole, 'role')})`;
}

/** 必須項目と許可・拒否の条件を持つ、厳密なレコード規則を作る。 */
function strictRecord(fields, read, write) {
  return {
    '.read': read,
    '.write': `newData.exists() && newData.hasChildren(${JSON.stringify(fields)}) && (${write})`,
    ...Object.fromEntries(fields.map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };
}

/** 本人証跡と役割・端末管理の、公演内の規則を組み立てる。 */
export function authorizationRules() {
  const selectedDevice = `${root}.child('devices').child($deviceUid)`;
  const humanRole = `${root}.child('roles').child(auth.uid)`;
  const n = 'newData';
  const fields = [
    'schemaVersion',
    'environmentId',
    'performanceId',
    'deviceUid',
    'humanUid',
    'active',
    'emailVerified',
    'authProvider',
    'roleRevision',
    'revision',
    'issuedAt',
    'expiresAt',
    'humanAuthTime',
  ];
  const humanProvider =
    "(auth.token.firebase.sign_in_provider === 'google.com' || auth.token.firebase.sign_in_provider === 'password')";
  const boundHuman = `auth != null && ${humanProvider} && ${field(selectedDevice, 'humanUid')} === auth.uid
    && ${scope(selectedDevice)} && ${field(selectedDevice, 'deviceUid')} === $deviceUid`;
  const issue = `${boundHuman} && auth.token.email_verified === true && ${roleValid(humanRole)}
    && ${provider(humanRole, 'auth.token.firebase.sign_in_provider')}
    && ${field(selectedDevice, 'active')} === true && ${field(selectedDevice, 'approved')} === true
    && ${field(selectedDevice, 'retired')} === false
    && ${scope(n)} && ${field(n, 'schemaVersion')} === 2
    && ${field(n, 'humanUid')} === auth.uid && ${field(n, 'deviceUid')} === $deviceUid
    && auth.uid !== $deviceUid && ${field(n, 'active')} === true && ${field(n, 'emailVerified')} === true
    && ${field(n, 'authProvider')} === auth.token.firebase.sign_in_provider
    && ${field(n, 'roleRevision')} === ${field(humanRole, 'revision')}
    && ${integer(field(n, 'revision'), 1)} && ${integer(field(n, 'roleRevision'), 1)}
    && ${field(n, 'revision')} === (data.exists() ? data.child('revision').val() + 1 : 1)
    && ${field(n, 'issuedAt')} === now
    && ${field(n, 'humanAuthTime')} === auth.token.auth_time * 1000
    && ${field(n, 'humanAuthTime')} <= now
    && ${child(n, 'expiresAt')}.isNumber() && ${field(n, 'expiresAt')} > now && ${integer(field(n, 'expiresAt'), 1)}
    && ${field(n, 'expiresAt')} <= now + 43200000
    && ${field(n, 'expiresAt')} <= ${field(humanRole, 'endsAt')}`;
  const immutable = fields
    .filter((key) => key !== 'active' && key !== 'revision')
    .map((key) => `${field(n, key)} === ${field('data', key)}`)
    .join(' && ');
  const revoke = `${boundHuman} && data.exists() && ${field('data', 'humanUid')} === auth.uid
    && ${field(n, 'active')} === false && ${integer(field(n, 'revision'), 1)}
    && ${field(n, 'revision')} === ${field('data', 'revision')} + 1 && ${immutable}`;
  const ownMetadata = `auth != null && ((auth.uid === $deviceUid && auth.token.firebase.sign_in_provider === 'anonymous')
    || (${boundHuman}))`;
  const roleRead = `auth != null && ((auth.uid === $humanUid && ${humanProvider})
    || (auth.token.firebase.sign_in_provider === 'anonymous' && ${field(ownDevice, 'humanUid')} === $humanUid
      && ${scope(ownDevice)} && ${field(ownDevice, 'deviceUid')} === auth.uid))`;
  const profileRead = `${currentAuthorization()} && ${field(ownRole, 'humanUid')} === $humanUid
    && ${field(ownRole, 'role')} === 'temporary' && ${field(ownRole, 'revision')} + '' === $roleVersion`;
  const { manager, ...managementRules } = roleManagementRules({
    root,
    preparedAuthorization,
    roleRead,
    profileRead,
  });
  const { roleWrite, ownerUidWrite, pointerWrite, ...handoverRules } = ownerHandoverRules({
    root,
    preparedAuthorization,
    manager,
  });

  managementRules.roles.$humanUid['.write'] =
    `(${managementRules.roles.$humanUid['.write']}) || (${roleWrite})`;

  const { pendingDeviceWrite, ...registrationRules } = deviceRegistrationRules({
    root,
    manager,
    roleValid,
    provider,
  });
  const deviceRules = deviceManagementRules({
    root,
    manager,
    ownMetadata,
    roleValid,
    /** 端末に結んだ本人証明が、現在役割に一致するか検査する式を返す。 */
    registrationProof: (device, role) => registrationProofValid(root, device, role, provider),
  });

  deviceRules.devices.$deviceUid['.write'] =
    `(${deviceRules.devices.$deviceUid['.write']}) || (${pendingDeviceWrite})`;

  const { approveDeviceWrite, ...ownerLinkRules } = ownerDeviceLinkRules({
    root,
    preparedAuthorization,
    /** 端末に結んだ本人証明が、現在役割に一致するか検査する式を返す。 */
    registrationProof: (device, role) => registrationProofValid(root, device, role, provider),
  });

  deviceRules.devices.$deviceUid['.write'] =
    `(${deviceRules.devices.$deviceUid['.write']}) || (${approveDeviceWrite})`;

  return {
    '.read': false,
    '.write': false,
    ...managementRules,
    ...handoverRules,
    ...deviceRules,
    ...registrationRules,
    ...ownerLinkRules,
    sessions: {
      $deviceUid: strictRecord(fields, ownMetadata, `(${issue}) || (${revoke})`),
    },
    control: {
      '.read': currentAuthorization(),
      '.write': false,
      ...performanceInitializationRules({ root, preparedAuthorization, integer }),
      ownerUid: { '.write': ownerUidWrite },
      ownerHandoverOperationId: { '.write': pointerWrite },
    },
  };
}

/** 環境・公演の名前空間へ、既定拒否の認可規則を配置する。 */
export function generateDatabaseRules() {
  return {
    rules: {
      '.read': false,
      '.write': false,
      environments: {
        $environmentId: {
          performances: { $performanceId: authorizationRules() },
        },
      },
    },
  };
}
