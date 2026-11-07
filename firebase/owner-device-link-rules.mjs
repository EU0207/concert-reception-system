// 主担当の追加端末リンクと所持確認、承認と監査のRTDB規則を生成する。

/** 指定した子キーの値を参照するRules式を作る。 */
const f = (node, key) => `${node}.child('${key}').val()`;

/** 環境IDと公演IDの一致を検査するRules式を作る。 */
const scope = (node) =>
  `${f(node, 'environmentId')} === $environmentId && ${f(node, 'performanceId')} === $performanceId`;

/** 指定した各項目が変更前後で一致するRules式を作る。 */
const same = (a, b, keys) => keys.map((key) => `${f(a, key)} === ${f(b, key)}`).join(' && ');

const fixedFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'purpose',
  'ownerUid',
  'ownerRoleRevision',
  'issuerDeviceUid',
  'targetDeviceUid',
  'storageEpoch',
  'issuedAt',
  'expiresAt',
];
const linkFields = [...fixedFields, 'status', 'revision'];
const readerFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'linkDigest',
  'ownerUid',
  'targetDeviceUid',
  'storageEpoch',
  'readAt',
];
const auditFields = [...fixedFields, 'event', 'recordedAt', 'reporterDeviceUid'];
const resultFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'linkDigest',
  'ownerUid',
  'issuerDeviceUid',
  'targetDeviceUid',
  'storageEpoch',
  'status',
  'expectedRevision',
  'resultingRevision',
  'approvedAt',
];
const issueFields = [
  'schemaVersion',
  'environmentId',
  'performanceId',
  'operationId',
  'linkDigest',
  'ownerUid',
  'issuerDeviceUid',
  'targetDeviceUid',
  'storageEpoch',
  'issuedAt',
];

/** 識別子がUUID v4形式か検査するRules式を作る。 */
const uuid = (expression) =>
  `${expression}.matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)`;

/** 必須項目と許可・拒否の条件を持つ、厳密なレコード規則を作る。 */
function record(fields, read, write, optional = []) {
  return {
    '.read': read,
    '.write': `newData.exists() && newData.hasChildren(${JSON.stringify(fields)}) && (${write})`,
    ...Object.fromEntries([...fields, ...optional].map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };
}

/** 主担当の追加端末リンク・読取り証跡と承認の規則を作る。 */
export function ownerDeviceLinkRules({ root, preparedAuthorization, registrationProof }) {
  const ownDevice = `${root}.child('devices').child(auth.uid)`;
  const owner = `${root}.child('roles').child(${f(`${root}.child('control')`, 'ownerUid')})`;
  const ownSession = `${root}.child('sessions').child(auth.uid)`;
  const ownerAuthority = `(${preparedAuthorization()} && ${f(owner, 'role')} === 'owner'
    && ${f(ownDevice, 'humanUid')} === ${f(owner, 'humanUid')}
    && ${f(ownSession, 'humanAuthTime')} <= now && now - ${f(ownSession, 'humanAuthTime')} <= 900000)`;

  /** リンクの照合値に対応する台帳を参照する式を作る。 */
  const linkAt = (base, digest) => `${base}.child('ownerDeviceLinks').child(${digest})`;

  /** 端末と操作IDに対応する読取り証跡の参照式を作る。 */
  const readerAt = (base, uid, id) =>
    `${base}.child('ownerDeviceLinkReaders').child(${uid}).child(${id})`;

  /** リンクと処理区分に対応する監査の参照式を作る。 */
  const auditAt = (base, digest, event) =>
    `${base}.child('ownerDeviceLinkAudit').child(${digest}).child('${event}')`;

  /** 追加対象の端末が未準備・承認待ちか検査する式を作る。 */
  const pending = (
    device,
  ) => `${scope(device)} && ${f(device, 'schemaVersion')} === 2 && ${f(device, 'active')} === false
    && ${f(device, 'approved')} === false && ${f(device, 'retired')} === false && ${f(device, 'revision')} === 1
    && ${f(device, 'preparedRole')} === null && ${f(device, 'preparedRoleRevision')} === 0
    && !${device}.child('lastOperationId').exists()`;

  /** 対象端末の登録証明と、15分以内のGoogle再認証を検査する。 */
  const recentProof = (device) => `${registrationProof(device, owner)}
    && ${f(`${root}.child('deviceRegistrationProofs').child(${f(device, 'deviceUid')})`, 'humanAuthTime')} <= now
    && now - ${f(`${root}.child('deviceRegistrationProofs').child(${f(device, 'deviceUid')})`, 'humanAuthTime')} <= 900000`;

  /** 認証済みの端末がリンクの登録対象と一致するか検査する。 */
  const targetRead = (link) => `auth != null && auth.token.firebase.sign_in_provider === 'anonymous'
    && auth.uid === ${f(link, 'targetDeviceUid')} && ${scope(ownDevice)}
    && ${f(ownDevice, 'humanUid')} === ${f(link, 'ownerUid')} && ${f(ownDevice, 'storageEpoch')} === ${f(link, 'storageEpoch')}`;

  /** 発行元端末と本人証跡が、現在も有効で準備済みか検査する。 */
  function issuerAvailable(link) {
    const issuer = `${root}.child('devices').child(${f(link, 'issuerDeviceUid')})`;
    const session = `${root}.child('sessions').child(${f(link, 'issuerDeviceUid')})`;

    return `${scope(issuer)} && ${f(issuer, 'humanUid')} === ${f(owner, 'humanUid')}
      && ${f(issuer, 'active')} === true && ${f(issuer, 'approved')} === true && ${f(issuer, 'retired')} === false
      && ${f(issuer, 'preparedRole')} === 'owner' && ${f(issuer, 'preparedRoleRevision')} === ${f(owner, 'revision')}
      && ${scope(session)} && ${f(session, 'schemaVersion')} === 2 && ${f(session, 'deviceUid')} === ${f(link, 'issuerDeviceUid')}
      && ${f(session, 'humanUid')} === ${f(owner, 'humanUid')} && ${f(session, 'active')} === true
      && ${f(session, 'emailVerified')} === true && ${f(session, 'authProvider')} === 'google.com'
      && ${f(session, 'roleRevision')} === ${f(owner, 'revision')} && ${f(session, 'issuedAt')} <= now && now < ${f(session, 'expiresAt')}`;
  }

  /** リンクの所属・対象主担当と期限・未使用状態を検査する。 */
  function validLink(link) {
    return `${scope(link)} && ${f(link, 'schemaVersion')} === 1 && ${f(link, 'purpose')} === 'owner-device'
      && ${f(link, 'status')} === 'pending' && ${f(link, 'revision')} === 1 && ${f(link, 'issuedAt')} <= now && now < ${f(link, 'expiresAt')}
      && ${f(link, 'expiresAt')} <= ${f(link, 'issuedAt')} + 900000
      && ${f(link, 'ownerUid')} === ${f(owner, 'humanUid')} && ${f(link, 'ownerRoleRevision')} === ${f(owner, 'revision')}
      && ${f(owner, 'role')} === 'owner' && ${f(owner, 'active')} === true && ${f(owner, 'startsAt')} <= now && now < ${f(owner, 'endsAt')}`;
  }

  /** 処理区分・記録者と時刻が、今回の監査へ一致するか検査する。 */
  function auditValid(post, digest, event, link) {
    const audit = auditAt(post, digest, event);

    return `${audit}.hasChildren(${JSON.stringify(auditFields)}) && ${same(audit, link, fixedFields)}
      && ${f(audit, 'event')} === '${event}' && ${f(audit, 'recordedAt')} === now && ${f(audit, 'reporterDeviceUid')} === auth.uid`;
  }

  /** リンク・発行索引と監査の一体作成を検査する式を作る。 */
  function issue(post, digest) {
    const link = linkAt(post, digest),
      target = `${root}.child('devices').child(${f(link, 'targetDeviceUid')})`;
    const index = `${post}.child('ownerDeviceLinkIssues').child(${f(link, 'operationId')})`;

    return `(${ownerAuthority} && ${digest}.matches(/^[0-9a-f]{64}$/) && !${linkAt(root, digest)}.exists()
      && !${root}.child('ownerDeviceLinkIssues').child(${f(link, 'operationId')}).exists()
      && !${auditAt(root, digest, 'issued')}.exists() && ${link}.hasChildren(${JSON.stringify(linkFields)})
      && ${validLink(link)} && ${f(link, 'issuerDeviceUid')} === auth.uid && ${f(link, 'targetDeviceUid')} !== auth.uid
      && ${uuid(f(link, 'operationId'))} && ${f(link, 'issuedAt')} === now
      && ${link}.child('expiresAt').isNumber() && ${f(link, 'expiresAt')} % 1 === 0
      && ${pending(target)} && ${f(target, 'humanUid')} === ${f(owner, 'humanUid')}
      && ${f(target, 'storageEpoch')} === ${f(link, 'storageEpoch')} && ${recentProof(target)}
      && ${index}.hasChildren(${JSON.stringify(issueFields)}) && ${f(index, 'linkDigest')} === ${digest}
      && ${same(
        index,
        link,
        issueFields.filter((key) => key !== 'linkDigest'),
      )}
      && !${link}.child('consumedAt').exists() && !${link}.child('cancelledAt').exists()
      && ${auditValid(post, digest, 'issued', link)})`;
  }

  /** 対象端末の読取り証跡と監査の一体作成を検査する式を作る。 */
  function readLink(post, digest, operationId) {
    const link = linkAt(root, digest),
      reader = readerAt(post, 'auth.uid', operationId);

    return `(${targetRead(link)} && ${pending(ownDevice)} && ${validLink(link)} && ${issuerAvailable(link)} && ${recentProof(ownDevice)}
      && ${f(link, 'operationId')} === ${operationId} && !${readerAt(root, 'auth.uid', operationId)}.exists()
      && !${auditAt(root, digest, 'read')}.exists() && ${reader}.hasChildren(${JSON.stringify(readerFields)})
      && ${scope(reader)} && ${f(reader, 'schemaVersion')} === 1 && ${f(reader, 'operationId')} === ${operationId}
      && ${f(reader, 'linkDigest')} === ${digest} && ${same(reader, link, ['ownerUid', 'targetDeviceUid', 'storageEpoch'])}
      && ${f(reader, 'readAt')} === now && ${auditValid(post, digest, 'read', link)})`;
  }

  /** 読取り証跡を照合し、リンク使用と端末承認の一体確定を検査する。 */
  function consume(post, operationId, expectedDigest) {
    const reader = readerAt(root, 'auth.uid', operationId),
      digest = f(reader, 'linkDigest');
    const before = linkAt(root, digest),
      after = linkAt(post, digest);
    const result = `${post}.child('ownerDeviceLinkResults').child(${operationId})`;
    const device = `${post}.child('devices').child(auth.uid)`;

    // 読取り証跡がない場合にchild(null)を評価すると、別の正しい分岐まで拒否されるため先に検査する。
    return `(auth != null && auth.token.firebase.sign_in_provider === 'anonymous'
      && ${reader}.exists() && ${reader}.child('linkDigest').isString()
      && ${targetRead(before)} && ${pending(ownDevice)} && ${validLink(before)} && ${issuerAvailable(before)}
      && ${recentProof(ownDevice)} && ${reader}.exists() && ${scope(reader)} && ${f(reader, 'schemaVersion')} === 1
      && ${f(reader, 'operationId')} === ${operationId} && ${f(reader, 'targetDeviceUid')} === auth.uid
      && ${f(reader, 'readAt')} <= now && ${same(reader, before, ['ownerUid', 'targetDeviceUid', 'storageEpoch'])}
      ${expectedDigest ? `&& ${digest} === ${expectedDigest}` : ''}
      && ${f(before, 'operationId')} === ${operationId}
      && !${root}.child('ownerDeviceLinkResults').child(${operationId}).exists() && !${auditAt(root, digest, 'approved')}.exists()
      && ${same(after, before, fixedFields)} && ${f(after, 'status')} === 'consumed' && ${f(after, 'revision')} === 2
      && ${f(after, 'consumedAt')} === now && !${after}.child('cancelledAt').exists()
      && ${scope(device)} && ${f(device, 'schemaVersion')} === 2 && ${same(device, ownDevice, ['deviceUid', 'humanUid', 'storageEpoch'])}
      && ${f(device, 'active')} === true && ${f(device, 'approved')} === true && ${f(device, 'retired')} === false
      && ${f(device, 'preparedRole')} === null && ${f(device, 'preparedRoleRevision')} === 0
      && ${f(device, 'revision')} === 2 && ${f(device, 'lastOperationId')} === ${operationId}
      && ${result}.hasChildren(${JSON.stringify(resultFields)}) && ${scope(result)} && ${f(result, 'schemaVersion')} === 1
      && ${f(result, 'operationId')} === ${operationId} && ${f(result, 'linkDigest')} === ${digest}
      && ${same(result, before, ['ownerUid', 'issuerDeviceUid', 'targetDeviceUid', 'storageEpoch'])}
      && ${f(result, 'status')} === 'approved' && ${f(result, 'expectedRevision')} === 1 && ${f(result, 'resultingRevision')} === 2
      && ${f(result, 'approvedAt')} === now && ${auditValid(post, digest, 'approved', after)})`;
  }

  /** 発行元によるリンク取消しと監査の一体更新を検査する。 */
  function cancel(post, digest) {
    const before = linkAt(root, digest),
      after = linkAt(post, digest);

    return `(${ownerAuthority} && ${f(before, 'issuerDeviceUid')} === auth.uid && ${f(before, 'ownerUid')} === ${f(owner, 'humanUid')}
      && ${f(before, 'status')} === 'pending' && ${f(before, 'revision')} === 1
      && ${same(after, before, fixedFields)} && ${f(after, 'status')} === 'cancelled' && ${f(after, 'revision')} === 2
      && ${f(after, 'cancelledAt')} === now && !${after}.child('consumedAt').exists()
      && !${auditAt(root, digest, 'cancelled')}.exists() && ${auditValid(post, digest, 'cancelled', after)})`;
  }

  const selected = linkAt(root, '$linkDigest');
  const read = `${ownerAuthority} || (${targetRead('data')})`;
  const eventRead = `${ownerAuthority} || (${targetRead(selected)})`;
  const digestFromDeviceResult = f(
    `${root}.child('ownerDeviceLinkReaders').child(auth.uid).child(${f('newData', 'lastOperationId')})`,
    'linkDigest',
  );
  const ownReaders = `auth != null && auth.token.firebase.sign_in_provider === 'anonymous' && auth.uid === $deviceUid && ${scope(ownDevice)}`;
  const receiptReader = readerAt(root, 'auth.uid', '$operationId');
  const receiptIssuer = `${root}.child('ownerDeviceLinkIssues').child($operationId)`;
  const receiptRead = `${ownerAuthority} || (auth != null && auth.token.firebase.sign_in_provider === 'anonymous'
    && ${scope(ownDevice)} && ((${receiptReader}.exists() && ${scope(receiptReader)}
      && ${f(receiptReader, 'targetDeviceUid')} === auth.uid && ${f(receiptReader, 'ownerUid')} === ${f(ownDevice, 'humanUid')})
      || (${receiptIssuer}.exists() && ${scope(receiptIssuer)} && ${f(receiptIssuer, 'issuerDeviceUid')} === auth.uid
        && ${f(receiptIssuer, 'ownerUid')} === ${f(ownDevice, 'humanUid')})))`;

  return {
    approveDeviceWrite: `newData.child('deviceUid').val() === auth.uid && ${consume('newData.parent().parent()', f('newData', 'lastOperationId'), digestFromDeviceResult)}`,
    ownerDeviceLinks: {
      $linkDigest: record(
        linkFields,
        read,
        // 別操作にしかない参照先を評価しないよう、要求された状態で先に分ける。
        `(newData.child('status').val() === 'pending' && ${issue('newData.parent().parent()', '$linkDigest')})
        || (newData.child('status').val() === 'consumed' && ${consume('newData.parent().parent()', f('newData', 'operationId'), '$linkDigest')})
        || (newData.child('status').val() === 'cancelled' && ${cancel('newData.parent().parent()', '$linkDigest')})`,
        ['consumedAt', 'cancelledAt'],
      ),
    },
    ownerDeviceLinkIssues: {
      $operationId: record(
        issueFields,
        ownerAuthority,
        `!data.exists() && newData.child('operationId').val() === $operationId
        && ${issue('newData.parent().parent()', f('newData', 'linkDigest'))}`,
      ),
    },
    ownerDeviceLinkReaders: {
      $deviceUid: {
        '.read': ownReaders,
        $operationId: record(
          readerFields,
          ownReaders,
          `auth.uid === $deviceUid && !data.exists() && ${readLink('newData.parent().parent().parent()', f('newData', 'linkDigest'), '$operationId')}`,
        ),
      },
    },
    ownerDeviceLinkResults: {
      $operationId: record(
        resultFields,
        receiptRead,
        `!data.exists() && ${consume('newData.parent().parent()', '$operationId', f('newData', 'linkDigest'))}`,
      ),
    },
    ownerDeviceLinkAudit: {
      $linkDigest: {
        issued: record(
          auditFields,
          eventRead,
          `!data.exists() && ${issue('newData.parent().parent().parent()', '$linkDigest')}`,
        ),
        read: record(
          auditFields,
          eventRead,
          `!data.exists() && ${readLink('newData.parent().parent().parent()', '$linkDigest', f(selected, 'operationId'))}`,
        ),
        approved: record(
          auditFields,
          eventRead,
          `!data.exists() && ${consume('newData.parent().parent().parent()', f(selected, 'operationId'), '$linkDigest')}`,
        ),
        cancelled: record(
          auditFields,
          eventRead,
          `!data.exists() && ${cancel('newData.parent().parent().parent()', '$linkDigest')}`,
        ),
        expired: record(
          auditFields,
          eventRead,
          `!data.exists() && (${ownerAuthority} || (${targetRead(selected)})) && ${f(selected, 'status')} === 'pending'
          && now >= ${f(selected, 'expiresAt')} && ${auditValid('newData.parent().parent().parent()', '$linkDigest', 'expired', selected)}`,
        ),
        rejected: record(
          [...auditFields, 'reasonCode'],
          eventRead,
          `!data.exists() && (${ownerAuthority} || (${targetRead(selected)})) && ${selected}.exists()
          && ${auditValid('newData.parent().parent().parent()', '$linkDigest', 'rejected', selected)}
          && (${[
            'identity_mismatch',
            'expired',
            'stopped',
            'scope_mismatch',
            'cancelled',
            'already_used',
            'permission_denied',
            'unknown',
          ]
            .map((code) => `newData.child('reasonCode').val() === '${code}'`)
            .join(' || ')})`,
        ),
      },
    },
  };
}
