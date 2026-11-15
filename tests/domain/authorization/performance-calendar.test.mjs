// 初期設定の公演暦が会場の日付境界と一致し、端末時計で確定条件を変えないことを確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPerformanceCalendar, validatePerformanceCalendar, isPerformanceDayAtServerTime } from '../../../src/domain/authorization/performance-calendar.ts';

const scope = { environmentId: '00000000-0000-4000-8000-000000000001', performanceId: '00000000-0000-4000-8000-000000000002' };

for (const [date, zone, start, end] of [
  ['2026-11-22', 'Asia/Tokyo', '2026-11-21T15:00:00Z', '2026-11-22T15:00:00Z'],
  ['2026-03-08', 'America/New_York', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z'],
  ['2026-11-01', 'America/New_York', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'],
  ['2028-02-29', 'UTC', '2028-02-29T00:00:00Z', '2028-03-01T00:00:00Z'],
  ['2026-12-31', 'UTC', '2026-12-31T00:00:00Z', '2027-01-01T00:00:00Z'],
]) {
  test(`CAL285-T01 ${date}/${zone}の境界を求め、開始を含み翌日開始を含まない`, () => {
    const calendar = createPerformanceCalendar(scope, date, zone, 1);
    assert.equal(calendar.dayStartsAt, Date.parse(start));
    assert.equal(calendar.dayEndsAt, Date.parse(end));
    assert.equal(isPerformanceDayAtServerTime(calendar, scope, calendar.dayStartsAt - 1), false);
    assert.equal(isPerformanceDayAtServerTime(calendar, scope, calendar.dayStartsAt), true);
    assert.equal(isPerformanceDayAtServerTime(calendar, scope, calendar.dayEndsAt - 1), true);
    assert.equal(isPerformanceDayAtServerTime(calendar, scope, calendar.dayEndsAt), false);
  });
}

test('CAL285-T02 不正・実在しない会場日とタイムゾーン、版と境界の改変を拒否する', (t) => {
  for (const [date, zone] of [['2026-02-30', 'Asia/Tokyo'], ['2011-12-30', 'Pacific/Apia'], ['2026-11-22', 'invalid-zone']]) {
    assert.throws(() => createPerformanceCalendar(scope, date, zone, 1));
  }
  const calendar = createPerformanceCalendar(scope, '2026-11-22', 'Asia/Tokyo', 1);
  t.mock.method(Date, 'now', () => calendar.dayEndsAt + 86400000);
  assert.equal(isPerformanceDayAtServerTime(calendar, scope, calendar.dayStartsAt), true);
  for (const patch of [{ dayStartsAt: calendar.dayStartsAt - 1 }, { dayEndsAt: calendar.dayEndsAt + 1 },
    { calendarRevision: 0 }, { schemaVersion: 2 }, { performanceId: scope.environmentId }, { venueTimeZone: 'UTC' }]) {
    assert.throws(() => validatePerformanceCalendar({ ...calendar, ...patch }, scope));
  }
  assert.throws(() => isPerformanceDayAtServerTime(calendar, scope, NaN));
});

test('CAL285-T03 初期設定スクリプトは検証済み本文だけを出力し、引数不足・重複・未知を拒否する', () => {
  const script = new URL('../../../scripts/prepare-performance-calendar.mjs', import.meta.url);
  const args = ['--environment-id', scope.environmentId, '--performance-id', scope.performanceId,
    '--date', '2026-11-22', '--time-zone', 'Asia/Tokyo', '--revision', '1'];
  const output = JSON.parse(execFileSync(process.execPath, [fileURLToPath(script), ...args], { encoding: 'utf8' }));
  assert.equal(output.path, `environments/${scope.environmentId}/performances/${scope.performanceId}/control/calendar`);
  assert.deepEqual(output.calendar, createPerformanceCalendar(scope, '2026-11-22', 'Asia/Tokyo', 1));
  for (const invalid of [[...args, '--revision', '2'], [...args, '--unknown', 'value'], [...args, '--date'], args.slice(0, -2)]) {
    assert.throws(() => execFileSync(process.execPath, [fileURLToPath(script), ...invalid], { stdio: 'pipe' }));
  }
});
