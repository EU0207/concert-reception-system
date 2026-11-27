// 現在認可と暗号化済み固定入力を、端末管理画面へ接続する。

import type { createAuthorizationPort } from './authorization-port.ts';
import type { DeviceKeyScope } from '../../storage/device-vault.ts';
import { ensureDeviceKey } from '../../storage/device-vault.ts';
import { createAuthorizationOperationJournal } from '../../storage/authorization-operations.ts';
import type { DeviceManagementUiPort, DeviceManagementView } from '../../app/device-management-types.ts';
import type { DeviceChangeInput } from '../../domain/authorization/device-safety.ts';
import { authorizeOnline, RECENT_AUTH_WINDOW } from '../../domain/authorization/policy.ts';
import { requireValue } from '../../domain/seats/validation.ts';

/** 準備済み端末の既存鍵を使い、入力保全・同一ID照会と明示送信を提供する。 */
export function createDeviceManagementUiPort(
  authorization: Awaited<ReturnType<typeof createAuthorizationPort>>,
  binding: DeviceKeyScope,
): DeviceManagementUiPort {
  const journal = createAuthorizationOperationJournal(binding);
  const listeners = new Set<() => void>(), completed = new Set<string>(), known = new Set<string>();
  let current: DeviceManagementView | undefined, locked = true, disposed = false, generation = 0, loadedAt = 0;
  let expiry: ReturnType<typeof setTimeout> | undefined;

  /** 停止・権限変更と通信断では、古い台帳による通常操作を直ちに止める。 */
  function invalidate() {
    clearTimeout(expiry);
    locked = true;
    current = undefined;
    generation++;
    for (const listener of listeners) listener();
  }

  const unsubscribe = authorization.onInvalidate(invalidate);

  /** SDKの本人・端末と時間を再照合し、保存中の主体変更も拒否する。 */
  function assertAuthorized() {
    requireValue(!disposed && !locked && current, 'AUTHORIZATION_RECHECK_REQUIRED');
    const identity = authorization.identity();
    requireValue(identity.human?.uid === binding.humanUid && identity.deviceUid === binding.deviceUid,
      'PRINCIPAL_CHANGED');
    authorizeOnline(current.snapshot, 'manageDevices', current.serverNow + Math.max(0, Math.floor(performance.now() - loadedAt)));
  }

  /** 現在台帳と、この端末に残る未完了の固定入力を復元する。自動送信は行わない。 */
  async function load(): Promise<DeviceManagementView> {
    requireValue(!disposed, 'AUTHORIZATION_DISPOSED');
    clearTimeout(expiry);
    locked = true;
    const version = ++generation;
    const result = await authorization.devices.list();
    const actor = result.snapshot;
    requireValue(version === generation && !disposed && actor.environmentId === binding.environmentId &&
      actor.performanceId === binding.performanceId && actor.role.humanUid === binding.humanUid &&
      actor.deviceAuthUid === binding.deviceUid && actor.device.storageEpoch === binding.storageEpoch, 'KEY_BINDING_MISMATCH');
    current = { ...result, pending: [], obsolete: [] };
    loadedAt = performance.now();
    locked = false;
    try {
      for (const id of await journal.list(assertAuthorized)) {
        assertAuthorized();
        if (completed.has(id)) continue;
        const saved = await journal.read(id, assertAuthorized) as { kind?: string; input?: DeviceChangeInput } | null;
        if (saved?.kind !== 'deviceChange') continue;
        requireValue(saved.input?.operationId === id, 'FIXED_OPERATION_REQUIRED');
        known.add(id);
        const receipt = await authorization.devices.receipt(id);
        assertAuthorized();
        if (receipt) completed.add(id);
        else {
          const device = current.inventory.devices.find(item => item.deviceUid === saved.input!.targetDeviceUid);
          // 版は単調増加するため、旧版の入力は以後確定できない。本文は消さず、再確認用に区別する。
          if (device && (device.revision ?? 1) !== saved.input.expectedRevision) current.obsolete.push(saved.input);
          else current.pending.push(saved.input);
        }
      }
      assertAuthorized();
      const until = Math.min(actor.role.endsAt, actor.session.expiresAt, actor.session.humanAuthTime + RECENT_AUTH_WINDOW + 1);
      const remaining = until - current.serverNow - Math.max(0, Math.floor(performance.now() - loadedAt));
      requireValue(remaining > 0, 'AUTHORIZATION_EXPIRED');
      expiry = setTimeout(invalidate, remaining);
      return structuredClone({ ...current, serverNow: current.serverNow + Math.max(0, Math.floor(performance.now() - loadedAt)) });
    } catch (error) {
      locked = true;
      throw error;
    }
  }

  return {
    load,
    /** 既存鍵を確認し、端末内の保存完了後だけ送信段階へ進める。 */
    async prepare(input) {
      assertAuthorized();
      await ensureDeviceKey(binding, false);
      assertAuthorized();
      await authorization.devices.prepare(input, journal, assertAuthorized);
      known.add(input.operationId);
    },

    /** 利用者が明示した同じ操作IDだけを、最新認可・版で確定する。 */
    async commit(id) {
      assertAuthorized();
      requireValue(known.has(id), 'FIXED_OPERATION_REQUIRED');
      await authorization.devices.commit(id, journal, assertAuthorized);
      completed.add(id);
    },

    /** 応答不明時も、既知の操作結果だけを照会する。再送は行わない。 */
    async receipt(id) {
      requireValue(!disposed && known.has(id), 'FIXED_OPERATION_REQUIRED');
      const result = await authorization.devices.receipt(id);
      if (result) completed.add(id);
      return result !== null;
    },

    onInvalidate: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },

    /** 画面の購読だけを片付け、鍵・暗号化された固定入力は保持する。 */
    dispose() { disposed = true; locked = true; generation++; clearTimeout(expiry); unsubscribe(); listeners.clear(); current = undefined; },
  };
}
