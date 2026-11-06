// 製品の認可境界を生成する。本人の証跡だけを書かせ、業務経路は既定で拒否する。

import { roleManagementRules } from "./role-management-rules.mjs";

const field = (node, key) => `${node}.child('${key}').val()`;
const child = (node, key) => `${node}.child('${key}')`;
const root =
  "root.child('environments').child($environmentId).child('performances').child($performanceId)";
const ownDevice = `${root}.child('devices').child(auth.uid)`;
const ownSession = `${root}.child('sessions').child(auth.uid)`;
const ownRole = `${root}.child('roles').child(${field(ownDevice, "humanUid")})`;

function scope(node) {
  return `${field(node, "environmentId")} === $environmentId && ${field(node, "performanceId")} === $performanceId`;
}

function integer(expression, minimum = 0) {
  return `(${expression} >= ${minimum} && ${expression} % 1 === 0 && ${expression} <= 9007199254740991)`;
}

function roleValid(node) {
  return `(${scope(node)} && ${field(node, "active")} === true
    && (${["owner", "deputy", "temporary", "receptionist"].map((role) => `${field(node, "role")} === '${role}'`).join(" || ")})
    && ${child(node, "revision")}.isNumber() && ${integer(field(node, "revision"), 1)}
    && ${child(node, "startsAt")}.isNumber() && ${child(node, "endsAt")}.isNumber()
    && ${field(node, "startsAt")} <= now && now < ${field(node, "endsAt")})`;
}

function provider(role, providerExpression) {
  return `((${field(role, "role")} === 'owner' || ${field(role, "role")} === 'deputy')
    ? ${providerExpression} === 'google.com' : ${providerExpression} === 'password')`;
}

/** 保存アダプターが接続する業務経路でも再利用する、現在認可の共通式。 */
export function currentAuthorization() {
  return `(auth != null && auth.token.firebase.sign_in_provider === 'anonymous'
    && ${scope(ownDevice)} && ${scope(ownSession)}
    && ${field(ownDevice, "schemaVersion")} === 2 && ${field(ownSession, "schemaVersion")} === 2
    && ${field(ownDevice, "deviceUid")} === auth.uid && ${field(ownSession, "deviceUid")} === auth.uid
    && ${field(ownDevice, "humanUid")} !== auth.uid
    && ${field(ownDevice, "humanUid")} === ${field(ownSession, "humanUid")}
    && ${field(ownDevice, "active")} === true && ${field(ownDevice, "approved")} === true
    && ${field(ownDevice, "retired")} === false
    && ${field(ownSession, "active")} === true && ${field(ownSession, "emailVerified")} === true
    && ${child(ownSession, "issuedAt")}.isNumber() && ${child(ownSession, "expiresAt")}.isNumber()
    && ${field(ownSession, "issuedAt")} <= now && now < ${field(ownSession, "expiresAt")}
    && ${field(ownSession, "humanAuthTime")} <= ${field(ownSession, "issuedAt")}
    && ${field(ownSession, "expiresAt")} <= ${field(ownSession, "issuedAt")} + 43200000
    && ${roleValid(ownRole)} && ${provider(ownRole, field(ownSession, "authProvider"))})`;
}

/** 準備完了が必要な業務操作向け。本人証跡の作成とは分ける。 */
export function preparedAuthorization() {
  return `(${currentAuthorization()} && ${field(ownDevice, "preparedRoleRevision")} === ${field(ownRole, "revision")}
    && ${field(ownSession, "roleRevision")} === ${field(ownRole, "revision")}
    && ${field(ownDevice, "preparedRole")} === ${field(ownRole, "role")})`;
}

function strictRecord(fields, read, write) {
  return {
    ".read": read,
    ".write": `newData.exists() && newData.hasChildren(${JSON.stringify(fields)}) && (${write})`,
    ...Object.fromEntries(fields.map((key) => [key, { ".validate": true }])),
    $other: { ".validate": false },
  };
}

export function authorizationRules() {
  const selectedDevice = `${root}.child('devices').child($deviceUid)`;
  const humanRole = `${root}.child('roles').child(auth.uid)`;
  const n = "newData";
  const fields = [
    "schemaVersion",
    "environmentId",
    "performanceId",
    "deviceUid",
    "humanUid",
    "active",
    "emailVerified",
    "authProvider",
    "roleRevision",
    "revision",
    "issuedAt",
    "expiresAt",
    "humanAuthTime",
  ];
  const humanProvider =
    "(auth.token.firebase.sign_in_provider === 'google.com' || auth.token.firebase.sign_in_provider === 'password')";
  const boundHuman = `auth != null && ${humanProvider} && ${field(selectedDevice, "humanUid")} === auth.uid
    && ${scope(selectedDevice)} && ${field(selectedDevice, "deviceUid")} === $deviceUid`;
  const issue = `${boundHuman} && auth.token.email_verified === true && ${roleValid(humanRole)}
    && ${provider(humanRole, "auth.token.firebase.sign_in_provider")}
    && ${field(selectedDevice, "active")} === true && ${field(selectedDevice, "approved")} === true
    && ${field(selectedDevice, "retired")} === false
    && ${scope(n)} && ${field(n, "schemaVersion")} === 2
    && ${field(n, "humanUid")} === auth.uid && ${field(n, "deviceUid")} === $deviceUid
    && auth.uid !== $deviceUid && ${field(n, "active")} === true && ${field(n, "emailVerified")} === true
    && ${field(n, "authProvider")} === auth.token.firebase.sign_in_provider
    && ${field(n, "roleRevision")} === ${field(humanRole, "revision")}
    && ${integer(field(n, "revision"), 1)} && ${integer(field(n, "roleRevision"), 1)}
    && ${field(n, "revision")} === (data.exists() ? data.child('revision').val() + 1 : 1)
    && ${field(n, "issuedAt")} === now
    && ${field(n, "humanAuthTime")} === auth.token.auth_time * 1000
    && ${field(n, "humanAuthTime")} <= now
    && ${child(n, "expiresAt")}.isNumber() && ${field(n, "expiresAt")} > now && ${integer(field(n, "expiresAt"), 1)}
    && ${field(n, "expiresAt")} <= now + 43200000
    && ${field(n, "expiresAt")} <= ${field(humanRole, "endsAt")}`;
  const immutable = fields
    .filter((key) => key !== "active" && key !== "revision")
    .map((key) => `${field(n, key)} === ${field("data", key)}`)
    .join(" && ");
  const revoke = `${boundHuman} && data.exists() && ${field("data", "humanUid")} === auth.uid
    && ${field(n, "active")} === false && ${integer(field(n, "revision"), 1)}
    && ${field(n, "revision")} === ${field("data", "revision")} + 1 && ${immutable}`;
  const ownMetadata = `auth != null && ((auth.uid === $deviceUid && auth.token.firebase.sign_in_provider === 'anonymous')
    || (${boundHuman}))`;
  const roleRead = `auth != null && ((auth.uid === $humanUid && ${humanProvider})
    || (auth.token.firebase.sign_in_provider === 'anonymous' && ${field(ownDevice, "humanUid")} === $humanUid
      && ${scope(ownDevice)} && ${field(ownDevice, "deviceUid")} === auth.uid))`;
  const profileRead = `${currentAuthorization()} && ${field(ownRole, "humanUid")} === $humanUid
    && ${field(ownRole, "role")} === 'temporary' && ${field(ownRole, "revision")} + '' === $roleVersion`;
  const { manager, ...managementRules } = roleManagementRules({
    root,
    preparedAuthorization,
    roleRead,
    profileRead,
  });
  return {
    ".read": false,
    ".write": false,
    ...managementRules,
    devices: { $deviceUid: { ".read": ownMetadata, ".write": false } },
    sessions: {
      $deviceUid: strictRecord(
        fields,
        ownMetadata,
        `(${issue}) || (${revoke})`,
      ),
    },
    control: { ".read": currentAuthorization(), ".write": false },
  };
}

export function generateDatabaseRules() {
  return {
    rules: {
      ".read": false,
      ".write": false,
      environments: {
        $environmentId: {
          performances: { $performanceId: authorizationRules() },
        },
      },
    },
  };
}
