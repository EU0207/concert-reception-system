// 業務確定版と空名簿を、対象公演の管理版と照合して初期化する。

import { validPerformanceCalendar } from './performance-calendar-rules.mjs';

/** 最初の業務データと公演管理版の照合記録を一体で作成する規則を組み立てる。 */
export function performanceBusinessInitializationRules({ root, manager, integer }) {
  const control = `${root}.child('control')`;
  const session = `${root}.child('sessions').child(auth.uid)`;
  const revision = `${control}.child('controlRevision').val()`;
  const fence = 'businessInitializedFromRevision';

  /** 更新後のRTDBに空名簿と管理版の照合記録がそろっていることを確認する。 */
  function canInitialize(post) {
    const event = `${post}.child('event')`;

    return `${manager} && ${session}.child('humanAuthTime').val() >= now - 900000
      && ${validPerformanceCalendar(root, integer)}
      && ${control}.child('environmentId').val() === $environmentId
      && ${control}.child('performanceId').val() === $performanceId
      && ${control}.child('state').val() === 'preparing'
      && ${control}.child('staffDeadline').val() > now
      && ${control}.child('businessSchemaVersion').val() === 3
      && ${control}.child('layoutSchemaVersion').val() === 2
      && ${integer(revision, 1)}
      && !${control}.child('${fence}').exists()
      && !${root}.child('event').exists() && !${root}.child('head').exists()
      && !${post}.child('head').exists()
      && ${post}.child('control/controlRevision').val() === ${revision}
      && ${post}.child('control/${fence}').val() === ${revision}
      && ${event}.child('commit/revision').val() === 1
      && ${event}.child('commit/operationId').val() === 'initialize'
      && ${event}.child('roster/count').val() === 0
      && ${event}.child('reception/0000000000').val() === 1`;
  }

  // RTDBでは空のオブジェクトが残らないため、構成と名簿の本文は作らない。
  // 確定版と受付投影の版だけをそろえ、名簿件数0を正本として保持する。
  return {
    control: { [fence]: { '.write': canInitialize('newData.parent().parent()') } },
    event: {
      '.write': canInitialize('newData.parent()'),
      commit: { revision: {}, operationId: {}, $other: { '.validate': false } },
      roster: { count: {}, $other: { '.validate': false } },
      reception: { '0000000000': {}, $other: { '.validate': false } },
      $other: { '.validate': false },
    },
  };
}
