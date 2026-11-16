// 席の固定操作を明示送信し、通信中断後は同じIDの照会だけで復帰する。

import type { DeviceKeyScope } from './device-vault.ts';
import type { PendingSeatOperation } from './seat-drafts.ts';
import type { SeatDeliveryOutcome, SeatDeliveryStore, SeatOperationReceipt } from './seat-operation-delivery.ts';
import { validateSeatDelivery } from './seat-operation-delivery.ts';
import { checkScope, isId, requireValue } from '../domain/seats/validation.ts';

export type SeatRemoteResult =
  | { status: 'notFound' }
  | { status: 'preparing' }
  | { status: 'conflict' }
  | { status: 'confirmed'; receipt: SeatOperationReceipt };

export interface SeatOperationTransport {
  /** 現在認可で不変結果を照会し、固定した入力・期待版との一致を検査する。 */
  lookup(operation: PendingSeatOperation, inputDigest: string): Promise<SeatRemoteResult>;
  // conflictは同じ操作IDの不変な拒否結果に限る。現在版が異なるだけならcanSendで扱う。
  /** 明示再送前に現在版・未解決操作・認可を再検査する。notFoundだけでは再送を許可しない。 */
  canSend(operation: PendingSeatOperation): Promise<boolean>;
  /** 固定された内容だけを送る。結果不明の自動再試行とIDの再生成を行わない。 */
  send(operation: PendingSeatOperation): Promise<void>;
  /** 結果が指す同じ確定版の内容を検査する。現在のheadだけから成功を推測しない。 */
  verifyApplied(operation: PendingSeatOperation, receipt: SeatOperationReceipt): Promise<void>;
}

interface ControllerContext {
  scope: DeviceKeyScope;
  operations: { readPendingSeatOperation(operationId: string): Promise<PendingSeatOperation | null> };
  delivery: SeatDeliveryStore;
  transport: SeatOperationTransport;
  assertAuthorized(): void;
  // テストでも省略しない。実ブラウザーでは同じ公演・端末のWeb Locksを使う。
  withOwnership<T>(name: string, action: () => Promise<T>): Promise<T>;
}

/** 固定入力全体の識別値を作る。下書き本文の値だけで別の要求を同一扱いにしない。 */
export async function seatOperationDigest(operation: PendingSeatOperation): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(operation));
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } finally {
    bytes.fill(0);
  }
}

/** 同じ端末・公演の送信管理を一つだけ動かすブラウザー所有権を取得する。 */
export async function withSeatOperationOwnership<T>(name: string, action: () => Promise<T>): Promise<T> {
  requireValue(typeof navigator !== 'undefined' && navigator.locks, 'SEAT_OPERATION_OWNERSHIP_UNAVAILABLE');

  return navigator.locks.request(name, { mode: 'exclusive' }, action);
}

/** 固定操作の送信・照会・明示再送を扱う。作成や回線復帰だけでは通信しない。 */
export function createSeatOperationController(context: ControllerContext) {
  const binding = structuredClone(context.scope);
  const lockName = JSON.stringify(['seat-operation', binding.environmentId, binding.performanceId, binding.deviceUid]);

  /** 操作IDと現在の固定入力を検査し、通信・状態記録に使うコピーを返す。 */
  async function fixedOperation(operationId: string): Promise<PendingSeatOperation> {
    requireValue(isId(operationId), 'INVALID_OPERATION_ID');
    context.assertAuthorized();
    const saved = await context.operations.readPendingSeatOperation(operationId);
    context.assertAuthorized();
    requireValue(saved && saved.operationId === operationId && saved.status === 'prepared' &&
      (saved.kind === 'share' || saved.kind === 'commit'), 'INVALID_SEAT_OPERATION');
    checkScope(saved.command, binding);
    requireValue(saved.draftSnapshot && saved.draftSnapshot.draftId === saved.draftId, 'SEAT_OPERATION_SNAPSHOT_REQUIRED');
    checkScope(saved.draftSnapshot.layout, binding);

    return structuredClone(saved);
  }

  /** 通常送信、結果照会または利用者が選んだ再送を、所有権の中で実行する。 */
  async function run(operationId: string, action: 'send' | 'check' | 'retry'): Promise<SeatDeliveryOutcome | { status: 'notFound' }> {
    requireValue(['send', 'check', 'retry'].includes(action), 'INVALID_SEAT_DELIVERY_ACTION');

    return context.withOwnership(lockName, async () => {
      const operation = await fixedOperation(operationId);
      const digest = await seatOperationDigest(operation);
      let local = await context.delivery.read(operationId);
      context.assertAuthorized();
      if (local) {
        validateSeatDelivery(local);
        requireValue(local.inputDigest === digest, 'OPERATION_ID_REUSED');
        if (local.outcome.status === 'confirmed')
          requireValue(local.outcome.receipt.kind === operation.kind, 'INVALID_SEAT_RECEIPT');
        if (local.outcome.status !== 'unknown') return structuredClone(local.outcome);
      }
      requireValue(action !== 'send' || !local, 'SEAT_OPERATION_RESULT_REQUIRED');

      /** 結果の照合と同じ確定版の検査を終えてから、終端状態を保存する。 */
      async function reconcile(result: SeatRemoteResult): Promise<SeatDeliveryOutcome | null> {
        context.assertAuthorized();
        requireValue(result && ['notFound', 'preparing', 'conflict', 'confirmed'].includes(result.status), 'INVALID_SEAT_REMOTE_RESULT');
        if (result.status === 'notFound') return null;
        if (result.status === 'preparing') {
          if (!local) local = await context.delivery.write(operationId, digest, 0, { status: 'unknown' });
          context.assertAuthorized();

          return { status: 'unknown' };
        }
        if (result.status === 'confirmed') {
          validateSeatDelivery({ operationId, inputDigest: digest, localRevision: 1, outcome: result });
          requireValue(result.receipt.kind === operation.kind, 'INVALID_SEAT_RECEIPT');
          await context.transport.verifyApplied(structuredClone(operation), structuredClone(result.receipt));
          context.assertAuthorized();
        }
        local = await context.delivery.write(operationId, digest, local?.localRevision ?? 0, result);
        context.assertAuthorized();

        return structuredClone(local.outcome);
      }

      const known = await reconcile(await context.transport.lookup(structuredClone(operation), digest));
      // 構成共有の準備だけは、固定入力と全基準版を再照合した明示操作で再開できる。
      // 確定処理のpreparingを、同じ条件で再送可能とは扱わない。
      if (known && !(action === 'retry' && operation.kind === 'share' && known.status === 'unknown')) return known;
      if (action === 'check') return local ? { status: 'unknown' } : { status: 'notFound' };

      const allowed = await context.transport.canSend(structuredClone(operation));
      context.assertAuthorized();
      if (!allowed) {
        // 先行要求の確定で版が進んだ可能性がある。再送不可と、サーバーの不変な拒否結果を混同しない。
        if (!local) local = await context.delivery.write(operationId, digest, 0, { status: 'unknown' });
        context.assertAuthorized();

        return { status: 'conflict' };
      }

      // 送信前に結果不明を永続化する。送信後にアプリが終了しても未送信へ戻らない。
      local = await context.delivery.write(operationId, digest, local?.localRevision ?? 0, { status: 'unknown' });
      context.assertAuthorized();
      await context.transport.send(structuredClone(operation));
      context.assertAuthorized();

      return await reconcile(await context.transport.lookup(structuredClone(operation), digest)) ?? { status: 'unknown' };
    });
  }

  return { run };
}
