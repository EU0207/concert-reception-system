// 公演の準備確認を、確定済みデータ版と現在の管理版に結び付ける。

import { validPerformanceCalendar } from './performance-calendar-rules.mjs';

/** 準備確認の保存条件と、確認に使う版だけの読取り条件を組み立てる。 */
export function receptionPreparationRules({ root, manager, integer, strictRecord }) {
  const control = `${root}.child('control')`;
  const session = `${root}.child('sessions').child(auth.uid)`;
  const revisionPaths = {
    commitRevision: 'event/commit/revision',
    layoutRevision: 'head/revision',
    viewRevision: 'head/viewRevision',
    calendarRevision: 'control/calendar/calendarRevision',
  };
  const versions = Object.entries(revisionPaths).map(([key, path]) => {
    const revision = `${root}.child('${path}')`;

    return `${revision}.isNumber() && ${integer(`${revision}.val()`, ['layoutRevision', 'calendarRevision'].includes(key) ? 1 : 0)}
      && newData.child('dataVersion/${key}').val() === ${revision}.val()`;
  });
  const fields = [
    'environmentId', 'performanceId', 'controlRevision', 'dataVersion',
    'confirmedAt', 'humanUid', 'deviceUid',
  ];
  const record = strictRecord(fields, manager, `${manager}
    && ${validPerformanceCalendar(root, integer)}
    && ${session}.child('humanAuthTime').val() >= now - 900000
    && (${control}.child('state').val() === 'preparing' || ${control}.child('state').val() === 'stopped')
    && ${control}.child('staffDeadline').val() > now
    && ${integer(`${control}.child('controlRevision').val()`, 1)}
    && newData.child('environmentId').val() === $environmentId
    && newData.child('performanceId').val() === $performanceId
    && newData.child('controlRevision').val() === ${control}.child('controlRevision').val()
    && newData.child('humanUid').val() === ${session}.child('humanUid').val()
    && newData.child('deviceUid').val() === auth.uid
    && newData.child('confirmedAt').val() === now
    && ${versions.join(' && ')}`);
  record.dataVersion = {
    ...Object.fromEntries(Object.keys(revisionPaths).map((key) => [key, { '.validate': true }])),
    $other: { '.validate': false },
  };

  // 管理者が照合に使う版だけを返し、名簿や構成の親ノードは開かない。
  return {
    receptionPreparation: record,
    event: { commit: { revision: { '.read': manager } } },
    head: { revision: { '.read': manager }, viewRevision: { '.read': manager } },
  };
}
