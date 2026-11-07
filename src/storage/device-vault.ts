// 公演・端末専用の暗号鍵を管理する。IVを確保し、所属を照合して暗号化・復号する。

import type { Scope } from '../domain/seats/types.ts';
import { isId, nonnegative, positive, requireValue } from '../domain/seats/validation.ts';
import { validUid } from '../domain/authorization/policy.ts';
import { openDeviceDatabase } from './device-database.ts';

export interface DeviceKeyScope extends Scope {
  deviceUid: string;
  humanUid: string;
  /** 台帳と暗号化記録を結ぶ、端末登録時の保存領域識別子。 */
  storageEpoch: string;
}

interface KeyRecord extends DeviceKeyScope {
  schemaVersion: 1;
  keyVersion: 1;
  key: CryptoKey;
  /** IVの先頭4バイト。保存済みの連番と合わせて12バイトのIVにする。 */
  noncePrefix: Uint8Array;
  /** 次に確保するIVの連番。暗号化に使う前に保存を完了する。 */
  nextNonce: number;
}

export interface RecordIdentity extends DeviceKeyScope {
  schemaVersion: number;
  recordKind: string;
  recordId: string;
  dataRevision: number;
}

export interface EncryptedRecord extends RecordIdentity {
  algorithm: 'AES-GCM';
  keyVersion: 1;
  /** 暗号化ごとに変える12バイトの初期値。同じ鍵で再利用しない。 */
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}

/** 鍵の所属となる環境・公演と本人・端末の識別子を検証する。 */
function validateScope(scope: DeviceKeyScope): void {
  requireValue(
    isId(scope.environmentId) &&
      isId(scope.performanceId) &&
      isId(scope.storageEpoch) &&
      validUid(scope.deviceUid) &&
      validUid(scope.humanUid) &&
      scope.deviceUid !== scope.humanUid,
    'INVALID_KEY_SCOPE',
  );
}

/** 公演と端末を特定する、鍵保存の検索キーを作る。 */
function keyId(scope: DeviceKeyScope): string {
  validateScope(scope);

  return JSON.stringify([scope.environmentId, scope.performanceId, scope.deviceUid]);
}

/** 保存済みの鍵と所属・暗号方式が、期待する条件に一致するか確認する。 */
function validateKeyRecord(record: KeyRecord, scope: DeviceKeyScope): void {
  validateScope(scope);
  requireValue(
    record &&
      record.schemaVersion === 1 &&
      record.keyVersion === 1 &&
      keyId(record) === keyId(scope) &&
      record.humanUid === scope.humanUid &&
      record.storageEpoch === scope.storageEpoch,
    'KEY_BINDING_MISMATCH',
  );

  const key = record.key;

  requireValue(
    key instanceof CryptoKey &&
      key.type === 'secret' &&
      key.extractable === false &&
      key.algorithm.name === 'AES-GCM' &&
      (key.algorithm as AesKeyAlgorithm).length === 256 &&
      key.usages.length === 2 &&
      key.usages.includes('encrypt') &&
      key.usages.includes('decrypt'),
    'INVALID_DEVICE_KEY',
  );
  requireValue(
    record.noncePrefix instanceof Uint8Array &&
      record.noncePrefix.byteLength === 4 &&
      nonnegative(record.nextNonce),
    'INVALID_KEY_NONCE',
  );
}

/** 公演・端末に対応する鍵レコードをIndexedDBから読む。 */
async function readKey(scope: DeviceKeyScope): Promise<KeyRecord | undefined> {
  const id = keyId(scope),
    database = await openDeviceDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('deviceKeys', 'readonly');
      const request = transaction.objectStore('deviceKeys').get(id);

      transaction.oncomplete = () => resolve(request.result as KeyRecord | undefined);
      transaction.onabort = () => reject(new Error('KEY_READ_FAILED'));
      transaction.onerror = () => reject(new Error('KEY_READ_FAILED'));
    });
  } finally {
    database.close();
  }
}

/** 既存の鍵を確認し、許可された初回準備に限って新しい鍵を保存する。 */
export async function ensureDeviceKey(
  scope: DeviceKeyScope,
  allowInitialCreation: boolean,
): Promise<CryptoKey> {
  // 鍵を再生成すると既存の暗号文を読めなくなるため、初回準備だけ生成を許す。

  const prior = await readKey(scope);

  if (prior) {
    validateKeyRecord(prior, scope);

    return prior.key;
  }

  requireValue(allowInitialCreation === true, 'DEVICE_KEY_MISSING');

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const candidate: KeyRecord = {
    ...scope,
    schemaVersion: 1,
    keyVersion: 1,
    key,
    noncePrefix: crypto.getRandomValues(new Uint8Array(4)),
    nextNonce: 0,
  };
  const database = await openDeviceDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('deviceKeys', 'readwrite', {
        durability: 'strict',
      });
      const store = transaction.objectStore('deviceKeys'),
        request = store.get(keyId(scope));
      let selected: KeyRecord, failure: unknown;

      request.onsuccess = () => {
        try {
          selected = (request.result as KeyRecord | undefined) ?? candidate;
          validateKeyRecord(selected, scope);

          if (!request.result) store.add(selected, keyId(scope));
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(selected.key);
      transaction.onabort = () => reject(failure ?? new Error('KEY_SAVE_FAILED'));
      transaction.onerror = () => reject(new Error('KEY_SAVE_FAILED'));
    });
  } finally {
    database.close();
  }
}

/** 暗号化で使用するIVの連番を確保し、鍵とIVを返す。 */
async function reserveNonce(
  scope: DeviceKeyScope,
): Promise<{ key: CryptoKey; iv: Uint8Array<ArrayBuffer> }> {
  const database = await openDeviceDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('deviceKeys', 'readwrite', {
        durability: 'strict',
      });
      const store = transaction.objectStore('deviceKeys'),
        request = store.get(keyId(scope));
      let result: { key: CryptoKey; iv: Uint8Array<ArrayBuffer> }, failure: unknown;

      request.onsuccess = () => {
        try {
          const record = request.result as KeyRecord;

          requireValue(record, 'DEVICE_KEY_MISSING');
          validateKeyRecord(record, scope);
          requireValue(positive(record.nextNonce + 1), 'KEY_NONCE_EXHAUSTED');

          const iv = new Uint8Array(12);

          iv.set(record.noncePrefix);
          new DataView(iv.buffer).setBigUint64(4, BigInt(record.nextNonce));
          store.put({ ...record, nextNonce: record.nextNonce + 1 }, keyId(scope));
          result = { key: record.key, iv };
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? new Error('NONCE_SAVE_FAILED'));
      transaction.onerror = () => reject(new Error('NONCE_SAVE_FAILED'));
    });
  } finally {
    database.close();
  }
}

/** 所属・レコードIDと版を、暗号文へ結ぶ追加認証データにする。 */
function additionalData(identity: RecordIdentity): Uint8Array<ArrayBuffer> {
  validateScope(identity);
  requireValue(
    positive(identity.schemaVersion) &&
      nonnegative(identity.dataRevision) &&
      typeof identity.recordId === 'string' &&
      identity.recordId.length > 0 &&
      identity.recordId.length <= 128 &&
      /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(identity.recordKind),
    'INVALID_RECORD_IDENTITY',
  );

  return new TextEncoder().encode(
    JSON.stringify([
      'AES-GCM',
      1,
      identity.environmentId,
      identity.performanceId,
      identity.deviceUid,
      identity.humanUid,
      identity.storageEpoch,
      identity.schemaVersion,
      identity.recordKind,
      identity.recordId,
      identity.dataRevision,
    ]),
  );
}

/** 現在認可を確認し、レコードをAES-GCMで暗号化する。 */
export async function encryptRecord(
  identity: RecordIdentity,
  plaintext: Uint8Array,
  assertAuthorized: () => void,
): Promise<EncryptedRecord> {
  assertAuthorized();

  const aad = additionalData(identity);
  const { key, iv } = await reserveNonce(identity);

  assertAuthorized();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    new Uint8Array(plaintext).buffer,
  );

  assertAuthorized();

  return { ...identity, algorithm: 'AES-GCM', keyVersion: 1, iv, ciphertext };
}

/** 所属と現在認可を確認し、暗号文を復号する。 */
export async function decryptRecord(
  expected: RecordIdentity,
  record: EncryptedRecord,
  assertAuthorized: () => void,
): Promise<Uint8Array> {
  assertAuthorized();

  const expectedAad = additionalData(expected),
    actualAad = additionalData(record);

  requireValue(
    expectedAad.length === actualAad.length &&
      expectedAad.every((byte, i) => byte === actualAad[i]),
    'RECORD_BINDING_MISMATCH',
  );
  requireValue(
    record.algorithm === 'AES-GCM' &&
      record.keyVersion === 1 &&
      record.iv instanceof Uint8Array &&
      record.iv.length === 12 &&
      record.ciphertext instanceof ArrayBuffer,
    'INVALID_ENCRYPTED_RECORD',
  );

  const keyRecord = await readKey(expected);

  requireValue(keyRecord, 'DEVICE_KEY_MISSING');
  validateKeyRecord(keyRecord, expected);
  assertAuthorized();

  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(record.iv),
        additionalData: expectedAad,
      },
      keyRecord.key,
      record.ciphertext,
    ),
  );

  try {
    assertAuthorized();

    return plaintext;
  } catch (error) {
    plaintext.fill(0);

    throw error;
  }
}
