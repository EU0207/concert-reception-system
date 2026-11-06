import { test, expect } from '@playwright/test';

const scope = {
  environmentId: '00000000-0000-4000-8000-000000000001',
  performanceId: '00000000-0000-4000-8000-000000000002',
  deviceUid: 'fictional-device',
  humanUid: 'fictional-human',
  storageEpoch: '00000000-0000-4000-8000-000000000003',
};
const identity = {
  ...scope,
  schemaVersion: 1,
  recordKind: 'draft',
  recordId: 'fictional-record',
  dataRevision: 1,
};

test('AUTH110-B07 認可変更の固定入力を暗号化保全し、同じIDの別入力と途中失効を拒否する', async ({
  page,
}) => {
  const result = await page.evaluate(async (scope) => {
    const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
    const { createAuthorizationOperationJournal } = await import(
      '/src/storage/authorization-operations.ts'
    );
    await ensureDeviceKey(scope, true);
    const journal = createAuthorizationOperationJournal(scope);
    const operationId = crypto.randomUUID(),
      input = { kind: 'fictional-operation', expectedRevision: 1 };
    let enabled = true;
    const authorized = () => {
      if (!enabled) throw Error('revoked');
    };
    await Promise.all([
      journal.save(operationId, input, authorized),
      journal.save(operationId, input, authorized),
    ]);
    let conflict = false,
      revoked = false;
    try {
      await journal.save(operationId, { ...input, expectedRevision: 2 }, authorized);
    } catch {
      conflict = true;
    }
    const saved = await journal.read(operationId, authorized);
    enabled = false;
    try {
      await journal.read(operationId, authorized);
    } catch {
      revoked = true;
    }
    return { conflict, revoked, saved };
  }, scope);
  expect(result).toEqual({
    conflict: true,
    revoked: true,
    saved: { kind: 'fictional-operation', expectedRevision: 1 },
  });
});

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4181/');
});

test('AUTH110-B01 非抽出の鍵を一体保存し、競合と再起動でも同じ鍵を使う', async ({ page }) => {
  const saved = await page.evaluate(
    async ({ scope, identity }) => {
      const vault = await import('/src/storage/device-vault.ts');
      const keys = await Promise.all([
        vault.ensureDeviceKey(scope, true),
        vault.ensureDeviceKey(scope, true),
      ]);
      for (const key of keys) {
        if (key.extractable || key.algorithm.name !== 'AES-GCM' || key.algorithm.length !== 256)
          throw Error('wrong-key');
        try {
          await crypto.subtle.exportKey('raw', key);
          throw Error('export-allowed');
        } catch (error) {
          if (error.message === 'export-allowed') throw error;
        }
      }
      const record = await vault.encryptRecord(
        identity,
        new TextEncoder().encode('架空の下書き'),
        () => {},
      );
      return {
        ...record,
        iv: Array.from(record.iv),
        ciphertext: Array.from(new Uint8Array(record.ciphertext)),
      };
    },
    { scope, identity },
  );
  await page.reload();
  const result = await page.evaluate(
    async ({ scope, identity, saved }) => {
      const vault = await import('/src/storage/device-vault.ts');
      const key = await vault.ensureDeviceKey(scope, false);
      const record = {
        ...saved,
        iv: new Uint8Array(saved.iv),
        ciphertext: new Uint8Array(saved.ciphertext).buffer,
      };
      const plaintext = await vault.decryptRecord(identity, record, () => {});
      return {
        text: new TextDecoder().decode(plaintext),
        extractable: key.extractable,
      };
    },
    { scope, identity, saved },
  );
  expect(result).toEqual({ text: '架空の下書き', extractable: false });
});

test('AUTH110-B02 同じ鍵のIVは並行暗号化でも重複せず、連番を保存する', async ({ page }) => {
  const result = await page.evaluate(
    async ({ scope, identity }) => {
      const vault = await import('/src/storage/device-vault.ts');
      await vault.ensureDeviceKey(scope, true);
      const records = await Promise.all(
        Array.from({ length: 64 }, (_, i) =>
          vault.encryptRecord(
            { ...identity, recordId: 'record-' + i },
            new Uint8Array([i]),
            () => {},
          ),
        ),
      );
      const nonces = records.map((record) => Array.from(record.iv).join(','));
      const decoded = await Promise.all(
        records.map((record) => vault.decryptRecord(record, record, () => {})),
      );
      return {
        unique: new Set(nonces).size,
        correct: decoded.every((bytes, i) => bytes[0] === i),
      };
    },
    { scope, identity },
  );
  expect(result).toEqual({ unique: 64, correct: true });
});

test('AUTH110-B03 所属・形式版・IDと暗号文の差替え、途中失効を拒否する', async ({ page }) => {
  const result = await page.evaluate(
    async ({ scope, identity }) => {
      const vault = await import('/src/storage/device-vault.ts');
      await vault.ensureDeviceKey(scope, true);
      const record = await vault.encryptRecord(identity, new Uint8Array([1, 2, 3]), () => {});
      let denied = 0;
      for (const patch of [
        { environmentId: scope.performanceId },
        { performanceId: scope.environmentId },
        { deviceUid: 'other-device' },
        { humanUid: 'other-human' },
        { storageEpoch: scope.environmentId },
        { schemaVersion: 2 },
        { recordKind: 'reception' },
        { recordId: 'other-record' },
        { dataRevision: 2 },
      ]) {
        try {
          await vault.decryptRecord({ ...identity, ...patch }, record, () => {});
        } catch {
          denied++;
        }
      }
      const changed = { ...record, recordId: 'tampered' };
      try {
        await vault.decryptRecord(changed, changed, () => {});
      } catch {
        denied++;
      }
      const corrupt = record.ciphertext.slice(0);
      new Uint8Array(corrupt)[0] ^= 1;
      try {
        await vault.decryptRecord(identity, { ...record, ciphertext: corrupt }, () => {});
      } catch {
        denied++;
      }
      let calls = 0;
      try {
        await vault.decryptRecord(identity, record, () => {
          if (++calls === 3) throw Error('revoked');
        });
      } catch {
        denied++;
      }
      await vault.ensureDeviceKey(scope, false);
      const recovered = await vault.decryptRecord(identity, record, () => {});
      return { denied, retained: recovered.length === 3 };
    },
    { scope, identity },
  );
  expect(result).toEqual({ denied: 12, retained: true });
});

test('AUTH110-B04 鍵の保存失敗を成功とせず、準備済みの鍵欠落を再生成しない', async ({ page }) => {
  const result = await page.evaluate(async (scope) => {
    const vault = await import('/src/storage/device-vault.ts');
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function () {
      throw new DOMException('fictional quota', 'QuotaExceededError');
    };
    let saveFailed = false,
      missingRejected = false;
    try {
      await vault.ensureDeviceKey(scope, true);
    } catch {
      saveFailed = true;
    } finally {
      IDBObjectStore.prototype.add = original;
    }
    try {
      await vault.ensureDeviceKey(scope, false);
    } catch {
      missingRejected = true;
    }
    return { saveFailed, missingRejected };
  }, scope);
  expect(result).toEqual({ saveFailed: true, missingRejected: true });
});

test('AUTH110-B05 本人・storageEpochの変更で既存鍵を上書きしない', async ({ page }) => {
  const result = await page.evaluate(async (scope) => {
    const vault = await import('/src/storage/device-vault.ts');
    await vault.ensureDeviceKey(scope, true);
    let denied = 0;
    for (const patch of [{ humanUid: 'other-human' }, { storageEpoch: scope.environmentId }]) {
      try {
        await vault.ensureDeviceKey({ ...scope, ...patch }, true);
      } catch {
        denied++;
      }
    }
    const key = await vault.ensureDeviceKey(scope, false);
    return { denied, retained: key.extractable === false };
  }, scope);
  expect(result).toEqual({ denied: 2, retained: true });
});

test('AUTH110-B06 IV連番の上限では暗号化を拒否し、0へ巻き戻さない', async ({ page }) => {
  const result = await page.evaluate(
    async ({ scope, identity }) => {
      const vault = await import('/src/storage/device-vault.ts');
      await vault.ensureDeviceKey(scope, true);
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('concert-reception-device');
        request.onsuccess = () => {
          const database = request.result,
            transaction = database.transaction('deviceKeys', 'readwrite');
          const store = transaction.objectStore('deviceKeys');
          const id = JSON.stringify([scope.environmentId, scope.performanceId, scope.deviceUid]);
          const record = store.get(id);
          record.onsuccess = () =>
            store.put({ ...record.result, nextNonce: Number.MAX_SAFE_INTEGER }, id);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = reject;
        };
      });
      try {
        await vault.encryptRecord(identity, new Uint8Array([1]), () => {});
        return false;
      } catch (error) {
        return error.code === 'KEY_NONCE_EXHAUSTED';
      }
    },
    { scope, identity },
  );
  expect(result).toBe(true);
});
