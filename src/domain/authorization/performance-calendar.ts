// 環境所有者が事前登録する公演暦を検証し、会場の日付境界と保存版を扱う。

import type { Scope } from '../seats/types.ts';
import { checkScope, isId, nonnegative, positive, requireValue } from '../seats/validation.ts';
import { venueDayBounds } from './deadline.ts';

export interface PerformanceCalendar extends Scope {
  schemaVersion: 1;
  performanceDate: string;
  venueTimeZone: string;
  dayStartsAt: number;
  dayEndsAt: number;
  calendarRevision: number;
}

/** 公演所属と会場暦を検証し、初期設定で登録する完全なレコードを作る。 */
export function createPerformanceCalendar(scope: Scope, performanceDate: string, venueTimeZone: string, calendarRevision: number): PerformanceCalendar {
  requireValue(isId(scope.environmentId) && isId(scope.performanceId) && positive(calendarRevision), 'INVALID_PERFORMANCE_CALENDAR');
  requireValue(typeof performanceDate === 'string' && typeof venueTimeZone === 'string' &&
    venueTimeZone.length > 0 && venueTimeZone.length <= 100, 'INVALID_PERFORMANCE_CALENDAR');
  const bounds = venueDayBounds(performanceDate, venueTimeZone);
  requireValue(nonnegative(bounds.dayStartsAt) && positive(bounds.dayEndsAt), 'INVALID_PERFORMANCE_CALENDAR');

  return { environmentId: scope.environmentId, performanceId: scope.performanceId,
    schemaVersion: 1, performanceDate, venueTimeZone, ...bounds, calendarRevision };
}

/** 保存された暦の版と日付境界を再計算し、欠損・別公演と誤った境界を拒否する。 */
export function validatePerformanceCalendar(calendar: PerformanceCalendar, scope: Scope): void {
  requireValue(calendar?.schemaVersion === 1, 'PERFORMANCE_CALENDAR_REQUIRED');
  checkScope(calendar, scope);
  const expected = createPerformanceCalendar(scope, calendar.performanceDate, calendar.venueTimeZone, calendar.calendarRevision);
  requireValue(expected.dayStartsAt === calendar.dayStartsAt && expected.dayEndsAt === calendar.dayEndsAt, 'INVALID_PERFORMANCE_CALENDAR');
}

/** 保存側から得たサーバー時刻を公演暦と照合する。要求本文の当日フラグは受け取らない。 */
export function isPerformanceDayAtServerTime(calendar: PerformanceCalendar, scope: Scope, serverTime: number): boolean {
  validatePerformanceCalendar(calendar, scope);
  requireValue(nonnegative(serverTime), 'INVALID_SERVER_TIME');

  return calendar.dayStartsAt <= serverTime && serverTime < calendar.dayEndsAt;
}
