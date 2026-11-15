// 環境所有者が登録する公演暦を参照し、通常の本人・端末からの変更を拒否する。

/** 信頼する初期設定の暦が、対象公演の完全な形式と正の版を持つか検査する式を作る。 */
export function validPerformanceCalendar(root, integer) {
  const node = `${root}.child('control/calendar')`;

  return `(${node}.child('schemaVersion').val() === 1
    && ${node}.child('environmentId').val() === $environmentId
    && ${node}.child('performanceId').val() === $performanceId
    && ${node}.child('performanceDate').isString()
    && ${node}.child('performanceDate').val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
    && ${node}.child('venueTimeZone').isString()
    && ${node}.child('venueTimeZone').val().length > 0 && ${node}.child('venueTimeZone').val().length <= 100
    && ${node}.child('calendarRevision').isNumber() && ${integer(`${node}.child('calendarRevision').val()`, 1)}
    && ${node}.child('dayStartsAt').isNumber() && ${integer(`${node}.child('dayStartsAt').val()`, 0)}
    && ${node}.child('dayEndsAt').isNumber() && ${integer(`${node}.child('dayEndsAt').val()`, 1)}
    && ${node}.child('dayStartsAt').val() < ${node}.child('dayEndsAt').val())`;
}
