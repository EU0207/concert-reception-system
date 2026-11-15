// 環境所有者の初期設定用に公演暦を検証・出力する。外部接続とDBへの書込みは行わない。

import { createPerformanceCalendar } from '../src/domain/authorization/performance-calendar.ts';

/** 重複・未知・値不足の引数を拒否し、公演暦の登録先と検証済み本文を出力する。 */
function main() {
  const allowed = new Set(['--environment-id', '--performance-id', '--date', '--time-zone', '--revision']);
  const args = process.argv.slice(2);
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!allowed.has(key) || options.has(key) || !value || value.startsWith('--')) throw Error('INVALID_CALENDAR_ARGUMENTS');
    options.set(key, value);
  }
  if (options.size !== allowed.size) throw Error('Use --environment-id UUID --performance-id UUID --date YYYY-MM-DD --time-zone IANA --revision N');
  const calendar = createPerformanceCalendar(
    { environmentId: options.get('--environment-id'), performanceId: options.get('--performance-id') },
    options.get('--date'), options.get('--time-zone'), Number(options.get('--revision')),
  );

  process.stdout.write(JSON.stringify({
    path: `environments/${calendar.environmentId}/performances/${calendar.performanceId}/control/calendar`, calendar,
  }, null, 2) + '\n');
}

// # 本文：公演暦を検証して、初期設定用の本文を出力する。

main();
