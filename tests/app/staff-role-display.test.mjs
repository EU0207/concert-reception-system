// 任期終了の表示だけを一般受付へ戻し、保存役割や認可を変更しないことを確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffRoleDisplayName } from '../../src/app/staff-role-display.ts';
import { authorizeOnline } from '../../src/domain/authorization/policy.ts';
import { now, snapshot } from '../domain/authorization/fixtures.mjs';

test('ROLE315-D01 任期終了の境界で表示が変わり、保存役割・認可は変更しない', () => {
  const data = snapshot('temporary'); data.role.endsAt = now;
  const original = structuredClone(data);
  assert.equal(staffRoleDisplayName(data.role, now - 1, data.staffDeadline), '臨時管理者');
  assert.equal(staffRoleDisplayName(data.role, now, data.staffDeadline), '一般受付担当者');
  assert.deepEqual(data, original);
  assert.throws(() => authorizeOnline(data, 'manualReception', now), { code: 'ROLE_EXPIRED_OR_INACTIVE' });
});

test('ROLE315-D02 公演期限後・無効役割を一般受付へ復帰した表示にしない', () => {
  const data = snapshot('temporary'); data.role.endsAt = now;
  assert.equal(staffRoleDisplayName(data.role, now, now), '臨時管理者');
  assert.equal(staffRoleDisplayName({ ...data.role, active: false }, now, data.staffDeadline), '臨時管理者');
});
