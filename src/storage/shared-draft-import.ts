// 共有構成と全5画像を検証・暗号化し、確認済みの置換だけを端末へ一体保存する。

import type { DeviceKeyScope, EncryptedRecord } from './device-vault.ts';
import { encryptRecord } from './device-vault.ts';
import { openDeviceDatabase } from './device-database.ts';
import { createSeatDraftStore } from './seat-drafts.ts';
import { createVenueImageStore } from './venue-images.ts';
import { IMAGE_SLOTS, validateImageSlot, verifyVenueImage } from '../domain/seats/venue-image.ts';
import type { VenueImageHead, VenueImagePayload } from '../domain/seats/venue-image.ts';
import type { SharedEditorInput } from '../domain/seats/shared-draft.ts';
import type { SeatVersions } from '../domain/seats/types.ts';
import { checkScope, isId, requireValue, validateLayout } from '../domain/seats/validation.ts';

interface ImportInput {
  head: { operationId: string };
  source: SharedEditorInput;
  baseVersions: SeatVersions & { attendeeRevision: number };
  images: { slot: string; head: VenueImageHead; payload: VenueImagePayload }[];
}

/** 版だけでなく暗号文の差し替えも検知し、事前検査後の変更を取り込まない。 */
function sameRecord(a: EncryptedRecord | undefined, b: EncryptedRecord | undefined): boolean {
  if (!a || !b) return a === b;
  const keys = ['schemaVersion', 'recordKind', 'recordId', 'dataRevision', 'environmentId', 'performanceId',
    'humanUid', 'deviceUid', 'storageEpoch', 'algorithm', 'keyVersion'] as const;
  const first = new Uint8Array(a.ciphertext), second = new Uint8Array(b.ciphertext);

  return keys.every((key) => a[key] === b[key]) && a.iv.length === b.iv.length && a.iv.every((byte, index) => byte === b.iv[index]) &&
    first.length === second.length && first.every((byte, index) => byte === second[index]);
}

/** 現在本人の領域だけを対象に、既存案と画像をまとめて置き換える窓口を作る。 */
export function createSharedDraftImporter(scope: DeviceKeyScope, assertAuthorized: () => void) {
  const binding = structuredClone(scope), drafts = createSeatDraftStore(binding, assertAuthorized), images = createVenueImageStore(binding, assertAuthorized);
  const draftKey = JSON.stringify([binding.environmentId, binding.performanceId, binding.deviceUid]);

  /** 現在画像と送信待ちのキーを、既存の画像ストアと同じ規則で作る。 */
  function imageKey(kind: 'current' | 'pending', slot: string) {
    return JSON.stringify([binding.environmentId, binding.performanceId, binding.deviceUid, kind, slot]);
  }

  /** 置換前の下書き・全画像と送信待ちを、同じ読取り時点で取得する。 */
  async function snapshot() {
    const database = await openDeviceDatabase();
    try {
      return await new Promise<Map<string, EncryptedRecord | undefined>>((resolve, reject) => {
        const transaction = database.transaction(['seatDrafts', 'venueImages'], 'readonly');
        const records = new Map<string, EncryptedRecord | undefined>();
        const entries = [['seatDrafts', draftKey], ...IMAGE_SLOTS.flatMap((slot) =>
          [['venueImages', imageKey('current', slot)], ['venueImages', imageKey('pending', slot)]])];
        for (const [store, key] of entries) {
          const request = transaction.objectStore(store!).get(key!);
          request.onsuccess = () => records.set(key!, request.result);
        }
        transaction.oncomplete = () => resolve(records);
        transaction.onabort = () => reject(Error('SHARED_IMPORT_READ_FAILED'));
      });
    } finally { database.close(); }
  }

  /** 全検証・暗号化の後、下書きと画像の比較交換を一つのトランザクションで実行する。 */
  async function replace(input: ImportInput, expectedLocalRevision: number, confirmedReplacement: boolean) {
    requireValue(confirmedReplacement === true, 'SHARED_REPLACEMENT_CONFIRMATION_REQUIRED');
    const fixed = structuredClone(input);
    requireValue(isId(fixed.head?.operationId) && fixed.images.length <= 5, 'INVALID_SHARED_IMPORT');
    checkScope(fixed.source.layout, binding);
    validateLayout(fixed.source.layout);
    requireValue(fixed.source.layout.assignments.length === 0 && fixed.source.layout.ticketProtections.length === 0, 'SHARED_VENUE_LAYOUT_ONLY');
    assertAuthorized();
    const before = await snapshot(), prior = await drafts.loadLocalDraft();
    requireValue((prior?.localRevision ?? 0) === expectedLocalRevision, 'STALE_SEAT_DRAFT');
    requireValue((before.get(draftKey)?.dataRevision ?? 0) === expectedLocalRevision, 'STALE_SEAT_DRAFT');
    const incoming = new Map(fixed.images.map((image) => { validateImageSlot(image.slot); return [image.slot, image]; }));
    requireValue(incoming.size === fixed.images.length, 'INVALID_SHARED_IMPORT');
    const replacements = new Map<string, EncryptedRecord>();
    for (const slot of IMAGE_SLOTS) {
      const old = await images.readImage(slot), pending = await images.readUpload(slot);
      requireValue(pending?.status !== 'prepared', 'PENDING_IMAGE_OPERATION');
      requireValue((old?.localRevision ?? 0) === (before.get(imageKey('current', slot))?.dataRevision ?? 0), 'STALE_VENUE_IMAGE');
      const source = incoming.get(slot);
      const head: VenueImageHead = source?.head ?? { environmentId: binding.environmentId, performanceId: binding.performanceId,
        schemaVersion: 1, active: false, revision: (old?.head.revision ?? 0) + 1, operationId: fixed.head.operationId, bank: '', sha256: '' };
      const payload = source?.payload ?? null;
      if (source) await verifyVenueImage(source.payload, head, binding);
      const revision = (old?.localRevision ?? 0) + 1;
      const bytes = new TextEncoder().encode(JSON.stringify({ head, payload }));
      try {
        replacements.set(imageKey('current', slot), await encryptRecord({ ...binding, schemaVersion: 1,
          recordKind: 'venue-image-current', recordId: slot, dataRevision: revision }, bytes, assertAuthorized));
      } finally { bytes.fill(0); }
    }
    // 明示した共有案への置換では旧理由と空の任意設定も形式3で保持し、形式を降格させない。
    const prepared = await drafts.prepareLocalDraft({ draftId: prior?.draftId ?? crypto.randomUUID(), baseVersions: fixed.baseVersions,
      layout: fixed.source.layout, editReasons: fixed.source.editReasons ?? {}, imageBindings: fixed.source.imageBindings ?? {} }, expectedLocalRevision);
    replacements.set(draftKey, prepared.draft);
    const database = await openDeviceDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['seatDrafts', 'venueImages'], 'readwrite', { durability: 'strict' });
        let remaining = before.size, failure: unknown;
        for (const [key, expected] of before) {
          const request = transaction.objectStore(key === draftKey ? 'seatDrafts' : 'venueImages').get(key);
          request.onsuccess = () => {
            try {
              assertAuthorized();
              requireValue(sameRecord(request.result, expected), 'STALE_SHARED_IMPORT');
              remaining--;
              if (remaining !== 0) return;
              for (const [target, encrypted] of replacements) {
                transaction.objectStore(target === draftKey ? 'seatDrafts' : 'venueImages').put(encrypted, target);
              }
            } catch (error) { failure = error; transaction.abort(); }
          };
        }
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(failure ?? Error('SHARED_IMPORT_FAILED'));
      });
      assertAuthorized();

      return { localRevision: prepared.localRevision, savedAt: prepared.savedAt, operationId: fixed.head.operationId };
    } finally { database.close(); }
  }

  return { replace };
}
