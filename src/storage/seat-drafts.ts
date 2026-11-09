// 席の下書きと固定した操作案を、認可済み端末のIndexedDBへ暗号化保存する。

import type { Scope, SeatLayout, SeatVersions } from '../domain/seats/types.ts';
import { checkScope, isId, nonnegative, positive, requireValue } from '../domain/seats/validation.ts';
import { openDeviceDatabase } from './device-database.ts';
import { decryptRecord, encryptRecord } from './device-vault.ts';
import type { DeviceKeyScope, EncryptedRecord, RecordIdentity } from './device-vault.ts';

interface DraftInput {
  draftId: string;
  baseVersions: SeatVersions & { attendeeRevision: number };
  layout: SeatLayout;
}

interface LocalDraft extends DraftInput {
  localRevision: number;
  savedAt: number;
}

interface SeatOperationInput {
  operationId: string;
  kind: 'share' | 'commit';
  expectedVersions: DraftInput['baseVersions'] & { roleRevision: number; deviceRevision: number };
  command: Scope & Record<string, unknown>;
}

type PendingSeatOperation = SeatOperationInput & {
  draftId: string;
  draftRevision: number;
  draftDigest: string;
  status: 'prepared';
};

const draftVersionKeys = [
  'layoutRevision', 'assignmentRevision', 'ticketRevision', 'controlRevision', 'attendeeRevision',
] as const;

/** 所属と版を検査する。保存したい編集案には業務確定前の入力も含まれる。 */
function validateDraft(scope: DeviceKeyScope, input: DraftInput): void {
  requireValue(isId(input.draftId) && input.baseVersions && input.layout, 'INVALID_SEAT_DRAFT');
  requireValue(draftVersionKeys.every((key) => nonnegative(input.baseVersions[key])), 'INVALID_SEAT_VERSIONS');
  checkScope(input.layout, scope);
  requireValue(
    Array.isArray(input.layout.sections) && Array.isArray(input.layout.assignments) &&
      Array.isArray(input.layout.ticketProtections),
    'INVALID_SEAT_DRAFT',
  );
  for (const model of input.layout.sections) {
    checkScope(model.section, scope);
    for (const seat of model.seats) checkScope(seat, scope);
  }
  for (const assignment of input.layout.assignments) checkScope(assignment, scope);
  for (const ticket of input.layout.ticketProtections) checkScope(ticket, scope);
}

/** 暗号化前の一時バッファを保存用の暗号文に変換し、処理後に消去する。 */
async function seal(identity: RecordIdentity, serialized: string, assertAuthorized: () => void) {
  const plaintext = new TextEncoder().encode(serialized);

  try {
    return await encryptRecord(identity, plaintext, assertAuthorized);
  } finally {
    plaintext.fill(0);
  }
}

/** 暗号文を検証して読み出し、一時バッファを消去する。 */
async function unseal(identity: RecordIdentity, record: EncryptedRecord, assertAuthorized: () => void) {
  const plaintext = await decryptRecord(identity, record, assertAuthorized);

  try {
    return new TextDecoder().decode(plaintext);
  } finally {
    plaintext.fill(0);
  }
}

/** 新規端末下書きの保存後に、ブラウザーへ永続化を要求する。 */
async function requestPersistence(): Promise<'granted' | 'unavailable'> {
  try {
    return await navigator.storage?.persist?.() ? 'granted' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/** 同じ環境・公演・端末と現在の本人に結び付いた保存窓口を作る。 */
export function createSeatDraftStore(scope: DeviceKeyScope, assertAuthorized: () => void) {
  const binding = {
    environmentId: scope.environmentId,
    performanceId: scope.performanceId,
    humanUid: scope.humanUid,
    deviceUid: scope.deviceUid,
    storageEpoch: scope.storageEpoch,
  };
  const draftKey = JSON.stringify([binding.environmentId, binding.performanceId, binding.deviceUid]);

  /** 下書きIDまたは操作IDと保存版を、暗号文の追加認証情報へ含める。 */
  function identity(recordKind: 'seat-draft' | 'seat-operation', recordId: string, dataRevision: number): RecordIdentity {
    return { ...binding, schemaVersion: 1, recordKind, recordId, dataRevision };
  }

  /** 操作IDを、この端末の下書きと同じ所属に結び付ける。 */
  function operationKey(operationId: string): string {
    requireValue(isId(operationId), 'INVALID_OPERATION_ID');

    return JSON.stringify([draftKey, operationId]);
  }

  /** 端末ストアから、認可を再確認して暗号化レコードを取得する。 */
  async function readRecord(store: 'seatDrafts' | 'seatOperations', key: string): Promise<EncryptedRecord | null> {
    assertAuthorized();
    const database = await openDeviceDatabase();

    try {
      const record = await new Promise<EncryptedRecord | null>((resolve, reject) => {
        const transaction = database.transaction(store, 'readonly');
        const request = transaction.objectStore(store).get(key);
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onabort = () => reject(new Error('SEAT_STORAGE_READ_FAILED'));
      });
      assertAuthorized();

      return record;
    } finally {
      database.close();
    }
  }

  /** 最後に完了した下書きを、版と所属の整合性を確認して復元する。 */
  async function loadLocalDraft(): Promise<LocalDraft | null> {
    const record = await readRecord('seatDrafts', draftKey);
    if (!record) return null;

    requireValue(isId(record.recordId) && positive(record.dataRevision), 'INVALID_SEAT_DRAFT');
    const expected = identity('seat-draft', record.recordId, record.dataRevision);
    const draft = JSON.parse(await unseal(expected, record, assertAuthorized)) as LocalDraft;
    requireValue(
      draft?.draftId === expected.recordId && draft.localRevision === expected.dataRevision &&
        positive(draft.savedAt),
      'INVALID_SEAT_DRAFT',
    );
    validateDraft(binding, draft);

    return draft;
  }

  /** 操作IDに固定された未送信の内容を復元する。送信は呼出元の明示操作で扱う。 */
  async function readPendingSeatOperation(operationId: string): Promise<PendingSeatOperation | null> {
    const record = await readRecord('seatOperations', operationKey(operationId));
    if (!record) return null;

    const operation = JSON.parse(await unseal(identity('seat-operation', operationId, 1), record, assertAuthorized));
    requireValue(operation?.operationId === operationId && operation.status === 'prepared', 'INVALID_SEAT_OPERATION');

    return operation;
  }

  /** 保存対象の版を検証し、書き込みトランザクションの前に暗号化する。 */
  async function makeDraft(input: DraftInput, expectedRevision: number) {
    assertAuthorized();
    requireValue(nonnegative(expectedRevision) && positive(expectedRevision + 1), 'INVALID_LOCAL_REVISION');
    validateDraft(binding, input);

    const localRevision = expectedRevision + 1;
    const savedAt = Date.now();
    const draft = await seal(
      identity('seat-draft', input.draftId, localRevision),
      JSON.stringify({ ...input, localRevision, savedAt }),
      assertAuthorized,
    );

    return { draft, localRevision, savedAt };
  }

  /** 下書きの期待版を直列化して照合し、固定操作があれば同時に保存する。 */
  async function writeDraft(
    draft: EncryptedRecord,
    expectedRevision: number,
    operation?: { key: string; record: EncryptedRecord },
  ): Promise<EncryptedRecord | undefined> {
    const database = await openDeviceDatabase();

    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(
          operation ? ['seatDrafts', 'seatOperations'] : ['seatDrafts'], 'readwrite', { durability: 'strict' },
        );
        const drafts = transaction.objectStore('seatDrafts');
        let failure: unknown;
        let previousOperation: EncryptedRecord | undefined;

        /** 認可や競合により失敗した場合は、両ストアの書き込みを取り消す。 */
        function abort(error: unknown) {
          failure = error;
          transaction.abort();
        }

        /** 現在の下書き版と保存領域が一致する場合だけ書き込む。 */
        function writeNewDraft() {
          const request = drafts.get(draftKey);
          request.onsuccess = () => {
            try {
              assertAuthorized();
              const prior = request.result as EncryptedRecord | undefined;
              requireValue(
                prior
                  ? prior.dataRevision === expectedRevision && prior.recordId === draft.recordId &&
                    prior.humanUid === binding.humanUid && prior.storageEpoch === binding.storageEpoch &&
                    prior.schemaVersion === 1 && prior.recordKind === 'seat-draft'
                  : expectedRevision === 0,
                'STALE_SEAT_DRAFT',
              );
              drafts.put(draft, draftKey);
              if (operation) transaction.objectStore('seatOperations').add(operation.record, operation.key);
            } catch (error) {
              abort(error);
            }
          };
        }

        if (operation) {
          const request = transaction.objectStore('seatOperations').get(operation.key);
          request.onsuccess = () => {
            previousOperation = request.result;
            if (!previousOperation) writeNewDraft();
          };
        } else {
          writeNewDraft();
        }
        transaction.oncomplete = () => resolve(previousOperation);
        transaction.onabort = () => reject(failure ?? new Error('SEAT_STORAGE_SAVE_FAILED'));
      });
    } finally {
      database.close();
    }
  }

  /** 下書きだけを明示保存し、完了した端末内の版を返す。 */
  async function saveLocalDraft(input: DraftInput, expectedRevision: number) {
    const { draft, localRevision, savedAt } = await makeDraft(input, expectedRevision);
    await writeDraft(draft, expectedRevision);
    assertAuthorized();
    const persistence = expectedRevision === 0 ? await requestPersistence() : undefined;
    assertAuthorized();

    return { localRevision, savedAt, persistence };
  }

  /** 送信案と下書きを一体で保存し、同一IDの再試行では二重作成を防ぐ。 */
  async function prepareSeatOperation(input: DraftInput, expectedRevision: number, operation: SeatOperationInput) {
    const fixedInput = structuredClone(input);
    const fixedOperation = structuredClone(operation);
    const key = operationKey(fixedOperation.operationId);
    requireValue(
      (fixedOperation.kind === 'share' || fixedOperation.kind === 'commit') &&
        fixedOperation.expectedVersions && fixedOperation.command &&
        typeof fixedOperation.command === 'object' && !Array.isArray(fixedOperation.command) &&
        positive(fixedOperation.expectedVersions.roleRevision) &&
        nonnegative(fixedOperation.expectedVersions.deviceRevision),
      'INVALID_SEAT_OPERATION',
    );
    checkScope(fixedOperation.command, binding);
    requireValue(
      fixedInput.baseVersions &&
        draftVersionKeys.every((version) => fixedOperation.expectedVersions[version] === fixedInput.baseVersions[version]),
      'SEAT_OPERATION_VERSION_MISMATCH',
    );
    const { draft, localRevision } = await makeDraft(fixedInput, expectedRevision);
    const bytes = new TextEncoder().encode(JSON.stringify(fixedInput));
    let digest: ArrayBuffer;
    try {
      digest = await crypto.subtle.digest('SHA-256', bytes);
    } finally {
      bytes.fill(0);
    }
    const draftDigest = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const pending: PendingSeatOperation = {
      ...fixedOperation, draftId: fixedInput.draftId, draftRevision: localRevision, draftDigest, status: 'prepared',
    };
    const serialized = JSON.stringify(pending);
    const expected = identity('seat-operation', fixedOperation.operationId, 1);
    const record = await seal(expected, serialized, assertAuthorized);
    const prior = await writeDraft(draft, expectedRevision, { key, record });

    if (prior) {
      requireValue(await unseal(expected, prior, assertAuthorized) === serialized, 'OPERATION_ID_REUSED');
    }
    assertAuthorized();
    const persistence = !prior && expectedRevision === 0 ? await requestPersistence() : undefined;
    assertAuthorized();

    return { localRevision, operationId: fixedOperation.operationId, persistence };
  }

  return { loadLocalDraft, saveLocalDraft, prepareSeatOperation, readPendingSeatOperation };
}
