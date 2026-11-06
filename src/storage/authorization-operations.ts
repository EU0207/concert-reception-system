// 認可変更の固定入力を要求より先に暗号化保存する。結果不明でも削除しない。

import { openDeviceDatabase } from './device-database.ts';
import { encryptRecord, decryptRecord } from './device-vault.ts';
import type { DeviceKeyScope, EncryptedRecord, RecordIdentity } from './device-vault.ts';
import { isId, requireValue } from '../domain/seats/validation.ts';

export interface AuthorizationOperationJournal {
  save(operationId: string, input: unknown, assertAuthorized: () => void): Promise<void>;
  read(operationId: string, assertAuthorized: () => void): Promise<unknown | null>;
}

/** 同じIDの入力を不変にする。サーバーへの成功表示とは別の端末保全である。 */
export function createAuthorizationOperationJournal(
  scope: DeviceKeyScope,
): AuthorizationOperationJournal {
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
  const key = (operationId: string) =>
    JSON.stringify([scope.environmentId, scope.performanceId, scope.deviceUid, operationId]);
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
  return { save, read };
}
