// 通信断・応答喪失と明示再送を分け、固定した席操作が二重送信されないことを確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeatOperationController, seatOperationDigest } from '../../src/storage/seat-operation-controller.ts';

/** 外部通信なしで、永続化とサーバー結果の順序を観測する窓口を作る。 */
function fixture() {
  const scope = { environmentId: crypto.randomUUID(), performanceId: crypto.randomUUID(), deviceUid: 'fictional-device', humanUid: 'fictional-human', storageEpoch: crypto.randomUUID() };
  const baseVersions = { layoutRevision: 1, assignmentRevision: 1, ticketRevision: 1, controlRevision: 1, attendeeRevision: 1 };
  const draftId = crypto.randomUUID();
  const operation = { operationId: crypto.randomUUID(), kind: 'commit', expectedVersions: { ...baseVersions, roleRevision: 1, deviceRevision: 1 },
    command: { environmentId: scope.environmentId, performanceId: scope.performanceId, action: 'fictional-commit' },
    draftId, draftRevision: 1, draftDigest: 'a'.repeat(64), status: 'prepared',
    draftSnapshot: { draftId, baseVersions, layout: { environmentId: scope.environmentId, performanceId: scope.performanceId, sections: [], assignments: [], ticketProtections: [] } } };
  const calls = [];
  let record = null;
  let remote = null;
  let authorized = true;
  let queue = Promise.resolve();
  const delivery = {
    /** 保存された送信状態のコピーを返す。 */
    async read() { return structuredClone(record); },
    /** 保存の順番と期待版を記録する。 */
    async write(operationId, inputDigest, revision, outcome) {
      assert.equal(revision, record?.localRevision ?? 0);
      calls.push('save:' + outcome.status);
      record = { operationId, inputDigest, localRevision: revision + 1, outcome: structuredClone(outcome) };

      return structuredClone(record);
    },
  };
  const transport = {
    /** サーバーに既に存在する不変結果を返す。 */
    async lookup() { calls.push('lookup'); return structuredClone(remote ?? { status: 'notFound' }); },
    /** 期待版の一致を表す。失効と通信障害は呼出元が例外で区別する。 */
    async canSend() { calls.push('validate'); return true; },
    /** 応答とは別に、確定結果をサーバーへ残す。 */
    async send(input) {
      calls.push('send');
      remote = { status: 'confirmed', receipt: { operationId: input.operationId, kind: input.kind, inputDigest: await seatOperationDigest(input), resultRevision: 2 } };
    },
    /** 操作結果が指す同一の確定版を確認する。 */
    async verifyApplied() { calls.push('applied'); },
  };
  const context = {
    scope, delivery, transport, operations: {
      /** 暗号化保存からの復元に相当する、固定入力のコピーを返す。 */
      async readPendingSeatOperation() { return structuredClone(operation); },
    },
    /** 現在の公演へのアクセス失効を検知する。 */
    assertAuthorized() { if (!authorized) throw Error('ACCESS_REVOKED'); },
    /** 複数タブに相当する呼出しを、同じ公演・端末の所有権で直列化する。 */
    withOwnership(name, action) {
      assert(name.includes(scope.deviceUid));
      const next = queue.then(action);
      queue = next.catch(() => {});

      return next;
    },
  };

  return { operation, context, calls, transport, delivery,
    controller: createSeatOperationController(context),
    current: () => structuredClone(record), setRemote: (result) => { remote = result; }, revoke: () => { authorized = false; } };
}

test('DD91-T15・T41 作成では通信せず、送信前の永続化と同一版の照合後だけ確定する', async () => {
  const f = fixture();
  assert.deepEqual(f.calls, []);
  assert.equal((await f.controller.run(f.operation.operationId, 'send')).status, 'confirmed');
  assert.deepEqual(f.calls, ['lookup', 'validate', 'save:unknown', 'send', 'lookup', 'applied', 'save:confirmed']);
});

test('DD91-T38 状態の保存失敗では送信しない', async () => {
  const f = fixture();
  f.delivery.write = async () => { throw Error('QUOTA'); };
  await assert.rejects(f.controller.run(f.operation.operationId, 'send'), /QUOTA/);
  assert(!f.calls.includes('send'));
});

test('DD91-T41 サーバー確定後の応答喪失は再作成した窓口の照会で解消し、再送しない', async () => {
  const f = fixture();
  const send = f.transport.send;
  f.transport.send = async (input) => { await send(input); throw Error('RESPONSE_LOST'); };
  await assert.rejects(f.controller.run(f.operation.operationId, 'send'), /RESPONSE_LOST/);
  assert.equal(f.current().outcome.status, 'unknown');
  const recovered = createSeatOperationController(f.context);
  assert.equal((await recovered.run(f.operation.operationId, 'check')).status, 'confirmed');
  assert.equal(f.calls.filter((call) => call === 'send').length, 1);
});

test('DD91-T41 notFoundだけで不明操作を再送せず、明示再送でも現在版を照合する', async () => {
  const f = fixture();
  f.transport.send = async () => { f.calls.push('send'); throw Error('OFFLINE'); };
  await assert.rejects(f.controller.run(f.operation.operationId, 'send'), /OFFLINE/);
  assert.equal((await f.controller.run(f.operation.operationId, 'check')).status, 'unknown');
  await assert.rejects(f.controller.run(f.operation.operationId, 'send'), /SEAT_OPERATION_RESULT_REQUIRED/);
  f.transport.canSend = async () => false;
  assert.equal((await f.controller.run(f.operation.operationId, 'retry')).status, 'conflict');
  assert.equal(f.current().outcome.status, 'unknown');
  assert.equal(f.calls.filter((call) => call === 'send').length, 1);
});

test('DD91-T15 再送不可になった後でも、遅れて確定した先行要求を照会できる', async () => {
  const f = fixture();
  f.transport.canSend = async () => false;
  assert.equal((await f.controller.run(f.operation.operationId, 'send')).status, 'conflict');
  assert(!f.calls.includes('send'));
  await f.transport.send(f.operation);
  assert.equal((await f.controller.run(f.operation.operationId, 'check')).status, 'confirmed');
});

test('DD91-T15 サーバーが準備中なら不明状態を保持し、送信や再送を始めない', async () => {
  const f = fixture();
  f.setRemote({ status: 'preparing' });
  assert.equal((await f.controller.run(f.operation.operationId, 'send')).status, 'unknown');
  assert.equal((await f.controller.run(f.operation.operationId, 'retry')).status, 'unknown');
  assert.deepEqual(f.calls, ['lookup', 'save:unknown', 'lookup']);
});

test('DD91-T41 未確定だった操作は明示再送だけで同じID・内容を送り直す', async () => {
  const f = fixture();
  const send = f.transport.send;
  f.transport.send = async () => { throw Error('OFFLINE'); };
  await assert.rejects(f.controller.run(f.operation.operationId, 'send'), /OFFLINE/);
  const before = structuredClone(f.operation);
  f.transport.send = async (input) => { assert.deepEqual(input, before); await send(input); };
  assert.equal((await f.controller.run(f.operation.operationId, 'retry')).status, 'confirmed');
});

for (const field of ['operationId', 'inputDigest', 'kind', 'resultRevision']) {
  test(`DD91-T41 結果の${field}不一致を確定扱いにしない`, async () => {
    const f = fixture();
    const receipt = { operationId: f.operation.operationId, inputDigest: await seatOperationDigest(f.operation), kind: 'commit', resultRevision: 2 };
    receipt[field] = { operationId: crypto.randomUUID(), inputDigest: 'b'.repeat(64), kind: 'share', resultRevision: 0 }[field];
    f.setRemote({ status: 'confirmed', receipt });
    await assert.rejects(f.controller.run(f.operation.operationId, 'check'), /INVALID_SEAT_RECEIPT/);
    assert.equal(f.current(), null);
    assert(!f.calls.includes('applied'));
  });
}

test('DD91-T15 確定版の再取得失敗では結果不明を保持する', async () => {
  const f = fixture();
  f.transport.verifyApplied = async () => { throw Error('VERSION_UNAVAILABLE'); };
  await assert.rejects(f.controller.run(f.operation.operationId, 'send'), /VERSION_UNAVAILABLE/);
  assert.equal(f.current().outcome.status, 'unknown');
});

test('DD91-T38 サーバー確定後の状態保存失敗も、照会だけで復帰する', async () => {
  const f = fixture();
  const write = f.delivery.write;
  f.delivery.write = async (...args) => {
    if (args[3].status === 'confirmed') throw Error('QUOTA_AFTER_COMMIT');

    return write(...args);
  };
  await assert.rejects(f.controller.run(f.operation.operationId, 'send'), /QUOTA_AFTER_COMMIT/);
  assert.equal(f.current().outcome.status, 'unknown');
  f.delivery.write = write;
  assert.equal((await f.controller.run(f.operation.operationId, 'check')).status, 'confirmed');
  assert.equal(f.calls.filter((call) => call === 'send').length, 1);
});

test('DD91-T41 通信窓口が入力コピーを変更しても、固定した本文と次の照会内容を変えない', async () => {
  const f = fixture();
  const original = structuredClone(f.operation);
  f.transport.canSend = async (input) => { input.command.action = 'mutated'; return true; };
  const send = f.transport.send;
  f.transport.send = async (input) => { assert.deepEqual(input, original); await send(input); input.draftSnapshot.layout.sections.push({}); };
  assert.equal((await f.controller.run(f.operation.operationId, 'send')).status, 'confirmed');
  assert.deepEqual(f.operation, original);
});

test('DD91-T41 所有権で並行した二つの明示送信を直列化し、一度だけ送る', async () => {
  const f = fixture();
  const results = await Promise.all([f.controller.run(f.operation.operationId, 'send'), f.controller.run(f.operation.operationId, 'send')]);
  assert.deepEqual(results.map((result) => result.status), ['confirmed', 'confirmed']);
  assert.equal(f.calls.filter((call) => call === 'send').length, 1);
});

test('DD91-T41 送信中の認可失効では成功を返さず、不明記録を保全する', async () => {
  const f = fixture();
  const send = f.transport.send;
  f.transport.send = async (input) => { await send(input); f.revoke(); };
  await assert.rejects(f.controller.run(f.operation.operationId, 'send'), /ACCESS_REVOKED/);
  assert.equal(f.current().outcome.status, 'unknown');
  assert(!f.calls.includes('applied'));
});

test('DD91-T41 同じIDの固定入力が変わった場合と旧形式の本文不足を拒否する', async () => {
  const f = fixture();
  await f.controller.run(f.operation.operationId, 'send');
  f.operation.command.action = 'different';
  await assert.rejects(f.controller.run(f.operation.operationId, 'check'), /OPERATION_ID_REUSED/);
  delete f.operation.draftSnapshot;
  await assert.rejects(f.controller.run(f.operation.operationId, 'check'), /SEAT_OPERATION_SNAPSHOT_REQUIRED/);
});

test('DD91-T41 照会だけでは未送信操作を送らず、取得失敗を履歴なしと混同しない', async () => {
  const f = fixture();
  assert.deepEqual(await f.controller.run(f.operation.operationId, 'check'), { status: 'notFound' });
  assert.equal(f.current(), null);
  f.transport.lookup = async () => { throw Error('READ_FAILED'); };
  await assert.rejects(f.controller.run(f.operation.operationId, 'check'), /READ_FAILED/);
  assert.equal(f.current(), null);
});
