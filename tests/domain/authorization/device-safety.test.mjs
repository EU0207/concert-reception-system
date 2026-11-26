// 端末の変更・代替保護と自己停止の拒否を、業務計算で確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  requireReplacementDevice,
  requireOwnerHandover,
  requireLocalDataDeletion,
  createDeviceChangePlan,
} from '../../../src/domain/authorization/index.ts';
import { snapshot, now } from './fixtures.mjs';

/** 管理者の2端末と代理管理者の端末を持つ架空台帳を作る。 */
function inventory() {
  const actor = snapshot();
  const deputyRole = { ...actor.role, humanUid: 'fictional-deputy', role: 'deputy' };
  const ownerB = { ...actor.device, deviceUid: 'fictional-owner-b' };
  const deputy = {
    ...ownerB,
    humanUid: deputyRole.humanUid,
    deviceUid: 'fictional-deputy-device',
    preparedRole: 'deputy',
  };
  return {
    actor,
    ownerB,
    deputy,
    data: { roles: [actor.role, deputyRole], devices: [actor.device, ownerB, deputy] },
  };
}

test('AUTH110-T07 端末の停止・解除・廃止は期待版を守り、鍵と準備版を変えない', () => {
  const f = inventory(),
    input = {
      operationId: '00000000-0000-4000-8000-000000000004',
      targetDeviceUid: f.ownerB.deviceUid,
      expectedRevision: 1,
      kind: 'stop',
      replacementDeviceUid: '',
    };
  const stopped = createDeviceChangePlan(f.actor, f.data, input, now);
  assert.equal(stopped.device.active, false);
  assert.equal(stopped.device.storageEpoch, f.ownerB.storageEpoch);
  assert.equal(stopped.device.preparedRoleRevision, f.ownerB.preparedRoleRevision);
  assert.equal(stopped.operation.resultingRevision, 2);
  assert.throws(() =>
    createDeviceChangePlan(f.actor, f.data, { ...input, expectedRevision: 2 }, now),
  );
  assert.throws(() => createDeviceChangePlan(f.actor, f.data, { ...input, kind: 'resume' }, now));
  assert.throws(() => createDeviceChangePlan(f.actor, f.data, { ...input, kind: 'retire' }, now));
  const retired = createDeviceChangePlan(
    f.actor,
    f.data,
    { ...input, kind: 'retire', replacementDeviceUid: f.actor.deviceAuthUid },
    now,
  );
  assert.equal(retired.device.retired, true);
});

test('DEVICE310-T01 管理者と代理管理者の自己停止を拒否し、別端末の停止は許可する', () => {
  const f = inventory();
  for (const role of ['owner', 'deputy']) {
    const actor = snapshot(role);
    const before = structuredClone(actor.device);
    const input = { operationId: '00000000-0000-4000-8000-000000000010',
      targetDeviceUid: actor.deviceAuthUid, expectedRevision: actor.device.revision ?? 1,
      kind: 'stop', replacementDeviceUid: '' };
    assert.throws(() => createDeviceChangePlan(actor,
      { roles: [actor.role], devices: [actor.device] }, input, now),
    { code: 'SELF_DEVICE_STOP_FORBIDDEN' });
    assert.deepEqual(actor.device, before);
  }
  const stopped = createDeviceChangePlan(f.actor, f.data,
    { operationId: '00000000-0000-4000-8000-000000000011', targetDeviceUid: f.ownerB.deviceUid,
      expectedRevision: 1, kind: 'stop', replacementDeviceUid: '' }, now);
  assert.equal(stopped.device.active, false);
});

test('CONF066・069-T01 管理者には別の管理者端末が必要。代理の端末で代用しない', () => {
  const f = inventory();
  assert.equal(
    requireReplacementDevice(f.actor, f.data, f.actor.deviceAuthUid, now).deviceUid,
    f.ownerB.deviceUid,
  );
  for (const patch of [
    { active: false },
    { approved: false },
    { retired: true },
    { preparedRoleRevision: 0 },
    { preparedRole: 'deputy' },
  ]) {
    const altered = structuredClone(f.data);
    Object.assign(altered.devices[1], patch);
    assert.throws(() => requireReplacementDevice(f.actor, altered, f.actor.deviceAuthUid, now));
  }
  const withoutOwnerB = { ...f.data, devices: [f.actor.device, f.deputy] };
  assert.throws(() => requireReplacementDevice(f.actor, withoutOwnerB, f.actor.deviceAuthUid, now));
  assert.equal(
    requireReplacementDevice(f.actor, f.data, f.deputy.deviceUid, now).humanUid,
    f.actor.role.humanUid,
  );
  const duplicateOwner = structuredClone(f.data);
  duplicateOwner.roles.push({ ...f.actor.role, humanUid: 'other-owner' });
  assert.throws(() =>
    requireReplacementDevice(f.actor, duplicateOwner, f.actor.deviceAuthUid, now),
  );
});

test('CONF069-T02 引継ぎは現管理者と後任のGoogle本人確認・受諾・有効端末を必要とする', () => {
  const f = inventory(),
    acceptance = {
      humanUid: 'fictional-deputy',
      provider: 'google.com',
      authenticatedAt: now - 900000,
      accepted: true,
    };
  requireOwnerHandover(f.actor, f.data, acceptance.humanUid, acceptance, now);
  for (const patch of [
    { accepted: false },
    { humanUid: 'other' },
    { provider: 'password' },
    { authenticatedAt: now - 900001 },
    { authenticatedAt: now + 1 },
  ]) {
    assert.throws(() =>
      requireOwnerHandover(f.actor, f.data, acceptance.humanUid, { ...acceptance, ...patch }, now),
    );
  }
  assert.throws(() =>
    requireOwnerHandover(snapshot('deputy'), f.data, acceptance.humanUid, acceptance, now),
  );
  f.deputy.retired = true;
  assert.throws(() => requireOwnerHandover(f.actor, f.data, acceptance.humanUid, acceptance, now));
});

test('AUTH110-T06 未受領・隔離・不明結果と締め条件が残る間は端末のデータ削除を拒否する', () => {
  const safe = {
    onlineConfirmed: true,
    allReceived: true,
    pending: 0,
    quarantined: 0,
    unknown: 0,
    closed: true,
    retirementApproved: false,
    independentlyConfirmedTwice: true,
  };
  requireLocalDataDeletion(safe);
  for (const patch of [
    { onlineConfirmed: false },
    { allReceived: false },
    { pending: 1 },
    { quarantined: 1 },
    { unknown: 1 },
    { closed: false },
    { independentlyConfirmedTwice: false },
  ]) {
    assert.throws(() => requireLocalDataDeletion({ ...safe, ...patch }));
  }
});
