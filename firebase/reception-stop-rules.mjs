// 明示停止を公演管理版・操作ID・監査と一体で確定する。

/** RTDB Rulesの子項目参照を組み立てる。 */
const field = (node, key) => `${node}.child('${key}').val()`;

/** 受付停止の状態変更と作成専用監査を相互に検証する。 */
export function receptionStopRules({ root, manager, integer, strictRecord }) {
  const control = `${root}.child('control')`;
  const session = `${root}.child('sessions').child(auth.uid)`;
  const fields = [
    'environmentId', 'performanceId', 'operationId', 'humanUid', 'deviceUid',
    'previousState', 'state', 'controlRevision', 'firstReceptionStartedAt', 'occurredAt',
  ];
  const uuid = '/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/';

  /** 更新後の状態と監査が同じ停止操作に属することを確認する。 */
  function commit(post, id) {
    const next = `${post}.child('control')`;
    const audit = `${post}.child('receptionStopAudits').child(${id})`;

    return `${manager} && ${field(session, 'humanAuthTime')} >= now - 900000
      && ${field(control, 'environmentId')} === $environmentId
      && ${field(control, 'performanceId')} === $performanceId
      && ${field(control, 'state')} === 'operating'
      && ${integer(field(control, 'controlRevision'), 1)}
      && ${integer(field(control, 'firstReceptionStartedAt'), 1)}
      && ${field(control, 'firstReceptionStartedAt')} <= now
      && ${id}.matches(${uuid})
      && !${root}.child('receptionStopAudits').child(${id}).exists()
      && ${field(next, 'lastReceptionOperationId')} === ${id}
      && ${field(next, 'state')} === 'stopped'
      && ${field(next, 'controlRevision')} === ${field(control, 'controlRevision')} + 1
      && ${integer(field(next, 'controlRevision'), 2)}
      && ${field(next, 'firstReceptionStartedAt')} === ${field(control, 'firstReceptionStartedAt')}
      && ${field(next, 'ownerUid')} === ${field(control, 'ownerUid')}
      && ${audit}.hasChildren(${JSON.stringify(fields)})
      && ${field(audit, 'environmentId')} === $environmentId
      && ${field(audit, 'performanceId')} === $performanceId
      && ${field(audit, 'operationId')} === ${id}
      && ${field(audit, 'humanUid')} === ${field(session, 'humanUid')}
      && ${field(audit, 'deviceUid')} === auth.uid
      && ${field(audit, 'previousState')} === 'operating'
      && ${field(audit, 'state')} === 'stopped'
      && ${field(audit, 'controlRevision')} === ${field(next, 'controlRevision')}
      && ${field(audit, 'firstReceptionStartedAt')} === ${field(next, 'firstReceptionStartedAt')}
      && ${field(audit, 'occurredAt')} === now`;
  }

  const nextId = 'newData.parent().child(\'lastReceptionOperationId\')';
  // 共通親を書込み可にせず、停止で変更する3項目と監査だけを許可する。
  const writeControl = `${nextId}.isString() && ${commit('newData.parent().parent()', `${nextId}.val()`)}`;
  return {
    controlWrites: Object.fromEntries(
      ['state', 'controlRevision', 'lastReceptionOperationId'].map((key) => [key, writeControl]),
    ),
    receptionStopAudits: {
      $operationId: strictRecord(
        fields,
        manager,
        commit('newData.parent().parent()', '$operationId'),
      ),
    },
  };
}
