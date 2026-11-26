// 認可変更の固定入力をIndexedDBへ暗号化保存し、同じ操作IDで読み出す。

import { openDeviceDatabase } from './device-database.ts';
import { encryptRecord, decryptRecord } from './device-vault.ts';
import type { DeviceKeyScope, EncryptedRecord, RecordIdentity } from './device-vault.ts';
import { isId, requireValue } from '../domain/seats/validation.ts';

export interface AuthorizationOperationJournal {
  save(operationId: string, input: unknown, assertAuthorized: () => void): Promise<void>;
  read(operationId: string, assertAuthorized: () => void): Promise<unknown | null>;
  list(assertAuthorized: () => void): Promise<string[]>;
}

/** 認可変更の固定入力を暗号化保存・読取りする窓口を作る。 */
export function createAuthorizationOperationJournal(
  scope: DeviceKeyScope,
): AuthorizationOperationJournal {
  /** 操作IDを、公演・端末に結んだ暗号化レコード識別子へ変換する。 */
  const identity = (operationId: string): RecordIdentity => {
    requireValue(isId(operationId), 'INVALID_OPERATION_ID');

    return {
      ...scope,
      schemaVersion: 1,
      recordKind: 'authorization-operation',
      recordId: operationId,
      dataRevision: 1,
    };
  };

  /** 公演・端末と操作IDから、端末内保存の検索キーを作る。 */
  const key = (operationId: string) =>
    JSON.stringify([scope.environmentId, scope.performanceId, scope.deviceUid, operationId]);

  /** 操作IDに対応する暗号化済みレコードをIndexedDBから読む。 */
  async function readRecord(operationId: string): Promise<EncryptedRecord | null> {
    const database = await openDeviceDatabase();

    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('authorizationOperations', 'readonly');
        const request = transaction.objectStore('authorizationOperations').get(key(operationId));

        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onabort = () => reject(new Error('AUTHORIZATION_OPERATION_READ_FAILED'));
        transaction.onerror = () => reject(new Error('AUTHORIZATION_OPERATION_READ_FAILED'));
      });
    } finally {
      database.close();
    }
  }

  /** 現在認可を確認し、固定入力を復号して返す。 */
  async function read(operationId: string, assertAuthorized: () => void): Promise<unknown | null> {
    const expected = identity(operationId);

    assertAuthorized();

    const record = await readRecord(operationId);

    assertAuthorized();

    if (!record) return null;

    const plaintext = await decryptRecord(expected, record, assertAuthorized);

    try {
      return JSON.parse(new TextDecoder().decode(plaintext));
    } finally {
      new Uint8Array(plaintext).fill(0);
    }
  }

  /** 固定入力を暗号化して保存し、同じIDの異なる入力を拒否する。 */
  async function save(
    operationId: string,
    input: unknown,
    assertAuthorized: () => void,
  ): Promise<void> {
    const expected = identity(operationId);
    const serialized = JSON.stringify(input);

    requireValue(typeof serialized === 'string', 'INVALID_OPERATION_INPUT');

    const plaintext = new TextEncoder().encode(serialized);
    let encrypted: EncryptedRecord;

    try {
      encrypted = await encryptRecord(expected, plaintext, assertAuthorized);
    } finally {
      plaintext.fill(0);
    }

    const database = await openDeviceDatabase();
    let previous: EncryptedRecord | undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('authorizationOperations', 'readwrite', {
          durability: 'strict',
        });
        const store = transaction.objectStore('authorizationOperations');
        const request = store.get(key(operationId));
        let failure: unknown;

        request.onsuccess = () => {
          try {
            assertAuthorized();
            previous = request.result;

            if (!previous) store.add(encrypted, key(operationId));
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(failure ?? new Error('AUTHORIZATION_OPERATION_SAVE_FAILED'));
        transaction.onerror = () => reject(new Error('AUTHORIZATION_OPERATION_SAVE_FAILED'));
      });
    } finally {
      database.close();
    }

    assertAuthorized();

    if (previous) {
      const bytes = await decryptRecord(expected, previous, assertAuthorized);

      try {
        requireValue(new TextDecoder().decode(bytes) === serialized, 'OPERATION_ID_REUSED');
      } finally {
        new Uint8Array(bytes).fill(0);
      }
    }
  }

  /** 同じ環境・公演・端末の操作IDだけを列挙し、本文は個別の復号確認へ渡す。 */
  async function list(assertAuthorized: () => void): Promise<string[]> {
    assertAuthorized();
    const database = await openDeviceDatabase();

    try {
      const ids = await new Promise<string[]>((resolve, reject) => {
        const result: string[] = [];
        const transaction = database.transaction('authorizationOperations', 'readonly');
        const cursor = transaction.objectStore('authorizationOperations').openKeyCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) return;
          try {
            const values: unknown = JSON.parse(String(item.key));
            if (Array.isArray(values) && values.length === 4 && values[0] === scope.environmentId &&
              values[1] === scope.performanceId && values[2] === scope.deviceUid && isId(values[3])) result.push(values[3]);
            item.continue();
          } catch { transaction.abort(); }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(new Error('AUTHORIZATION_OPERATION_READ_FAILED'));
        transaction.onerror = () => reject(new Error('AUTHORIZATION_OPERATION_READ_FAILED'));
      });
      assertAuthorized();
      return ids;
    } finally {
      database.close();
    }
  }

  return { save, read, list };
}
