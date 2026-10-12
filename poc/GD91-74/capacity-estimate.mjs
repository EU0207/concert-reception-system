import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// 計測済みの操作数から概算する。Emulator試験や課金量の実測ではない。
const sources = ['artifacts/measurement.json', '../GD91-73/artifacts/sdk-summary.json', 'capacity-estimate.mjs'];
const read = path => fs.readFileSync(new URL(path, import.meta.url));
const measured = JSON.parse(read(sources[0]));
const sdk = JSON.parse(read(sources[1]));
const phase = name => measured.phases['500/' + name].normal;
const qr = sdk.reports.find(r => r.kind === 'qrCreate');
const check = sdk.reports.find(r => r.kind === 'ticketCheck');
assert.equal(qr.status, 'passed');
assert.equal(check.status, 'passed');
assert.equal(qr.writes, 7);
assert.equal(check.writes, 5);

const observedWrites = Object.entries(measured.phases)
  .filter(([key]) => key.startsWith('500/'))
  .reduce((sum, [, value]) => sum + value.normal.writes, 0);
// 2区画、各5行・偶数列、全セルが席。構成6.5N+34、登録6N、配置N+6、その他9。
const baseWrites = people => 13.5 * people + 49;
const fullDownloadGets = people => 4 * people + 6;
assert.equal(baseWrites(500), observedWrites);
assert.equal(fullDownloadGets(500), phase('public-download').reads);
assert.equal(phase('register').writes, 6 * 500);
assert.equal(phase('allocation-proof').writes + phase('allocation-confirm').writes, 506);

const freeDailyWrites = 20000;
const planningReserveRatio = 0.2;
const estimate = people => {
  const writes = baseWrites(people) + people * (qr.writes + check.writes);
  return {
    people, baseMeasuredAtThisHeadcount: people === 500,
    baseWrites: baseWrites(people), qrAndIssueCheckWrites: people * (qr.writes + check.writes),
    sameQuotaDayModeledWrites: writes, remainingDailyWrites: freeDailyWrites - writes,
    fullDownloadGetsPerDevice: fullDownloadGets(people),
    sixDeviceFullDownloadGets: 6 * fullDownloadGets(people),
    splitPreparationQuotaDays: {
      layoutRegistrationAllocationWrites: baseWrites(people),
      qrAndIssueCheckWrites: people * (qr.writes + check.writes),
      eachModeledPreparationDayWithinWriteQuota: baseWrites(people) <= freeDailyWrites && people * (qr.writes + check.writes) <= freeDailyWrites,
      eventDayWrites: null, eventDayFeasibilityVerified: false,
    },
    withinDevelopmentFreeTierGuaranteeScope: people <= 1000,
    freeTierFeasibilityVerified: false,
  };
};
const estimates = [500, 600, 1000, 1020].map(estimate);
assert.equal(estimate(600).sameQuotaDayModeledWrites, 15349);
assert.equal(estimate(1000).sameQuotaDayModeledWrites, 25549);
assert.equal(estimate(1020).withinDevelopmentFreeTierGuaranteeScope, false);
assert.equal(estimate(1000).splitPreparationQuotaDays.layoutRegistrationAllocationWrites, 13549);
assert.equal(estimate(1000).splitPreparationQuotaDays.qrAndIssueCheckWrites, 12000);
assert(estimates.every(e => !e.freeTierFeasibilityVerified));
const result = {
  kind: 'arithmetic-projection-not-load-test',
  sources: Object.fromEntries(sources.map(path => [path, createHash('sha256').update(read(path).toString('utf8').replace(/\r\n/g, '\n')).digest('hex')])),
  quotaSource: 'https://firebase.google.com/docs/firestore/quotas', verifiedOn: '2026-10-12',
  calibration: {people: 500, observedWrites, observedFullDownloadGets: phase('public-download').reads},
  assumptions: {
    sameQuotaDay: true, sections: 2, seatsPerPerson: 1, nonSeatCells: 0,
    qrCreatesPerPerson: 1, issueChecksPerPerson: 1, fullDownloadsPerDevice: 1, devices: 6,
    formula: 'base=13.5N+49; with QR and issue check=25.5N+49; download GET=4N+6',
    validLayout: '各区画5行・偶数列（Nは20の倍数）。他の配置の費用は別途評価。',
    excluded: ['受付・再入場の同期', '修正・再発行と再試行', '端末登録と入力headの通常発行',
      'Rules依存読取りとクエリー・索引読取り', '通路などの非席セル', '履歴・バックアップ・回収',
      '保存容量・通信量と他のFirebaseサービス', '同じプロジェクトの他操作・過去データ'],
  },
  freeDailyWrites, planningReserveRatio,
  writeOnlyLinearBoundaryPeople: Math.floor((freeDailyWrites - 49) / 25.5),
  writeOnlyLinearBoundaryWithReservePeople: Math.floor((freeDailyWrites * (1 - planningReserveRatio) - 49) / 25.5),
  estimates,
};
assert.equal(result.writeOnlyLinearBoundaryPeople, 782);
assert.equal(result.writeOnlyLinearBoundaryWithReservePeople, 625);
fs.writeFileSync(new URL('artifacts/capacity-estimate.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({kind: result.kind, calibration: result.calibration, estimates,
  writeOnlyBoundary: result.writeOnlyLinearBoundaryPeople, withReserve: result.writeOnlyLinearBoundaryWithReservePeople}));
