// 通常の本人・端末認可で、会場画像の非公開準備・公開と不変結果照会を行う。

import { get, ref, set, update, serverTimestamp } from 'firebase/database';
import type { Database } from 'firebase/database';
import type { Scope } from '../../domain/seats/types.ts';
import { checkScope, isId, positive, requireValue } from '../../domain/seats/validation.ts';
import type { VenueImageHead, VenueImagePayload, VenueImageOperation, ImageBank, ImageSlot } from '../../domain/seats/venue-image.ts';
import { validateImageSlot, validateImageHead, verifyVenueImage, verifyImageOperation } from '../../domain/seats/venue-image.ts';
import { authorizeOnline } from '../../domain/authorization/policy.ts';
import type { AuthorizationSnapshot } from '../../domain/authorization/types.ts';
import { validatePerformanceCalendar } from '../../domain/authorization/performance-calendar.ts';
import type { PerformanceCalendar } from '../../domain/authorization/performance-calendar.ts';

export interface VenueImageJournal {
  /** 送信前に本文を端末へ固定し、別の未解決操作の上書きを拒否する。 */
  prepare(slot: ImageSlot, bank: ImageBank, payload: VenueImagePayload): Promise<void>;
  /** 同じID・内容の不変結果が確認できたことを保存する。 */
  confirm(slot: ImageSlot, operationId: string, result: VenueImageOperation): Promise<void>;
}

interface Context {
  scope: Scope;
  root: string;
  deviceDatabase: Database;
  fetchCurrent(): Promise<{ snapshot: AuthorizationSnapshot; serverNow: number }>;
}

/** 公開済みの画像だけを取得し、明示した固定本文の公開と結果照会を扱う窓口を作る。 */
export function createVenueImagePort(context: Context) {
  const scope = { environmentId: context.scope.environmentId, performanceId: context.scope.performanceId };
  requireValue(context.root === `environments/${scope.environmentId}/performances/${scope.performanceId}`, 'IMAGE_SCOPE_MISMATCH');

  /** 公演内の画像パスから、現在の通常権限で値を取得する。 */
  async function read(path: string) {
    return (await get(ref(context.deviceDatabase, `${context.root}/${path}`))).val();
  }

  /** 現在の管理権限と公演暦を照合し、公演前の編集だけを許可する。 */
  async function authorizeEdit(): Promise<AuthorizationSnapshot> {
    const { snapshot, serverNow } = await context.fetchCurrent();
    checkScope(snapshot, scope);
    authorizeOnline(snapshot, 'editSeatLayout', serverNow);
    const control = await read('control');
    const calendar = control?.calendar as PerformanceCalendar;
    validatePerformanceCalendar(calendar, scope);
    requireValue(snapshot.state === 'preparing' && !control.firstReceptionStartedAt &&
      serverNow < calendar.dayStartsAt, 'IMAGE_EDIT_BEFORE_PERFORMANCE_ONLY');

    return snapshot;
  }

  /** 画像枠の公開先を取得する。別公演と不完全な版は返さない。 */
  async function readHead(slot: ImageSlot): Promise<VenueImageHead | null> {
    validateImageSlot(slot);
    await context.fetchCurrent();
    const head = await read(`images/${slot}/head`) as VenueImageHead | null;
    if (head) validateImageHead(head, scope);

    return head;
  }

  /** 画像の取得前後で公開先が同じ場合だけ、実体・ハッシュを検証した本文を返す。 */
  async function readCurrent(slot: ImageSlot) {
    const head = await readHead(slot);
    if (!head) return null;
    if (!head.active) return { head, payload: null, blob: null };
    const payload = await read(`images/${slot}/banks/${head.bank}`) as VenueImagePayload;
    const blob = await verifyVenueImage(payload, head, scope);
    const after = await readHead(slot);
    requireValue(after?.revision === head.revision && after.operationId === head.operationId && after.bank === head.bank &&
      after.sha256 === head.sha256 && after.active, 'IMAGE_VERSION_CHANGED');

    return { head, payload, blob };
  }

  /** 管理者として、同じ操作IDの不変結果を照会する。未検出を自動再送の根拠にしない。 */
  async function result(slot: ImageSlot, operationId: string): Promise<VenueImageOperation | null> {
    validateImageSlot(slot);
    requireValue(isId(operationId), 'INVALID_OPERATION_ID');
    const { snapshot, serverNow } = await context.fetchCurrent();
    authorizeOnline(snapshot, 'editSeatLayout', serverNow);
    const value = await read(`images/${slot}/operations/${operationId}`) as VenueImageOperation | null;
    if (value) {
      checkScope(value, scope);
      requireValue(value.schemaVersion === 1 && value.slot === slot && positive(value.revision) && positive(value.committedAt) &&
        positive(value.controlRevision) &&
        (value.kind === 'publish' || value.kind === 'remove'), 'INVALID_IMAGE_RESULT');
    }

    return value;
  }

  /** 端末に固定した画像を非公開側へ準備し、公開先と不変結果を一体確定する。 */
  async function publish(slot: ImageSlot, bank: ImageBank, input: VenueImagePayload, journal: VenueImageJournal) {
    validateImageSlot(slot);
    requireValue(bank === 'a' || bank === 'b', 'INVALID_IMAGE_BANK');
    const payload = structuredClone(input);
    const nextHead: VenueImageHead = { ...scope, schemaVersion: 1, revision: payload.revision,
      active: true, bank, operationId: payload.operationId, sha256: payload.sha256 };
    await verifyVenueImage(payload, nextHead, scope);
    await journal.prepare(slot, bank, payload);

    const previous = await result(slot, payload.operationId);
    if (previous) {
      verifyImageOperation(previous, slot, payload, bank);
      await journal.confirm(slot, payload.operationId, previous);

      return previous;
    }
    await authorizeEdit();
    const head = await readHead(slot);
    requireValue((head?.revision ?? 0) === payload.expectedRevision && !(head?.active && head.bank === bank), 'STALE_IMAGE_REVISION');
    await set(ref(context.deviceDatabase, `${context.root}/images/${slot}/banks/${bank}`), payload);
    const actor = await authorizeEdit();
    const controlRevision = await read('control/controlRevision');
    requireValue(positive(controlRevision) && positive(controlRevision + 1), 'STALE_PERFORMANCE_CONTROL');
    await update(ref(context.deviceDatabase, context.root), {
      'control/controlRevision': controlRevision + 1,
      [`images/${slot}/head`]: nextHead,
      [`images/${slot}/operations/${payload.operationId}`]: { ...scope, schemaVersion: 1, kind: 'publish', slot,
        revision: payload.revision, bank, sha256: payload.sha256, committedAt: serverTimestamp(), controlRevision: controlRevision + 1,
        humanUid: actor.role.humanUid, deviceUid: actor.deviceAuthUid },
    });
    const confirmed = await result(slot, payload.operationId);
    requireValue(confirmed, 'IMAGE_RESULT_NOT_FOUND');
    verifyImageOperation(confirmed, slot, payload, bank);
    await readCurrent(slot);
    await journal.confirm(slot, payload.operationId, confirmed);

    return confirmed;
  }

  /** 明示確認された未使用側のバンクだけを回収する。現行・参照中はRulesが拒否する。 */
  async function collect(slot: ImageSlot, bank: ImageBank): Promise<void> {
    validateImageSlot(slot);
    requireValue(bank === 'a' || bank === 'b', 'INVALID_IMAGE_BANK');
    const { snapshot, serverNow } = await context.fetchCurrent();
    checkScope(snapshot, scope);
    authorizeOnline(snapshot, 'editSeatLayout', serverNow);
    await set(ref(context.deviceDatabase, `${context.root}/images/${slot}/banks/${bank}`), null);
  }

  return { readHead, readCurrent, result, publish, collect };
}
