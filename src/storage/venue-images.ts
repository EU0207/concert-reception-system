// 検証済み会場画像と各枠の未解決送信を暗号化保存し、途中画像を表示用へ切り替えない。

import type { DeviceKeyScope, EncryptedRecord, RecordIdentity } from './device-vault.ts';
import { encryptRecord, decryptRecord } from './device-vault.ts';
import { openDeviceDatabase } from './device-database.ts';
import { checkScope, isId, positive, requireValue } from '../domain/seats/validation.ts';
import type { VenueImageHead, VenueImagePayload, VenueImageOperation, ImageSlot, ImageBank } from '../domain/seats/venue-image.ts';
import { validateImageSlot, validateImageHead, verifyVenueImage, verifyImageOperation } from '../domain/seats/venue-image.ts';

type PendingImage =
  | { status: 'prepared'; operationId: string; bank: ImageBank; payload: VenueImagePayload }
  | { status: 'confirmed'; operationId: string; result: VenueImageOperation };

interface CachedImage {
  head: VenueImageHead;
  payload: VenueImagePayload | null;
}

/** 公演・端末に結び付け、検証済み画像と固定した未解決送信を保存する窓口を作る。 */
export function createVenueImageStore(scope: DeviceKeyScope, assertAuthorized: () => void) {
  const binding = structuredClone(scope);

  /** キャッシュと未解決送信を別の暗号文として識別する。 */
  function identity(kind: 'current' | 'pending', slot: ImageSlot, revision: number): RecordIdentity {
    validateImageSlot(slot);

    return { ...binding, schemaVersion: 1, recordKind: `venue-image-${kind}`, recordId: slot, dataRevision: revision };
  }

  /** 同じ公演・端末の5枠を固定キーで上書きし、編集回数分の画像を蓄積しない。 */
  function key(kind: string, slot: ImageSlot): string {
    validateImageSlot(slot);

    return JSON.stringify([binding.environmentId, binding.performanceId, binding.deviceUid, kind, slot]);
  }

  /** 現在認可を再確認し、暗号化レコードを読む。 */
  async function readRecord(kind: 'current' | 'pending', slot: ImageSlot): Promise<EncryptedRecord | null> {
    assertAuthorized();
    const database = await openDeviceDatabase();
    try {
      const record = await new Promise<EncryptedRecord | null>((resolve, reject) => {
        const transaction = database.transaction('venueImages', 'readonly');
        const request = transaction.objectStore('venueImages').get(key(kind, slot));
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onabort = () => reject(Error('VENUE_IMAGE_READ_FAILED'));
      });
      assertAuthorized();

      return record;
    } finally {
      database.close();
    }
  }

  /** 暗号文を目的・枠と版へ結び付けて復号する。 */
  async function decode<T>(kind: 'current' | 'pending', slot: ImageSlot, record: EncryptedRecord): Promise<T> {
    requireValue(positive(record.dataRevision), 'INVALID_VENUE_IMAGE_RECORD');
    const bytes = await decryptRecord(identity(kind, slot, record.dataRevision), record, assertAuthorized);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } finally {
      bytes.fill(0);
    }
  }

  /** 未解決本文と最小受領記録の形式・所属を確認し、未知の状態を上書きしない。 */
  async function validatePending(slot: ImageSlot, pending: PendingImage): Promise<void> {
    requireValue(pending && isId(pending.operationId) && ['prepared', 'confirmed'].includes(pending.status), 'INVALID_IMAGE_OPERATION');
    if (pending.status === 'prepared') {
      requireValue(pending.bank === 'a' || pending.bank === 'b', 'INVALID_IMAGE_BANK');
      await verifyVenueImage(pending.payload, { environmentId: binding.environmentId, performanceId: binding.performanceId,
        schemaVersion: 1, active: true, bank: pending.bank, revision: pending.payload.revision,
        operationId: pending.operationId, sha256: pending.payload.sha256 }, binding);
      assertAuthorized();
    } else {
      const result = pending.result;
      requireValue(result?.schemaVersion === 1 && result.kind === 'publish' && result.slot === slot &&
        positive(result.revision) && positive(result.controlRevision) && positive(result.committedAt) &&
        (result.bank === 'a' || result.bank === 'b') && /^[a-f0-9]{64}$/.test(result.sha256) &&
        result.humanUid === binding.humanUid && result.deviceUid === binding.deviceUid, 'INVALID_IMAGE_RESULT');
      checkScope(result, binding);
    }
  }

  /** 暗号化後、期待ローカル版と所属が変わっていない場合だけ一括で置き換える。 */
  async function replace(kind: 'current' | 'pending', slot: ImageSlot, expectedRevision: number, body: unknown): Promise<number> {
    const revision = expectedRevision + 1;
    requireValue(positive(revision), 'INVALID_LOCAL_REVISION');
    const plaintext = new TextEncoder().encode(JSON.stringify(body));
    let encrypted: EncryptedRecord;
    try {
      encrypted = await encryptRecord(identity(kind, slot, revision), plaintext, assertAuthorized);
    } finally {
      plaintext.fill(0);
    }
    const database = await openDeviceDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('venueImages', 'readwrite', { durability: 'strict' });
        const store = transaction.objectStore('venueImages');
        const request = store.get(key(kind, slot));
        let failure: unknown;
        request.onsuccess = () => {
          try {
            assertAuthorized();
            const current = request.result as EncryptedRecord | undefined;
            requireValue(current ? current.dataRevision === expectedRevision && current.humanUid === binding.humanUid &&
              current.storageEpoch === binding.storageEpoch && current.recordKind === encrypted.recordKind
              : expectedRevision === 0, 'STALE_VENUE_IMAGE');
            store.put(encrypted, key(kind, slot));
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(failure ?? Error('VENUE_IMAGE_SAVE_FAILED'));
      });
      assertAuthorized();

      return revision;
    } finally {
      database.close();
    }
  }

  /** 保存済みの同じ公開版を再検証し、完全オフラインでも表示できるBlobを返す。 */
  async function readImage(slot: ImageSlot) {
    const record = await readRecord('current', slot);
    if (!record) return null;
    const image = await decode<CachedImage>('current', slot, record);
    validateImageHead(image.head, binding);
    requireValue(image.head.active || image.payload === null, 'INVALID_IMAGE_PAYLOAD');
    const blob = image.head.active && image.payload ? await verifyVenueImage(image.payload, image.head, binding) : null;
    requireValue(!image.head.active || blob, 'INVALID_IMAGE_PAYLOAD');
    assertAuthorized();

    return { ...image, blob, localRevision: record.dataRevision };
  }

  /** 検証・暗号化保存の完了後だけ、新しい画像へ切り替えられる版を返す。 */
  async function saveImage(slot: ImageSlot, head: VenueImageHead, payload: VenueImagePayload | null, expectedRevision: number) {
    const fixed = structuredClone({ head, payload });
    validateImageHead(fixed.head, binding);
    requireValue(fixed.head.active || fixed.payload === null, 'INVALID_IMAGE_PAYLOAD');
    const blob = fixed.head.active && fixed.payload ? await verifyVenueImage(fixed.payload, fixed.head, binding) : null;
    requireValue(!fixed.head.active || blob, 'INVALID_IMAGE_PAYLOAD');
    const prior = await readRecord('current', slot);
    requireValue((prior?.dataRevision ?? 0) === expectedRevision, 'STALE_VENUE_IMAGE');
    if (prior) {
      const previous = await decode<CachedImage>('current', slot, prior);
      const same = fixed.head.revision === previous.head.revision && fixed.head.operationId === previous.head.operationId &&
        fixed.head.bank === previous.head.bank && fixed.head.sha256 === previous.head.sha256 && fixed.payload?.base64 === previous.payload?.base64;
      requireValue(fixed.head.revision > previous.head.revision || same, 'STALE_IMAGE_REVISION');
      if (same) return { ...fixed, blob, localRevision: prior.dataRevision };
    }
    const localRevision = await replace('current', slot, expectedRevision, fixed);

    return { ...fixed, blob, localRevision };
  }

  /** 未解決の固定送信を復元する。別の画像で上書きせず、同じIDの照会へ渡す。 */
  async function readUpload(slot: ImageSlot): Promise<PendingImage | null> {
    const record = await readRecord('pending', slot);
    if (!record) return null;
    const pending = await decode<PendingImage>('pending', slot, record);
    await validatePending(slot, pending);

    return pending;
  }

  /** 画像本文を送信前に固定し、同じIDの異内容と未解決の別操作を拒否する。 */
  async function prepare(slot: ImageSlot, bank: ImageBank, payload: VenueImagePayload): Promise<void> {
    payload = structuredClone(payload);
    requireValue(bank === 'a' || bank === 'b', 'INVALID_IMAGE_BANK');
    await verifyVenueImage(payload, { environmentId: binding.environmentId, performanceId: binding.performanceId,
      schemaVersion: 1, active: true, bank, revision: payload.revision, operationId: payload.operationId, sha256: payload.sha256 }, binding);
    const body: PendingImage = { status: 'prepared', operationId: payload.operationId, bank, payload: structuredClone(payload) };
    const prior = await readRecord('pending', slot);
    if (prior) {
      const old = await decode<PendingImage>('pending', slot, prior);
      await validatePending(slot, old);
      if (old.status === 'prepared') {
        requireValue(JSON.stringify(old) === JSON.stringify(body), 'PENDING_IMAGE_OPERATION');

        return;
      }
      if (old.operationId === payload.operationId) {
        verifyImageOperation(old.result, slot, payload, bank);

        return;
      }
    }
    await replace('pending', slot, prior?.dataRevision ?? 0, body);
  }

  /** 一致する不変結果の受領後、固定本文を最新1件の受領記録へ置き換える。 */
  async function confirm(slot: ImageSlot, operationId: string, result: VenueImageOperation): Promise<void> {
    result = structuredClone(result);
    requireValue(result.humanUid === binding.humanUid && result.deviceUid === binding.deviceUid, 'IMAGE_OPERATION_MISMATCH');
    const record = await readRecord('pending', slot);
    requireValue(record, 'IMAGE_OPERATION_NOT_PREPARED');
    const old = await decode<PendingImage>('pending', slot, record);
    await validatePending(slot, old);
    requireValue(old.operationId === operationId, 'IMAGE_OPERATION_MISMATCH');
    if (old.status === 'confirmed') {
      requireValue(JSON.stringify(old.result) === JSON.stringify(result), 'IMAGE_OPERATION_MISMATCH');

      return;
    }
    verifyImageOperation(result, slot, old.payload, old.bank);
    await replace('pending', slot, record.dataRevision, { status: 'confirmed', operationId, result });
  }

  return { readImage, saveImage, readUpload, prepare, confirm };
}
