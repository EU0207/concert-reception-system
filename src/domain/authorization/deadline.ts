// 会場の暦に従って、翌日が終わる境界を求める。固定24時間・48時間では計算しない。

import { requireValue } from '../seats/validation.ts';

/** 翌々日の開始を排他的な期限として返す。夏時間で1日の長さが変わる場合も扱う。 */
export function offlineDeadline(performanceDate: string, timeZone: string): number {
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(performanceDate), 'INVALID_PERFORMANCE_DATE');
  const parsed = new Date(performanceDate + 'T00:00:00Z');
  requireValue(
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === performanceDate,
    'INVALID_PERFORMANCE_DATE'
  );
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new Error('INVALID_TIME_ZONE');
  }
  parsed.setUTCDate(parsed.getUTCDate() + 2);
  const target = parsed.toISOString().slice(0, 10);
  const localDate = (time: number) => {
    const parts = formatter.formatToParts(time);
    const read = (kind: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === kind)!.value;
    return `${read('year')}-${read('month')}-${read('day')}`;
  };
  let low = parsed.getTime() - 36 * 60 * 60 * 1000;
  let high = parsed.getTime() + 36 * 60 * 60 * 1000;
  requireValue(localDate(low) < target && localDate(high) >= target, 'UNRESOLVED_TIME_ZONE');
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDate(middle) < target) low = middle;
    else high = middle;
  }
  return high;
}
