// #104-Aの暗号化保存・版競合・途中失敗を実ブラウザーのIndexedDBで確認する。

import { test, expect } from '@playwright/test';

const scope = {
  environmentId: '00000000-0000-4000-8000-000000000001',
  performanceId: '00000000-0000-4000-8000-000000000002',
  humanUid: 'fictional-human',
  deviceUid: 'fictional-device',
  storageEpoch: '00000000-0000-4000-8000-000000000003',
};

/** 架空の公演・端末で、製品の保存窓口を使うテスト入力を準備する。 */
async function setup(page, scope, large = false) {
  await page.goto('http://127.0.0.1:4181/');
  await page.evaluate(async ({ scope, large }) => {
    const { ensureDeviceKey } = await import('/src/storage/device-vault.ts');
    const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
    const { createLayout, createSection, numberInitial } = await import('/src/domain/seats/index.ts');
    await ensureDeviceKey(scope, true);

    const performance = { environmentId: scope.environmentId, performanceId: scope.performanceId };
    let layout = createLayout(performance);
    if (large) {
      for (const name of ['架空の第一区画', '架空の第二区画']) {
        layout = createSection(layout, {
          name, rows: 10, columns: 25, axis: 'horizontal', seatOrder: 'forward',
          lines: Array.from({ length: 10 }, (_, index) => ({ name: String(index + 1), startNumber: 1 })),
        }).after;
        const { section } = layout.sections.at(-1);
        const selections = Object.fromEntries(section.cells.map((cell) => [cell.cellId, 'seat']));
        layout = numberInitial(layout, section.sectionId, selections).after;
      }
    }

    const baseVersions = {
      layoutRevision: 3, assignmentRevision: 2, ticketRevision: 1, controlRevision: 6, attendeeRevision: 4,
    };
    window.draftInput = { draftId: crypto.randomUUID(), layout, baseVersions };
    window.seatOperation = {
      operationId: crypto.randomUUID(),
      kind: 'commit',
      expectedVersions: { ...baseVersions, roleRevision: 1, deviceRevision: 1 },
      command: { ...performance, action: 'fictional-save' },
    };
    window.seatDraftStore = createSeatDraftStore(scope, () => {
      if (window.seatAccessRevoked) throw new Error('ACCESS_REVOKED');
    });
  }, { scope, large });
}

test('DD91-T37 500席・複数区画の保存と固定操作を再読み込み後に復元する', async ({ page }) => {
  await setup(page, scope, true);
  const external = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4181/')) external.push(request.url());
  });

  const fixed = await page.evaluate(async () => {
    const { draftInput: input, seatOperation: operation, seatDraftStore: store } = window;
    await store.saveLocalDraft(input, 0);
    const prepared = await store.prepareSeatOperation(input, 1, operation);

    return { input, operation, prepared };
  });
  expect(fixed.input.layout.sections.map((section) => section.seats.length)).toEqual([250, 250]);
  expect(fixed.prepared).toMatchObject({ localRevision: 2, operationId: fixed.operation.operationId });

  await page.reload();
  const restored = await page.evaluate(async ({ scope, operationId }) => {
    const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
    const store = createSeatDraftStore(scope, () => {});
    return { draft: await store.loadLocalDraft(), pending: await store.readPendingSeatOperation(operationId) };
  }, { scope, operationId: fixed.operation.operationId });

  expect(restored.draft).toMatchObject({ ...fixed.input, localRevision: 2, savedAt: expect.any(Number) });
  expect(restored.pending).toMatchObject({
    ...fixed.operation,
    draftId: fixed.input.draftId,
    draftRevision: 2,
    draftDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    status: 'prepared',
  });
  expect(external).toEqual([]);
});

test('DD91-T15・T41 新しい下書きで固定操作の構成を変えず、送信状態を暗号化して復元する', async ({ page }) => {
  await setup(page, scope, true);
  const saved = await page.evaluate(async (scope) => {
    const { createSeatDeliveryStore } = await import('/src/storage/seat-operation-delivery.ts');
    const { seatOperationDigest } = await import('/src/storage/seat-operation-controller.ts');
    const { openDeviceDatabase } = await import('/src/storage/device-database.ts');
    const { seatDraftStore: store, draftInput: input, seatOperation: operation } = window;
    input.baseVersions.calendarRevision = 1;
    operation.expectedVersions.calendarRevision = 1;
    await store.prepareSeatOperation(input, 0, operation);
    const fixed = await store.readPendingSeatOperation(operation.operationId);
    const digest = await seatOperationDigest(fixed);
    const delivery = createSeatDeliveryStore(scope, () => {});
    await delivery.write(operation.operationId, digest, 0, { status: 'unknown' });
    input.layout.sections[0].section.name = '後から変更した区画';
    await store.saveLocalDraft(input, 1);
    const staleCalendar = await Promise.allSettled([store.prepareSeatOperation(input, 2, {
      ...operation, operationId: crypto.randomUUID(), expectedVersions: { ...operation.expectedVersions, calendarRevision: 2 },
    })]);
    const database = await openDeviceDatabase();
    const records = await new Promise((resolve, reject) => {
      const transaction = database.transaction('seatOperations', 'readonly');
      const request = transaction.objectStore('seatOperations').getAll();
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(Error('READ_FAILED'));
    });
    database.close();

    return { operationId: operation.operationId, digest, staleCalendar: staleCalendar[0].status, originalName: fixed.draftSnapshot.layout.sections[0].section.name,
      records: records.map((record) => ({ kind: record.recordKind, version: record.schemaVersion, encrypted: record.ciphertext instanceof ArrayBuffer,
        plaintext: Object.hasOwn(record, 'outcome') || Object.hasOwn(record, 'draftSnapshot') })) };
  }, scope);
  await page.reload();
  const restored = await page.evaluate(async ({ scope, saved }) => {
    const { createSeatDeliveryStore } = await import('/src/storage/seat-operation-delivery.ts');
    const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
    const store = createSeatDraftStore(scope, () => {});

    return { fixed: await store.readPendingSeatOperation(saved.operationId), draft: await store.loadLocalDraft(),
      delivery: await createSeatDeliveryStore(scope, () => {}).read(saved.operationId) };
  }, { scope, saved });
  expect(saved.records).toEqual(expect.arrayContaining([
    { kind: 'seat-operation', version: 2, encrypted: true, plaintext: false },
    { kind: 'seat-operation-delivery', version: 1, encrypted: true, plaintext: false },
  ]));
  expect(restored.fixed.draftSnapshot.layout.sections[0].section.name).toBe(saved.originalName);
  expect(saved.staleCalendar).toBe('rejected');
  expect(restored.fixed.expectedVersions.calendarRevision).toBe(1);
  expect(restored.draft.layout.sections[0].section.name).toBe('後から変更した区画');
  expect(restored.delivery).toMatchObject({ inputDigest: saved.digest, localRevision: 1, outcome: { status: 'unknown' } });
});

test('DD91-T38・T41 送信状態の競合・終端上書き・別本人・破損を拒否する', async ({ page }) => {
  await setup(page, scope);
  const result = await page.evaluate(async (scope) => {
    const { createSeatDeliveryStore } = await import('/src/storage/seat-operation-delivery.ts');
    const { openDeviceDatabase } = await import('/src/storage/device-database.ts');
    const store = createSeatDeliveryStore(scope, () => {});
    const id = crypto.randomUUID(), digest = 'a'.repeat(64);
    const writes = await Promise.allSettled([
      store.write(id, digest, 0, { status: 'unknown' }), store.write(id, digest, 0, { status: 'unknown' }),
    ]);
    const confirmed = await store.write(id, digest, 1, { status: 'confirmed', receipt: { operationId: id, inputDigest: digest, kind: 'commit', resultRevision: 2 } });
    const terminal = await Promise.allSettled([store.write(id, digest, 2, { status: 'unknown' })]);
    const other = await Promise.allSettled([createSeatDeliveryStore({ ...scope, humanUid: 'other-human' }, () => {}).read(id)]);
    const revoked = await Promise.allSettled([createSeatDeliveryStore(scope, () => { throw Error('ACCESS_REVOKED'); }).read(id)]);
    const database = await openDeviceDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('seatOperations', 'readwrite');
      const records = transaction.objectStore('seatOperations');
      const request = records.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (cursor.value.recordKind === 'seat-operation-delivery') {
            const record = cursor.value;
            new Uint8Array(record.ciphertext)[0] ^= 1;
            cursor.update(record);
          }
          cursor.continue();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(Error('WRITE_FAILED'));
    });
    database.close();
    const corrupt = await Promise.allSettled([store.read(id)]);

    return { writes: writes.map((result) => result.status).sort(), confirmed, terminal: terminal[0].status,
      other: other[0].status, revoked: revoked[0].status, corrupt: corrupt[0].status };
  }, scope);
  expect(result).toMatchObject({ writes: ['fulfilled', 'rejected'], confirmed: { localRevision: 2, outcome: { status: 'confirmed' } },
    terminal: 'rejected', other: 'rejected', revoked: 'rejected', corrupt: 'rejected' });
});

for (const kind of ['share', 'commit']) {
  test(`DD91-T41 ${kind}の応答喪失後、再起動して照会する。Web Locksで並行送信を防ぐ`, async ({ page }) => {
    await setup(page, scope);
    const saved = await page.evaluate(async ({ scope, kind }) => {
      const { createSeatDeliveryStore } = await import('/src/storage/seat-operation-delivery.ts');
      const { createSeatOperationController, withSeatOperationOwnership, seatOperationDigest } = await import('/src/storage/seat-operation-controller.ts');
      const operation = { ...window.seatOperation, kind };
      await window.seatDraftStore.prepareSeatOperation(window.draftInput, 0, operation);
      let sends = 0, receipt;
      const controller = createSeatOperationController({ scope, operations: window.seatDraftStore,
        delivery: createSeatDeliveryStore(scope, () => {}), withOwnership: withSeatOperationOwnership,
        /** この試験では失効させず、通信中断だけを注入する。 */
        assertAuthorized() {},
        transport: {
          /** 確定前の応答に相当する未検出を返す。 */
          async lookup() { return { status: 'notFound' }; },
          /** この試験では送信前の版照合を通す。 */
          async canSend() { return true; },
          /** サーバー側へ結果が残った直後の応答喪失を再現する。 */
          async send(fixed) {
            sends++;
            receipt = { operationId: fixed.operationId, kind, inputDigest: await seatOperationDigest(fixed), resultRevision: 2 };
            throw Error('RESPONSE_LOST');
          },
          /** 結果が未取得の間は確定版の照合へ進ませない。 */
          async verifyApplied() { throw Error('UNEXPECTED_VERIFICATION'); },
        } });
      const calls = await Promise.allSettled([controller.run(operation.operationId, 'send'), controller.run(operation.operationId, 'send')]);

      return { sends, receipt, failures: calls.map((call) => call.reason?.message) };
    }, { scope, kind });
    expect(saved.sends).toBe(1);
    expect(saved.failures).toEqual(['RESPONSE_LOST', 'SEAT_OPERATION_RESULT_REQUIRED']);
    await page.reload();
    const result = await page.evaluate(async ({ scope, receipt }) => {
      const { createSeatDeliveryStore } = await import('/src/storage/seat-operation-delivery.ts');
      const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
      const { createSeatOperationController, withSeatOperationOwnership } = await import('/src/storage/seat-operation-controller.ts');
      let checked = false;
      const controller = createSeatOperationController({ scope, operations: createSeatDraftStore(scope, () => {}),
        delivery: createSeatDeliveryStore(scope, () => {}), withOwnership: withSeatOperationOwnership,
        /** 再起動後も同じ本人・端末への許可を保つ。 */
        assertAuthorized() {},
        transport: {
          /** 再起動前の要求がサーバーで確定していた結果を返す。 */
          async lookup() { return { status: 'confirmed', receipt }; },
          /** 照会経路から再送前検査を呼ばないことを確認する。 */
          async canSend() { throw Error('UNEXPECTED_RETRY'); },
          /** 照会だけで送信を始めないことを確認する。 */
          async send() { throw Error('UNEXPECTED_SEND'); },
          /** 結果に対応する版を取得したことを記録する。 */
          async verifyApplied() { checked = true; },
        } });

      return { result: await controller.run(receipt.operationId, 'check'), checked };
    }, { scope, receipt: saved.receipt });
    expect(result).toEqual({ checked: true, result: { status: 'confirmed', receipt: saved.receipt } });
  });
}

test('DD91-T38 送信直前の状態保存で容量不足になったら、固定入力を保全して通信しない', async ({ page }) => {
  await setup(page, scope);
  const result = await page.evaluate(async (scope) => {
    const { createSeatDeliveryStore } = await import('/src/storage/seat-operation-delivery.ts');
    const { createSeatOperationController, withSeatOperationOwnership } = await import('/src/storage/seat-operation-controller.ts');
    const store = window.seatDraftStore, id = window.seatOperation.operationId;
    await store.prepareSeatOperation(window.draftInput, 0, window.seatOperation);
    let sent = false;
    const delivery = createSeatDeliveryStore(scope, () => {});
    const controller = createSeatOperationController({ scope, operations: store, delivery, withOwnership: withSeatOperationOwnership,
      /** 容量不足だけを注入し、認可は維持する。 */
      assertAuthorized() {},
      transport: {
        /** サーバーにはまだ確定結果がない。 */
        async lookup() { return { status: 'notFound' }; },
        /** 版が一致していても、保存失敗なら送信を止める。 */
        async canSend() { return true; },
        /** 誤って送信が始まった場合に記録する。 */
        async send() { sent = true; },
        /** 保存前に失敗するため、この試験で確定版は不要。 */
        async verifyApplied() {},
      } });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'seatOperations') throw new DOMException('fictional quota failure', 'QuotaExceededError');

      return put.apply(this, args);
    };
    let rejected = false;
    try { await controller.run(id, 'send'); } catch { rejected = true; }
    finally { IDBObjectStore.prototype.put = put; }

    return { sent, rejected, state: await delivery.read(id), fixed: Boolean(await store.readPendingSeatOperation(id)) };
  }, scope);
  expect(result).toEqual({ sent: false, rejected: true, state: null, fixed: true });
});

for (const mode of ['legacy', 'corrupt-snapshot']) {
  test(`DD91-T41 固定操作の${mode}は原本を保持し、現在の下書きから送信案を補わない`, async ({ page }) => {
    await setup(page, scope);
    const result = await page.evaluate(async ({ scope, mode }) => {
      const { openDeviceDatabase } = await import('/src/storage/device-database.ts');
      const { encryptRecord, decryptRecord } = await import('/src/storage/device-vault.ts');
      const { createSeatDeliveryStore } = await import('/src/storage/seat-operation-delivery.ts');
      const { createSeatOperationController, withSeatOperationOwnership } = await import('/src/storage/seat-operation-controller.ts');
      const store = window.seatDraftStore, id = window.seatOperation.operationId;
      await store.prepareSeatOperation(window.draftInput, 0, window.seatOperation);
      const database = await openDeviceDatabase();
      const entry = await new Promise((resolve) => {
        const transaction = database.transaction('seatOperations', 'readonly');
        const request = transaction.objectStore('seatOperations').openCursor();
        request.onsuccess = () => resolve({ key: request.result.key, encrypted: request.result.value });
      });
      const plaintext = await decryptRecord(entry.encrypted, entry.encrypted, () => {});
      const value = JSON.parse(new TextDecoder().decode(plaintext));
      plaintext.fill(0);
      if (mode === 'legacy') delete value.draftSnapshot;
      else value.draftSnapshot.layout.sections.push({});
      const serialized = new TextEncoder().encode(JSON.stringify(value));
      const encrypted = await encryptRecord({ ...entry.encrypted, schemaVersion: mode === 'legacy' ? 1 : 2 }, serialized, () => {});
      serialized.fill(0);
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('seatOperations', 'readwrite');
        transaction.objectStore('seatOperations').put(encrypted, entry.key);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(Error('WRITE_FAILED'));
      });
      let contacted = false;
      const controller = createSeatOperationController({ scope, operations: store, delivery: createSeatDeliveryStore(scope, () => {}),
        withOwnership: withSeatOperationOwnership,
        /** 形式の拒否だけを確認するため、認可は維持する。 */
        assertAuthorized() {},
        transport: {
          /** 読めない入力で結果照会を始めた場合も記録する。 */
          async lookup() { contacted = true; return { status: 'notFound' }; },
          /** 誤って送信検査へ到達しても、版の拒否で問題を隠さない。 */
          async canSend() { return true; },
          /** 固定本文の不足・破損で送信していないことを観測する。 */
          async send() { contacted = true; },
          /** 入力の復元時点で拒否するため、確定版は不要。 */
          async verifyApplied() {},
        } });
      const calls = await Promise.allSettled([controller.run(id, 'send')]);
      const saved = await new Promise((resolve) => {
        const transaction = database.transaction('seatOperations', 'readonly');
        const request = transaction.objectStore('seatOperations').get(entry.key);
        transaction.oncomplete = () => resolve(request.result);
      });
      database.close();
      const draft = await store.loadLocalDraft();

      return { rejected: calls[0].status, contacted, savedVersion: saved.schemaVersion, draftRevision: draft.localRevision,
        preserved: Array.from(new Uint8Array(saved.ciphertext)).join() === Array.from(new Uint8Array(encrypted.ciphertext)).join() };
    }, { scope, mode });
    expect(result).toEqual({ rejected: 'rejected', contacted: false, savedVersion: mode === 'legacy' ? 1 : 2, draftRevision: 1, preserved: true });
  });
}

test('DD91-T30・T37 旧版の理由付き下書きを復元し、不正な理由や旧版で上書きしない', async ({ page }) => {
  await setup(page, scope, true);
  const result = await page.evaluate(async () => {
    const { draftInput: input, seatDraftStore: store } = window;
    const seatId = input.layout.sections[0].seats[0].seatId;
    const reason = '架空の席位置調整';
    await store.saveLocalDraft(input, 0);
    await store.saveLocalDraft({ ...input, editReasons: { [seatId]: reason } }, 1);
    const failures = [];
    for (const editReasons of [[], { [seatId]: '' }, { [seatId]: '   ' }, { [seatId]: 'x'.repeat(201) },
      { '00000000-0000-4000-8000-000000000099': reason }]) {
      try { await store.saveLocalDraft({ ...input, editReasons }, 2); }
      catch (error) { failures.push(error.code); }
    }
    try { await store.saveLocalDraft(input, 2); }
    catch (error) { failures.push(error.code); }
    try { await store.saveLocalDraft({ ...input, editReasons: { [seatId]: '架空の別理由' } }, 1); }
    catch (error) { failures.push(error.code); }
    const restored = await store.loadLocalDraft();
    const { openDeviceDatabase } = await import('/src/storage/device-database.ts');
    const { decryptRecord } = await import('/src/storage/device-vault.ts');
    const database = await openDeviceDatabase();
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction('seatDrafts').objectStore('seatDrafts').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const record = records[0];
    const legacy = await Promise.allSettled([decryptRecord({ ...record, schemaVersion: 1 }, record, () => {})]);
    return { count: failures.length, failures, reason: restored.editReasons[seatId], revision: restored.localRevision,
      schemaVersion: record.schemaVersion, plaintextReason: Object.hasOwn(record, 'editReasons'), legacy: legacy[0].status };
  });
  expect(result).toEqual({ count: 7, failures: [
    'INVALID_EDIT_REASONS', 'INVALID_EDIT_REASON', 'INVALID_EDIT_REASON', 'INVALID_EDIT_REASON',
    'INVALID_EDIT_REASONS', 'SEAT_DRAFT_FORMAT_DOWNGRADE', 'STALE_SEAT_DRAFT',
  ], reason: '架空の席位置調整', revision: 2, schemaVersion: 2, plaintextReason: false, legacy: 'rejected' });
});

test('DD91-T38 永続化拒否と保存成功を区別し、操作保存の失敗で下書きも巻き戻す', async ({ page }) => {
  await setup(page, scope);
  const result = await page.evaluate(async () => {
    const { draftInput: input, seatOperation: operation, seatDraftStore: store } = window;
    const originalPersist = StorageManager.prototype.persist;
    StorageManager.prototype.persist = async () => false;
    let initial;
    try {
      initial = await store.saveLocalDraft(input, 0);
    } finally {
      StorageManager.prototype.persist = originalPersist;
    }

    const originalAdd = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'seatOperations') throw new DOMException('fictional quota failure', 'QuotaExceededError');
      return originalAdd.apply(this, args);
    };
    let failure;
    try {
      await store.prepareSeatOperation(input, 1, operation);
    } catch (error) {
      failure = error.name;
    } finally {
      IDBObjectStore.prototype.add = originalAdd;
    }

    const draft = await store.loadLocalDraft();
    const pending = await store.readPendingSeatOperation(operation.operationId);
    return { initial, failure, draftRevision: draft.localRevision, pending };
  });
  expect(result).toEqual({
    initial: { localRevision: 1, savedAt: expect.any(Number), persistence: 'unavailable' },
    failure: 'QuotaExceededError',
    draftRevision: 1,
    pending: null,
  });
});

test('DD91-T38・41 同じ下書き版の競合と異内容の操作ID再利用を拒否する', async ({ page }) => {
  await setup(page, scope);
  const result = await page.evaluate(async () => {
    const { draftInput: input, seatOperation: operation, seatDraftStore: store } = window;
    await store.saveLocalDraft(input, 0);
    const writes = await Promise.allSettled([
      store.saveLocalDraft(input, 1),
      store.saveLocalDraft(input, 1),
    ]);
    const prepared = await store.prepareSeatOperation(input, 2, operation);
    const replay = await store.prepareSeatOperation(input, 2, operation);
    let reuse;
    try {
      await store.prepareSeatOperation(input, 2, {
        ...operation, command: { ...operation.command, action: 'changed' },
      });
    } catch (error) {
      reuse = error.code;
    }
    return { writes: writes.map(({ status }) => status).sort(), prepared, replay, reuse };
  });
  expect(result.writes).toEqual(['fulfilled', 'rejected']);
  expect(result.prepared.localRevision).toBe(3);
  expect(result.replay).toEqual(result.prepared);
  expect(result.reuse).toBe('OPERATION_ID_REUSED');
});

test('DD91-T41 別公演・別端末・別本人と、失効したセッションで下書きを復号しない', async ({ page }) => {
  await setup(page, scope);
  const result = await page.evaluate(async (scope) => {
    const { createSeatDraftStore } = await import('/src/storage/seat-drafts.ts');
    const store = window.seatDraftStore;
    await store.saveLocalDraft(window.draftInput, 0);
    const otherPerformance = createSeatDraftStore({ ...scope, performanceId: crypto.randomUUID() }, () => {});
    const otherDevice = createSeatDraftStore({ ...scope, deviceUid: 'fictional-device-2' }, () => {});
    const otherHuman = createSeatDraftStore({ ...scope, humanUid: 'fictional-human-2' }, () => {});
    const otherEpoch = createSeatDraftStore({ ...scope, storageEpoch: crypto.randomUUID() }, () => {});
    const missing = await Promise.all([otherPerformance.loadLocalDraft(), otherDevice.loadLocalDraft()]);
    const mismatched = await Promise.allSettled([otherHuman.loadLocalDraft(), otherEpoch.loadLocalDraft()]);
    window.seatAccessRevoked = true;
    const revoked = await Promise.allSettled([store.loadLocalDraft(), store.saveLocalDraft(window.draftInput, 1)]);

    return { missing, mismatched: mismatched.map(({ status }) => status), revoked: revoked.map(({ status }) => status) };
  }, scope);
  expect(result).toEqual({ missing: [null, null], mismatched: ['rejected', 'rejected'], revoked: ['rejected', 'rejected'] });
});

test('DD91-T38 破損と未知の形式で復元を止め、保存済みの原本を保持する', async ({ page }) => {
  await setup(page, scope);
  const result = await page.evaluate(async () => {
    const { openDeviceDatabase } = await import('/src/storage/device-database.ts');
    const store = window.seatDraftStore;
    await store.saveLocalDraft(window.draftInput, 0);
    const database = await openDeviceDatabase();

    /** 下書き1件を変換して、実際のDBへ異常を注入する。 */
    function editStored(transform) {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('seatDrafts', 'readwrite');
        const request = transaction.objectStore('seatDrafts').openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) cursor.update(transform(cursor.value));
        };
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
      });
    }

    try {
      await editStored((record) => ({ ...record, schemaVersion: 999 }));
      const unknown = await Promise.allSettled([store.loadLocalDraft()]);
      await editStored((record) => {
        const ciphertext = new Uint8Array(record.ciphertext);
        ciphertext[0] ^= 1;
        return { ...record, schemaVersion: 1, ciphertext: ciphertext.buffer };
      });
      const corrupt = await Promise.allSettled([store.loadLocalDraft()]);
      let remaining = 0;
      await editStored((record) => {
        remaining += 1;
        return record;
      });
      return { unknown: unknown[0].status, corrupt: corrupt[0].status, remaining };
    } finally {
      database.close();
    }
  });
  expect(result).toEqual({ unknown: 'rejected', corrupt: 'rejected', remaining: 1 });
});

test('端末DBの版更新で既存の鍵・認可操作を保持する', async ({ page }) => {
  await page.goto('http://127.0.0.1:4181/');
  const result = await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('concert-reception-device', 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('deviceKeys').put('key-fixture', 'legacy');
        database.createObjectStore('authorizationOperations').put('operation-fixture', 'legacy');
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const { openDeviceDatabase } = await import('/src/storage/device-database.ts');
    const database = await openDeviceDatabase();

    /** 版更新後の既存ストアから試験データを読む。 */
    async function stored(name) {
      return new Promise((resolve, reject) => {
        const request = database.transaction(name).objectStore(name).get('legacy');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    try {
      return {
        version: database.version,
        key: await stored('deviceKeys'),
        operation: await stored('authorizationOperations'),
        stores: Array.from(database.objectStoreNames),
      };
    } finally {
      database.close();
    }
  });
  expect(result).toEqual({
    version: 3, key: 'key-fixture', operation: 'operation-fixture',
    stores: ['authorizationOperations', 'deviceKeys', 'seatDrafts', 'seatOperations'],
  });
});
