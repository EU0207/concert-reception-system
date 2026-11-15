// 明示割当済みの主担当による、公演管理情報の一度限りの初期化を検査する。

import { validPerformanceCalendar } from './performance-calendar-rules.mjs';

/** 認可の台帳に触れず、管理版・形式版・初期化時刻の一体作成だけを許可する。 */
export function performanceInitializationRules({ root, preparedAuthorization, integer }) {
  const control = `${root}.child('control')`;
  const device = `${root}.child('devices').child(auth.uid)`;
  const humanUid = `${device}.child('humanUid').val()`;
  const role = `${root}.child('roles').child(${humanUid})`;
  const session = `${root}.child('sessions').child(auth.uid)`;
  const fields = {
    controlRevision: 1,
    businessSchemaVersion: 3,
    layoutSchemaVersion: 2,
    initializedAt: 'now',
    calendarInitializedFromRevision: `${control}.child('calendar/calendarRevision').val()`,
  };

  const previous = Object.keys(fields).map((key) => `!${control}.child('${key}').exists()`);
  const next = Object.entries(fields).map(
    ([key, value]) => `newData.parent().child('${key}').val() === ${value}`,
  );
  // 親に書込み権限を与えるとownerUidや暦も変更できるため、5項目だけを同条件で許可する。
  const write = `${preparedAuthorization()}
    && ${validPerformanceCalendar(root, integer)}
    && ${role}.child('role').val() === 'owner' && ${control}.child('ownerUid').val() === ${humanUid}
    && ${session}.child('humanAuthTime').val() >= now - 900000
    && ${control}.child('environmentId').val() === $environmentId
    && ${control}.child('performanceId').val() === $performanceId
    && ${control}.child('state').val() === 'preparing'
    && newData.parent().child('ownerUid').val() === ${humanUid}
    && ${control}.child('staffDeadline').isNumber() && ${integer(`${control}.child('staffDeadline').val()`, 1)}
    && ${control}.child('staffDeadline').val() > now
    && !${control}.child('firstReceptionStartedAt').exists()
    && !${root}.child('head').exists() && !${root}.child('event').exists()
    && ${[...previous, ...next].join(' && ')}`;

  return Object.fromEntries(Object.keys(fields).map((key) => [key, { '.write': write }]));
}
