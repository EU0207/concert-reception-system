// 公演ごとの会場情報を保存し、権限を持つ別公演から独立コピーする。

/** RTDB Rulesの子項目の値を参照する。 */
const field = (node, key) => `${node}.child('${key}').val()`;

/** コピー元・コピー先の現在認可と、会場情報の版を検査する。 */
export function performanceVenueRules({ root, manager, preparedAuthorization, integer }) {
  const session = `${root}.child('sessions').child(auth.uid)`;
  const n = 'newData';
  const originId = field(n, 'sourcePerformanceId');
  const originRoot = `root.child('environments/'+$environmentId+'/performances/'+${originId})`;
  const originVenue = `${originRoot}.child('performanceVenue')`;
  const originDevice = `${originRoot}.child('devices').child(auth.uid)`;
  const originRole = `${originRoot}.child('roles').child(${field(originDevice, 'humanUid')})`;
  const uuid = '/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/';
  const required = ['environmentId', 'performanceId', 'revision', 'name', 'address', 'updatedAt'];

  // 同じ端末が両公演で同じ本人として許可されている場合だけ、確定済みの会場情報を複製する。
  const copy = `${n}.child('sourcePerformanceId').isString() && ${originId}.matches(${uuid})
    && ${originId} !== $performanceId
    && ${preparedAuthorization(originId)}
    && (${field(originRole, 'role')} === 'owner' || ${field(originRole, 'role')} === 'deputy')
    && ${field(originDevice, 'humanUid')} === ${field(session, 'humanUid')}
    && ${field(originVenue, 'environmentId')} === $environmentId
    && ${field(originVenue, 'performanceId')} === ${originId}
    && ${originVenue}.child('revision').isNumber()
    && ${field(n, 'sourceRevision')} === ${field(originVenue, 'revision')}
    && ${field(n, 'name')} === ${field(originVenue, 'name')}
    && ${field(n, 'address')} === ${field(originVenue, 'address')}`;

  return {
    '.read': manager,
    '.write': `${manager} && ${field(session, 'humanAuthTime')} >= now - 900000
      && ${field(`${root}.child('control')`, 'state')} === 'preparing'
      && ${n}.hasChildren(${JSON.stringify(required)})
      && ${field(n, 'environmentId')} === $environmentId && ${field(n, 'performanceId')} === $performanceId
      && ${n}.child('revision').isNumber() && ${integer(field(n, 'revision'), 1)}
      && ${field(n, 'revision')} === (data.exists() ? ${field('data', 'revision')} + 1 : 1)
      && ${field(n, 'updatedAt')} === now
      && ((!data.exists() && (${copy}))
        || (!${n}.child('sourcePerformanceId').exists() && !${n}.child('sourceRevision').exists()
          && !data.child('sourcePerformanceId').exists())
        || (data.exists() && data.child('sourcePerformanceId').exists()
          && ${originId} === ${field('data', 'sourcePerformanceId')}
          && ${field(n, 'sourceRevision')} === ${field('data', 'sourceRevision')}))`,
    ...Object.fromEntries(required.map((key) => [key, { '.validate': true }])),
    name: { '.validate': "newData.isString() && newData.val().length > 0 && newData.val().length <= 200" },
    address: { '.validate': "newData.isString() && newData.val().length > 0 && newData.val().length <= 500" },
    sourcePerformanceId: { '.validate': `newData.isString() && newData.val().matches(${uuid})` },
    sourceRevision: { '.validate': `newData.isNumber() && ${integer('newData.val()', 1)}` },
    $other: { '.validate': false },
  };
}
