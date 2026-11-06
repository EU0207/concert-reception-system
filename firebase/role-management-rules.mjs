// DD-96・98の一体確定。許可は末端だけに置き、書込み後の役割・結果・監査を照合する。

const f = (node, key) => `${node}.child('${key}').val()`;
const c = (node, key) => `${node}.child('${key}')`;
const keys = [
  "exceptionManage",
  "manualReception",
  "arrivalCorrection",
  "seatDisplayNameEdit",
  "receptionConflictResolve",
  "rereadManagementMemo",
  "dayManagementRead",
  "staffNoticeManage",
  "dayAuditRead",
];
const roleFields = [
  "environmentId",
  "performanceId",
  "humanUid",
  "role",
  "active",
  "revision",
  "startsAt",
  "endsAt",
  "lastOperationId",
];
const requestFields = [
  "schemaVersion",
  "environmentId",
  "performanceId",
  "operationId",
  "actorUid",
  "actorDeviceUid",
  "targetUid",
  "expectedRevision",
  "previousRole",
  "nextRole",
  "startsAt",
  "endsAt",
  "requestedAt",
];
const resultFields = [
  "schemaVersion",
  "environmentId",
  "performanceId",
  "status",
  "operationId",
  "actorUid",
  "actorDeviceUid",
  "targetUid",
  "expectedRevision",
  "resultingRevision",
  "kind",
  "previousRole",
  "nextRole",
  "committedAt",
];
const profileFields = [
  "schemaVersion",
  "humanUid",
  "roleVersion",
  "status",
  "validFrom",
  "validUntil",
  "permissions",
];
const permissionRequestFields = [
  "schemaVersion",
  "environmentId",
  "performanceId",
  "operationId",
  "actorUid",
  "actorDeviceUid",
  "targetUid",
  "expectedRevision",
  "validFrom",
  "validUntil",
  "revoke",
  "permissions",
  "requestedAt",
];

function record(fields, read, write) {
  return {
    ".read": read,
    ".write": `newData.exists() && newData.hasChildren(${JSON.stringify(fields)}) && (${write})`,
    ...Object.fromEntries(fields.map((key) => [key, { ".validate": true }])),
    $other: { ".validate": false },
  };
}

function scope(node) {
  return `${f(node, "environmentId")} === $environmentId && ${f(node, "performanceId")} === $performanceId`;
}

function integer(node, key, min = 0) {
  return `${c(node, key)}.isNumber() && ${f(node, key)} >= ${min}
    && ${f(node, key)} % 1 === 0 && ${f(node, key)} <= 9007199254740991`;
}

function equalFields(a, b, fields) {
  return fields.map((key) => `${f(a, key)} === ${f(b, key)}`).join(" && ");
}

/** rootは変更前、postは同じ公演の一体更新後。必要な経路を相互に検査する。 */
export function roleManagementRules({
  root,
  preparedAuthorization,
  roleRead,
  profileRead,
}) {
  const ownDevice = `${root}.child('devices').child(auth.uid)`;
  const ownSession = `${root}.child('sessions').child(auth.uid)`;
  const ownRole = `${root}.child('roles').child(${f(ownDevice, "humanUid")})`;
  const manager = `(${preparedAuthorization()} && (${f(ownRole, "role")} === 'owner' || ${f(ownRole, "role")} === 'deputy'))`;
  const recent = `(${manager} && ${f(ownSession, "humanAuthTime")} <= now
    && now - ${f(ownSession, "humanAuthTime")} <= 900000)`;
  const role = (base, uid) => `${base}.child('roles').child(${uid})`;
  const profile = (base, uid, version) =>
    `${base}.child('temporaryPermissionProfiles').child(${uid}).child(${version} + '')`;
  const targetActive = (
    target,
  ) => `(${scope(target)} && ${f(target, "active")} === true
    && ${f(target, "startsAt")} <= now && now < ${f(target, "endsAt")})`;
  const permissionsValid = (node) =>
    `${node}.hasChildren(${JSON.stringify(keys)}) && ` +
    keys.map((key) => `${c(node, key)}.isBoolean()`).join(" && ");
  const permissionsSchema = {
    ...Object.fromEntries(
      keys.map((key) => [key, { ".validate": "newData.isBoolean()" }]),
    ),
    $other: { ".validate": false },
  };

  function allowedRoles(target, next) {
    const old = f(target, "role");
    return `(${old} !== ${next} && ${old} !== 'owner' && ${next} !== 'owner'
      && (${["deputy", "temporary", "receptionist"].map((value) => `${next} === '${value}'`).join(" || ")})
      && (${f(ownRole, "role")} === 'owner' || ((${old} === 'temporary' || ${old} === 'receptionist')
        && (${next} === 'temporary' || ${next} === 'receptionist'))))`;
  }

  function requestValid(request, operationId) {
    const target = role(root, f(request, "targetUid"));
    return `${recent} && ${scope(request)} && ${f(request, "schemaVersion")} === 1
      && ${f(request, "operationId")} === ${operationId}
      && ${f(request, "actorUid")} === ${f(ownRole, "humanUid")} && ${f(request, "actorDeviceUid")} === auth.uid
      && ${targetActive(target)} && ${f(target, "humanUid")} === ${f(request, "targetUid")}
      && ${f(request, "expectedRevision")} === ${f(target, "revision")}
      && ${f(request, "previousRole")} === ${f(target, "role")}
      && ${allowedRoles(target, f(request, "nextRole"))}
      && ${integer(request, "startsAt")} && ${integer(request, "endsAt", 1)}
      && ${f(request, "startsAt")} < ${f(request, "endsAt")} && now < ${f(request, "endsAt")}
      && (${f(request, "nextRole")} === 'deputy' || ${f(request, "endsAt")} <= ${f(`${root}.child('control')`, "staffDeadline")})`;
  }

  function profileValid(node, nextRole) {
    return `${node}.exists() && ${node}.hasChildren(${JSON.stringify(profileFields)})
      && ${f(node, "schemaVersion")} === 1 && ${f(node, "humanUid")} === ${f(nextRole, "humanUid")}
      && ${f(node, "roleVersion")} === ${f(nextRole, "revision")}
      && (${f(node, "status")} === 'active' || ${f(node, "status")} === 'revoked')
      && ${integer(node, "validFrom")} && ${integer(node, "validUntil", 1)}
      && ${f(nextRole, "startsAt")} <= ${f(node, "validFrom")}
      && ${f(node, "validFrom")} < ${f(node, "validUntil")} && now < ${f(node, "validUntil")}
      && ${f(node, "validUntil")} <= ${f(nextRole, "endsAt")}
      && ${f(node, "validUntil")} <= ${f(`${root}.child('control')`, "staffDeadline")}
      && ${permissionsValid(c(node, "permissions"))}
      && (${f(node, "status")} !== 'revoked' || (${keys.map((key) => `${f(c(node, "permissions"), key)} === false`).join(" && ")}))`;
  }

  function permissionRequestValid(request, operationId) {
    const target = role(root, f(request, "targetUid"));
    return `${recent} && ${scope(request)} && ${f(request, "schemaVersion")} === 1
      && ${f(request, "operationId")} === ${operationId} && ${f(request, "actorDeviceUid")} === auth.uid
      && ${f(request, "actorUid")} === ${f(ownRole, "humanUid")}
      && ${f(request, "targetUid")} !== ${f(ownRole, "humanUid")}
      && ${targetActive(target)} && ${f(target, "role")} === 'temporary'
      && ${f(request, "expectedRevision")} === ${f(target, "revision")}
      && ${integer(request, "validFrom")} && ${integer(request, "validUntil", 1)}
      && ${f(target, "startsAt")} <= ${f(request, "validFrom")}
      && ${f(request, "validFrom")} < ${f(request, "validUntil")} && now < ${f(request, "validUntil")}
      && ${f(request, "validUntil")} <= ${f(target, "endsAt")}
      && ${f(request, "validUntil")} <= ${f(`${root}.child('control')`, "staffDeadline")}
      && ${c(request, "revoke")}.isBoolean() && ${permissionsValid(c(request, "permissions"))}`;
  }

  // 結果側から役割・監査の同時存在を検査し、役割側も同じ結果を参照する。
  function committed(post, operationId, kind) {
    const result = `${post}.child('${kind === "roleChange" ? "roleChangeResults" : "temporaryPermissionOperations"}').child(${operationId})`;
    const oldResult = `${root}.child('${kind === "roleChange" ? "roleChangeResults" : "temporaryPermissionOperations"}').child(${operationId})`;
    const request =
      kind === "roleChange"
        ? `${root}.child('roleChangeRequests').child(${operationId})`
        : c(result, "request");
    const body = kind === "roleChange" ? result : c(result, "result");
    const uid = f(body, "targetUid"),
      before = role(root, uid),
      after = role(post, uid);
    const newProfile = profile(post, uid, f(after, "revision"));
    const audit = `${post}.child('authorizationAudit').child(${operationId})`;
    const oldAudit = `${root}.child('authorizationAudit').child(${operationId})`;
    const acceptance = `${root}.child('roleChangeAcceptances').child(${operationId})`;
    const google = `(${f(request, "nextRole")} !== 'deputy' || (${acceptance}.exists()
      && ${scope(acceptance)} && ${f(acceptance, "schemaVersion")} === 1
      && ${f(acceptance, "operationId")} === ${operationId} && ${f(acceptance, "targetUid")} === ${uid}
      && ${f(acceptance, "expectedRevision")} === ${f(before, "revision")}
      && ${f(acceptance, "provider")} === 'google.com' && ${f(acceptance, "authenticatedAt")} <= now
      && now - ${f(acceptance, "authenticatedAt")} <= 900000))`;
    const changed =
      kind === "roleChange"
        ? `${requestValid(request, operationId)} && ${google}
        && ${f(after, "role")} === ${f(request, "nextRole")}
        && ${equalFields(after, request, ["startsAt", "endsAt"])}
        && (${f(after, "role")} !== 'temporary' || (${profileValid(newProfile, after)}
          && ${f(newProfile, "status")} === 'active' && ${f(newProfile, "validFrom")} === ${f(after, "startsAt")}
          && ${f(newProfile, "validUntil")} === ${f(after, "endsAt")}))`
        : `${permissionRequestValid(request, operationId)} && ${equalFields(after, before, ["role", "startsAt", "endsAt"])}
        && ${profileValid(newProfile, after)} && ${equalFields(newProfile, request, ["validFrom", "validUntil"])}
        && (${f(request, "revoke")} === true ? ${f(newProfile, "status")} === 'revoked'
          : (${f(newProfile, "status")} === 'active' && ${equalFields(c(newProfile, "permissions"), c(request, "permissions"), keys)}))`;
    return `(${recent} && !${oldResult}.exists() && !${oldAudit}.exists()
      && ${body}.exists() && ${body}.hasChildren(${JSON.stringify(resultFields)})
      && ${scope(body)} && ${f(body, "schemaVersion")} === 1 && ${f(body, "status")} === 'committed'
      && ${f(body, "kind")} === '${kind}' && ${f(body, "operationId")} === ${operationId}
      && ${f(body, "actorUid")} === ${f(ownRole, "humanUid")} && ${f(body, "actorDeviceUid")} === auth.uid
      && ${f(body, "expectedRevision")} === ${f(before, "revision")}
      && ${f(body, "resultingRevision")} === ${f(before, "revision")} + 1
      && ${f(body, "previousRole")} === ${f(before, "role")} && ${f(body, "nextRole")} === ${f(after, "role")}
      && ${f(body, "committedAt")} === now
      && ${after}.hasChildren(${JSON.stringify(roleFields)}) && ${scope(after)}
      && ${f(after, "humanUid")} === ${uid} && ${f(after, "active")} === true
      && ${integer(after, "revision", 1)} && ${f(after, "revision")} === ${f(body, "resultingRevision")}
      && ${f(after, "lastOperationId")} === ${operationId}
      && ${changed} && ${audit}.exists() && ${equalFields(audit, body, resultFields)})`;
  }

  // 役割以外の末端は、必ず同じ役割更新を要求する。許可表は役割側で評価する。
  function boundCommit(post, operationId, kind) {
    const path =
      kind === "roleChange"
        ? "roleChangeResults"
        : "temporaryPermissionOperations";
    const record = `${post}.child('${path}').child(${operationId})`;
    const body = kind === "roleChange" ? record : c(record, "result");
    const uid = f(body, "targetUid"),
      before = role(root, uid),
      after = role(post, uid);
    const audit = `${post}.child('authorizationAudit').child(${operationId})`;
    return `(${recent} && !${root}.child('${path}').child(${operationId}).exists()
      && !${root}.child('authorizationAudit').child(${operationId}).exists()
      && ${body}.hasChildren(${JSON.stringify(resultFields)}) && ${scope(body)}
      && ${f(body, "schemaVersion")} === 1 && ${f(body, "status")} === 'committed'
      && ${f(body, "kind")} === '${kind}' && ${f(body, "operationId")} === ${operationId}
      && ${f(body, "actorUid")} === ${f(ownRole, "humanUid")} && ${f(body, "actorDeviceUid")} === auth.uid
      && ${f(body, "expectedRevision")} === ${f(before, "revision")}
      && ${f(body, "resultingRevision")} === ${f(before, "revision")} + 1
      && ${f(after, "humanUid")} === ${uid} && ${f(after, "revision")} === ${f(body, "resultingRevision")}
      && ${f(after, "lastOperationId")} === ${operationId}
      && ${f(body, "previousRole")} === ${f(before, "role")} && ${f(body, "nextRole")} === ${f(after, "role")}
      && ${f(body, "committedAt")} === now && ${audit}.exists() && ${equalFields(audit, body, resultFields)})`;
  }
  const anyCommit = (post, operationId, targetUid, full = false) => {
    const bound = (kind, path) =>
      `(${full ? committed(post, operationId, kind) : boundCommit(post, operationId, kind)} ${
        targetUid
          ? `&& ${f(`${post}.child('${path}').child(${operationId})${kind === "permissionChange" ? ".child('result')" : ""}`, "targetUid")} === ${targetUid}`
          : ""
      })`;
    return `(${bound("roleChange", "roleChangeResults")} || ${bound("permissionChange", "temporaryPermissionOperations")})`;
  };
  const rolePost = "newData.parent().parent()";
  const roleWrite =
    `${f("newData", "humanUid")} === $humanUid && ` +
    anyCommit(rolePost, f("newData", "lastOperationId"), "$humanUid", true);
  const requestRead = `${manager} || (auth != null && auth.token.email_verified === true
    && auth.uid === data.child('targetUid').val()
    && (auth.token.firebase.sign_in_provider === 'google.com' || auth.token.firebase.sign_in_provider === 'password'))`;
  const acceptanceRequest = `${root}.child('roleChangeRequests').child($operationId)`;
  const acceptance = record(
    [
      "schemaVersion",
      "environmentId",
      "performanceId",
      "operationId",
      "targetUid",
      "expectedRevision",
      "provider",
      "authenticatedAt",
    ],
    `${manager} || (auth != null && auth.uid === data.child('targetUid').val())`,
    `!data.exists() && auth != null && auth.token.email_verified === true
      && auth.token.firebase.sign_in_provider === 'google.com' && ${scope("newData")}
      && newData.child('schemaVersion').val() === 1 && newData.child('operationId').val() === $operationId
      && newData.child('targetUid').val() === auth.uid && newData.child('provider').val() === 'google.com'
      && newData.child('expectedRevision').val() === ${f(acceptanceRequest, "expectedRevision")}
      && ${f(acceptanceRequest, "targetUid")} === auth.uid && ${f(acceptanceRequest, "nextRole")} === 'deputy'
      && ${f(role(root, "auth.uid"), "revision")} === ${f(acceptanceRequest, "expectedRevision")}
      && !${root}.child('roleChangeResults').child($operationId).exists()
      && newData.child('authenticatedAt').val() === auth.token.auth_time * 1000
      && auth.token.auth_time * 1000 <= now && now - auth.token.auth_time * 1000 <= 900000`,
  );
  const newProfile = record(
    profileFields,
    `${manager} || (${profileRead})`,
    `!data.exists() && newData.child('humanUid').val() === $humanUid
      && newData.child('roleVersion').val() + '' === $roleVersion
      && ${profileValid("newData", role("newData.parent().parent().parent()", "$humanUid"))}
      && ${anyCommit("newData.parent().parent().parent()", f(role("newData.parent().parent().parent()", "$humanUid"), "lastOperationId"), "$humanUid")}`,
  );
  newProfile.permissions = {
    ".validate": permissionsValid("newData"),
    ...permissionsSchema,
  };
  const operation = record(
    ["request", "result"],
    manager,
    `!data.exists() && ${boundCommit("newData.parent().parent()", "$operationId", "permissionChange")}`,
  );
  operation.request = {
    ".validate": `newData.hasChildren(${JSON.stringify(permissionRequestFields)})
    && newData.child('requestedAt').isNumber() && newData.child('requestedAt').val() <= now`,
    ...Object.fromEntries(
      permissionRequestFields.map((key) => [key, { ".validate": true }]),
    ),
    $other: { ".validate": false },
  };
  operation.request.permissions = {
    ".validate": permissionsValid("newData"),
    ...permissionsSchema,
  };
  operation.result = {
    ".validate": `newData.hasChildren(${JSON.stringify(resultFields)})`,
    ...Object.fromEntries(
      resultFields.map((key) => [key, { ".validate": true }]),
    ),
    $other: { ".validate": false },
  };

  return {
    manager,
    roles: {
      ".read": manager,
      $humanUid: record(roleFields, `${roleRead} || ${manager}`, roleWrite),
    },
    roleChangeRequests: {
      $operationId: record(
        requestFields,
        requestRead,
        `!data.exists() && ${requestValid("newData", "$operationId")}
        && newData.child('requestedAt').val() === now
        && !${root}.child('roleChangeResults').child($operationId).exists()`,
      ),
    },
    roleChangeAcceptances: { $operationId: acceptance },
    roleChangeResults: {
      $operationId: record(
        resultFields,
        manager,
        `!data.exists() && ${boundCommit("newData.parent().parent()", "$operationId", "roleChange")}`,
      ),
    },
    temporaryPermissionProfiles: { $humanUid: { $roleVersion: newProfile } },
    temporaryPermissionOperations: { $operationId: operation },
    authorizationAudit: {
      ".read": manager,
      $operationId: record(
        resultFields,
        manager,
        `!data.exists() && ${anyCommit("newData.parent().parent()", "$operationId")}`,
      ),
    },
  };
}
