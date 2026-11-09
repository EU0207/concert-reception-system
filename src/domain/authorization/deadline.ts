// 会場の暦に従って、翌日が終わる境界を求める。固定24時間・48時間では計算しない。

import { nonnegative, requireValue } from '../seats/validation.ts';

/** 会場のタイムゾーンを使用し、指定時刻を年月日へ変換する。 */
function venueDateFormatter(timeZone: string): (time: number) => string {
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

  return (time) => {
    const parts = formatter.formatToParts(time);

    /** 日付の構成要素から、指定した年・月・日の値を取り出す。 */
    const read = (kind: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === kind)!.value;

    return `${read('year').padStart(4, '0')}-${read('month')}-${read('day')}`;
  };
}

/** サーバー時刻を会場の年月日に変換する。公演日との照合に使う。 */
export function venueDateAtServerTime(serverTime: number, timeZone: string): string {
  requireValue(nonnegative(serverTime) && serverTime <= 8_640_000_000_000_000, 'INVALID_SERVER_TIME');

  return venueDateFormatter(timeZone)(serverTime);
}

/** 翌々日の開始を排他的な期限として返す。夏時間で1日の長さが変わる場合も扱う。 */
export function offlineDeadline(performanceDate: string, timeZone: string): number {
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(performanceDate), 'INVALID_PERFORMANCE_DATE');

  const parsed = new Date(performanceDate + 'T00:00:00Z');

  requireValue(
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === performanceDate,
    'INVALID_PERFORMANCE_DATE',
  );

  parsed.setUTCDate(parsed.getUTCDate() + 2);

  const target = parsed.toISOString().slice(0, 10);
  const localDate = venueDateFormatter(timeZone);

  // lowとhighは、会場の日付境界を探すUTC時刻の下限と上限。
  let low = parsed.getTime() - 36 * 60 * 60 * 1000;
  let high = parsed.getTime() + 36 * 60 * 60 * 1000;

  requireValue(localDate(low) < target && localDate(high) >= target, 'UNRESOLVED_TIME_ZONE');

  // 夏時間で日付の長さが変わるため、固定時間を足さず、日付が切り替わる最初の時刻を探す。
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);

    if (localDate(middle) < target) low = middle;
    else high = middle;
  }

  return high;
}
