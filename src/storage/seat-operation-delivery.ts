// 席の固定操作の送信状態を暗号化し、下書きや固定入力を上書きせずに保存する。

import type { DeviceKeyScope, EncryptedRecord, RecordIdentity } from './device-vault.ts';
import { encryptRecord, decryptRecord } from './device-vault.ts';
import { openDeviceDatabase } from './device-database.ts';
import { isId, positive, nonnegative, requireValue } from '../domain/seats/validation.ts';

export interface SeatOperationReceipt {
  operationId: string;
  kind: 'share' | 'commit';
  // サーバーの保存形式を変更せず、アダプターが不変結果と固定入力を照合した値を渡す。
  inputDigest: string;
  resultRevision: number;
}

export type SeatDeliveryOutcome =
  | { status: 'unknown' }
  | { status: 'confirmed'; receipt: SeatOperationReceipt }
  | { status: 'conflict' };

export interface SeatDeliveryRecord {
  operationId: string;
  inputDigest: string;
  localRevision: number;
  outcome: SeatDeliveryOutcome;
}

export interface SeatDeliveryStore {
  /** 同じ本人・端末の操作に結び付けて状態を読む。 */
  read(operationId: string): Promise<SeatDeliveryRecord | null>;
  /** 期待ローカル版に一致する場合だけ状態を確定する。 */
  write(operationId: string, inputDigest: string, expectedRevision: number, outcome: SeatDeliveryOutcome): Promise<SeatDeliveryRecord>;
}

/** 未知の状態や異なる操作の結果を、確定済みとして保存しない。 */
export function validateSeatDelivery(record: SeatDeliveryRecord): void {
  requireValue(record && isId(record.operationId) && positive(record.localRevision) &&
    typeof record.inputDigest === 'string' && /^[a-f0-9]{64}$/.test(record.inputDigest), 'INVALID_SEAT_DELIVERY');
  const outcome = record.outcome;
  requireValue(outcome && ['unknown', 'confirmed', 'conflict'].includes(outcome.status), 'INVALID_SEAT_DELIVERY');
  if (outcome.status === 'confirmed') {
    const receipt = outcome.receipt;
    requireValue(receipt && receipt.operationId === record.operationId && receipt.inputDigest === record.inputDigest &&
      (receipt.kind === 'share' || receipt.kind === 'commit') && positive(receipt.resultRevision), 'INVALID_SEAT_RECEIPT');
  }
}

/** 現在認可と端末の鍵に結び付け、送信状態だけを比較交換で更新する窓口を作る。 */
export function createSeatDeliveryStore(scope: DeviceKeyScope, assertAuthorized: () => void): SeatDeliveryStore {
  const binding = structuredClone(scope);

  /** 既存の固定入力のキーと重ならない、状態専用のキーを作る。 */
  function key(operationId: string): string {
    requireValue(isId(operationId), 'INVALID_OPERATION_ID');

    return JSON.stringify(['seat-delivery', binding.environmentId, binding.performanceId, binding.deviceUid, operationId]);
  }

  /** 操作・所属・版を暗号文へ結び付ける。 */
  function identity(operationId: string, revision: number): RecordIdentity {
    return { ...binding, schemaVersion: 1, recordKind: 'seat-operation-delivery', recordId: operationId, dataRevision: revision };
  }

  /** 暗号文と内部の識別子・版を照合して復号する。 */
  async function decode(operationId: string, encrypted: EncryptedRecord): Promise<SeatDeliveryRecord> {
    const plaintext = await decryptRecord(identity(operationId, encrypted.dataRevision), encrypted, assertAuthorized);
    try {
      const record = JSON.parse(new TextDecoder().decode(plaintext)) as SeatDeliveryRecord;
      validateSeatDelivery(record);
      requireValue(record.operationId === operationId && record.localRevision === encrypted.dataRevision, 'INVALID_SEAT_DELIVERY');

      return record;
    } finally {
      plaintext.fill(0);
    }
  }

  /** 状態を暗号文で取得する。トランザクション完了後にも認可を確認する。 */
  async function encryptedRecord(operationId: string): Promise<EncryptedRecord | null> {
    assertAuthorized();
    const database = await openDeviceDatabase();
    try {
      const record = await new Promise<EncryptedRecord | null>((resolve, reject) => {
        const transaction = database.transaction('seatOperations', 'readonly');
        const request = transaction.objectStore('seatOperations').get(key(operationId));
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onabort = () => reject(new Error('SEAT_DELIVERY_READ_FAILED'));
      });
      assertAuthorized();

      return record;
    } finally {
      database.close();
    }
  }

  /** 操作の最新の送信状態を復元する。未作成は未送信状態として呼出元が扱う。 */
  async function read(operationId: string): Promise<SeatDeliveryRecord | null> {
    const record = await encryptedRecord(operationId);

    return record ? decode(operationId, record) : null;
  }

  /** 状態の期待版を照合し、終端結果の変更と古いタブの上書きを拒否する。 */
  async function write(operationId: string, inputDigest: string, expectedRevision: number, outcome: SeatDeliveryOutcome): Promise<SeatDeliveryRecord> {
    const fixedOutcome = structuredClone(outcome);
    requireValue(nonnegative(expectedRevision) && positive(expectedRevision + 1), 'INVALID_LOCAL_REVISION');
    const prior = await encryptedRecord(operationId);
    const previous = prior ? await decode(operationId, prior) : null;
    requireValue((previous?.localRevision ?? 0) === expectedRevision, 'STALE_SEAT_DELIVERY');
    requireValue(!previous || previous.inputDigest === inputDigest, 'OPERATION_ID_REUSED');
    requireValue(!previous || previous.outcome.status === 'unknown', 'SEAT_DELIVERY_FINAL');
    const next = { operationId, inputDigest, localRevision: expectedRevision + 1, outcome: fixedOutcome };
    validateSeatDelivery(next);
    const plaintext = new TextEncoder().encode(JSON.stringify(next));
    let encrypted: EncryptedRecord;
    try {
      encrypted = await encryptRecord(identity(operationId, next.localRevision), plaintext, assertAuthorized);
    } finally {
      plaintext.fill(0);
    }

    const database = await openDeviceDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('seatOperations', 'readwrite', { durability: 'strict' });
        const store = transaction.objectStore('seatOperations');
        const request = store.get(key(operationId));
        let failure: unknown;
        request.onsuccess = () => {
          try {
            assertAuthorized();
            const current = request.result as EncryptedRecord | undefined;
            // 復号中に他のタブが更新していたら、その暗号文を上書きしない。
            requireValue(current ? prior && current.dataRevision === prior.dataRevision &&
              current.recordId === prior.recordId && current.storageEpoch === prior.storageEpoch &&
              current.humanUid === prior.humanUid : !prior, 'STALE_SEAT_DELIVERY');
            store.put(encrypted, key(operationId));
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(failure ?? new Error('SEAT_DELIVERY_SAVE_FAILED'));
      });
      assertAuthorized();

      return next;
    } finally {
      database.close();
    }
  }

  return { read, write };
}
