// #111の受付状態、現在認可と会場日付の境界を架空データで確認する。

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { venueDateAtServerTime } from '../../../src/domain/authorization/deadline.ts';
import { RECENT_AUTH_WINDOW } from '../../../src/domain/authorization/policy.ts';
import { planReceptionControl } from '../../../src/domain/authorization/reception-control.ts';
import { now, scope, snapshot } from './fixtures.mjs';

const initial = {
  ...scope,
  controlRevision: 1,
  state: 'preparing',
  firstReceptionStartedAt: null,
};
const start = { ...scope, expectedControlRevision: 1, action: 'start' };

/** 指定した状態と役割に対応する、保存側の確認結果を作る。 */
function context(state = 'preparing', role = 'owner', serverTime = now) {
  return {
    authorization: { ...snapshot(role), state },
    serverTime,
    preparationConfirmed: true,
  };
}

test('初回開始の時刻を確定案と監査へ同時に入れ、停止・再開で保持する', () => {
  const started = planReceptionControl(initial, start, context());
  assert.equal(initial.firstReceptionStartedAt, null);
  assert.equal(started.next.firstReceptionStartedAt, now);
  assert.equal(started.next.state, 'operating');
  assert.deepEqual(started.audit, {
    ...scope,
    humanUid: 'fictional-human',
    deviceUid: 'fictional-device-a',
    occurredAt: now,
    previousState: 'preparing',
    state: 'operating',
    controlRevision: 2,
  });

  const stopped = planReceptionControl(
    started.next,
    { ...scope, expectedControlRevision: 2, action: 'stop' },
    context('operating', 'deputy', now + 1000),
  ).next;
  assert.equal(stopped.state, 'stopped');
  assert.equal(stopped.firstReceptionStartedAt, now);

  const restarted = planReceptionControl(
    stopped,
    { ...start, expectedControlRevision: 3 },
    context('stopped', 'deputy', now + 2000),
  ).next;
  assert.equal(restarted.state, 'operating');
  assert.equal(restarted.controlRevision, 4);
  assert.equal(restarted.firstReceptionStartedAt, now);
});

test('別公演・旧版と、確定済みの開始要求の再送を拒否する', () => {
  const anotherPerformance = '00000000-0000-4000-8000-000000000004';
  assert.throws(
    () => planReceptionControl(initial, { ...start, performanceId: anotherPerformance }, context()),
    { code: 'SCOPE_MISMATCH' },
  );
  const started = planReceptionControl(initial, start, context()).next;
  assert.throws(() => planReceptionControl(started, start, context('operating')), {
    code: 'STALE_PERFORMANCE_CONTROL',
  });
  assert.throws(
    () => planReceptionControl(started, { ...start, expectedControlRevision: 2 }, context('operating')),
    { code: 'RECEPTION_CANNOT_START' },
  );
});

test('未準備・役割不足・再認証期限切れ・公演期限切れの開始を拒否する', () => {
  assert.throws(
    () => planReceptionControl(initial, start, { ...context(), preparationConfirmed: false }),
    { code: 'RECEPTION_PREPARATION_REQUIRED' },
  );
  for (const role of ['temporary', 'receptionist']) {
    assert.throws(() => planReceptionControl(initial, start, context('preparing', role)), {
      code: 'ROLE_FORBIDDEN',
    });
  }
  const expiredReauthentication = context();
  expiredReauthentication.authorization.session.humanAuthTime = now - RECENT_AUTH_WINDOW - 1;
  assert.throws(() => planReceptionControl(initial, start, expiredReauthentication), {
    code: 'RECENT_AUTH_REQUIRED',
  });

  const expiredPerformance = context();
  expiredPerformance.authorization.staffDeadline = now;
  assert.throws(() => planReceptionControl(initial, start, expiredPerformance), {
    code: 'STAFF_DEADLINE_EXPIRED',
  });
});

test('終了済み・締め済みの公演と、初回開始時刻を失った公演の再開を拒否する', () => {
  for (const state of ['ended', 'closed']) {
    assert.throws(
      () => planReceptionControl({ ...initial, state, firstReceptionStartedAt: now - 1000 }, start, context(state)),
      { code: 'RECEPTION_CANNOT_START' },
    );
  }
  assert.throws(
    () => planReceptionControl({ ...initial, state: 'stopped' }, start, context('stopped')),
    { code: 'INVALID_FIRST_RECEPTION_START' },
  );
});

test('端末時計が変わっても、受け取ったサーバー時刻を会場の日付に変換する', (t) => {
  const midnight = Date.parse('2026-11-08T15:00:00Z');
  t.mock.method(Date, 'now', () => midnight + 86400000);

  assert.equal(venueDateAtServerTime(midnight - 1, 'Asia/Tokyo'), '2026-11-08');
  assert.equal(venueDateAtServerTime(midnight, 'Asia/Tokyo'), '2026-11-09');
  assert.equal(venueDateAtServerTime(midnight, 'America/New_York'), '2026-11-08');
  assert.throws(() => venueDateAtServerTime(midnight, 'invalid/zone'), /INVALID_TIME_ZONE/);
});
