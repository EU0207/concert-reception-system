// 通常SDKで共有候補を分割保存し、編集情報・保持予約と不変結果を照合する。

import { get, ref, set, update, serverTimestamp, query, orderByKey, startAfter, limitToFirst } from 'firebase/database';
import type { Database } from 'firebase/database';
import type { Scope } from '../../domain/seats/types.ts';
import type { PendingSeatOperation } from '../../storage/seat-drafts.ts';
import type { SeatOperationTransport } from '../../storage/seat-operation-controller.ts';
import { seatOperationDigest } from '../../storage/seat-operation-controller.ts';
import type { SeatOperationReceipt } from '../../storage/seat-operation-delivery.ts';
import { sharedCanonical, sharedLabelKey, restoreSharedDraft } from '../../domain/seats/shared-draft.ts';
import type { SharedDraftPlan, SharedDraftBasis } from '../../domain/seats/shared-draft.ts';
import { checkScope, positive, nonnegative, isId, requireValue } from '../../domain/seats/validation.ts';
import { verifyVenueImage } from '../../domain/seats/venue-image.ts';
import type { AuthorizationSnapshot } from '../../domain/authorization/types.ts';
import { authorizeOnline } from '../../domain/authorization/policy.ts';
import { validatePerformanceCalendar } from '../../domain/authorization/performance-calendar.ts';

interface Context {
  scope: Scope;
  root: string;
  deviceDatabase: Database;
  fetchCurrent(): Promise<{ snapshot: AuthorizationSnapshot; serverNow: number }>;
}

/** 未解決の固定操作だけを送信し、他端末の共有版を巻き戻さない窓口を作る。 */
export function createSharedSeatPort(context: Context) {
  const scope = structuredClone(context.scope);
  requireValue(context.root === `environments/${scope.environmentId}/performances/${scope.performanceId}`, 'SHARED_SCOPE_MISMATCH');

  /** 現在の通常管理権限を検査する。 */
  async function authorize() {
    const { snapshot, serverNow } = await context.fetchCurrent();
    checkScope(snapshot, scope);
    authorizeOnline(snapshot, 'editSeatLayout', serverNow);

    return snapshot;
  }

  /** 公演内の限定したパスを読む。 */
  async function read(path: string): Promise<any> {
    return (await get(ref(context.deviceDatabase, `${context.root}/${path}`))).val();
  }

  /** 同じIDの再開では本文が完全に一致することを確認し、既存値を変更しない。 */
  async function putOnce(path: string, value: unknown) {
    const old = await read(path);
    if (old !== null) {
      requireValue(sharedCanonical(old) === sharedCanonical(value), 'SHARED_CONTENT_CONFLICT');
      return;
    }
    await set(ref(context.deviceDatabase, `${context.root}/${path}`), value);
  }

  /** 公演管理版と共有・確定構成の版を取得前後で照合する。 */
  async function basis(): Promise<SharedDraftBasis> {
    await authorize();
    const control = await read('control');
    validatePerformanceCalendar(control?.calendar, scope);
    requireValue(control?.layoutSchemaVersion === 2 && control.businessSchemaVersion === 3 && positive(control.controlRevision), 'SHARED_CONTROL_REQUIRED');
    const headRevision = await read('head/revision'), generation = await read('head/generation');
    const shared = await read('sharedHead');
    const after = await read('control');
    requireValue(control.controlRevision === after?.controlRevision && control.calendar.calendarRevision === after.calendar?.calendarRevision,
      'SHARED_VERSION_CHANGED');
    requireValue(headRevision === await read('head/revision') && generation === await read('head/generation') &&
      sharedCanonical(shared) === sharedCanonical(await read('sharedHead')), 'SHARED_VERSION_CHANGED');
    requireValue(headRevision === null ? generation === null : positive(headRevision) && isId(generation), 'INVALID_SHARED_BASIS');
    requireValue(shared === null || positive(shared.revision) && isId(shared.operationId), 'INVALID_SHARED_HEAD');

    return { ...scope, expectedSharedRevision: shared?.revision ?? 0, baseLayoutGeneration: generation ?? '',
      baseLayoutRevision: headRevision ?? 0, sourceControlRevision: control.controlRevision, calendarRevision: control.calendar.calendarRevision };
  }

  /** 固定入力と操作ID・基準版から、送信対象の共有案を取り出す。 */
  function fixed(operation: PendingSeatOperation): SharedDraftPlan {
    requireValue(operation.kind === 'share' && operation.draftSnapshot && operation.command.sharedPlan, 'SHARED_PLAN_REQUIRED');
    const plan = structuredClone(operation.command.sharedPlan) as SharedDraftPlan;
    requireValue(operation.expectedVersions.assignmentRevision === 0 && operation.expectedVersions.ticketRevision === 0 &&
      operation.expectedVersions.attendeeRevision === 0, 'SHARED_VENUE_LAYOUT_ONLY');
    checkScope(plan, scope);
    requireValue(plan.schemaVersion === 1 && plan.operationId === operation.operationId && isId(plan.operationId), 'INVALID_SHARED_PLAN');
    const restored = restoreSharedDraft(plan), source = operation.draftSnapshot;
    requireValue(sharedCanonical(restored) === sharedCanonical({ layout: source.layout,
      ...(source.editReasons === undefined ? {} : { editReasons: source.editReasons }),
      ...(source.imageBindings === undefined ? {} : { imageBindings: source.imageBindings }) }), 'SHARED_SNAPSHOT_MISMATCH');
    requireValue(operation.expectedVersions.layoutRevision === plan.baseLayoutRevision &&
      operation.expectedVersions.controlRevision === plan.sourceControlRevision &&
      operation.expectedVersions.calendarRevision === plan.calendarRevision, 'SHARED_BASIS_MISMATCH');

    return plan;
  }

  /** 件数の大きい旧理由も、32キーずつ上限を持って取得する。 */
  async function readReasons(operationId: string, expected: number) {
    requireValue(nonnegative(expected) && expected <= 4096, 'INVALID_SHARED_COUNT');
    const result: Record<string, string> = {};
    let last: string | undefined;
    while (true) {
      const constraints = [orderByKey(), ...(last ? [startAfter(last)] : []), limitToFirst(32)];
      const value = (await get(query(ref(context.deviceDatabase, `${context.root}/sharedDrafts/${operationId}/reasons`), ...constraints))).val() ?? {};
      const keys = Object.keys(value).sort();
      Object.assign(result, value);
      requireValue(Object.keys(result).length <= expected, 'INVALID_SHARED_COUNT');
      if (keys.length < 32) break;
      last = keys.at(-1);
    }
    requireValue(Object.keys(result).length === expected, 'INCOMPLETE_SHARED_DRAFT');

    return result;
  }

  /** 不変結果が指す候補・編集情報を分割取得し、元の製品型へ往復検証する。 */
  async function readPlan(operationId: string): Promise<SharedDraftPlan> {
    requireValue(isId(operationId), 'INVALID_OPERATION_ID');
    await authorize();
    const meta = await read(`sharedDrafts/${operationId}/meta`), gm = await read(`generations/${operationId}/meta`);
    requireValue(meta?.schemaVersion === 1 && meta.operationId === operationId && meta.generation === operationId &&
      gm?.schemaVersion === 2 && gm.phase === 'ready' &&
      positive(gm.expectedParts) && gm.expectedParts <= 256 && positive(meta.sectionCount) && meta.sectionCount <= 16 &&
      nonnegative(meta.imageCount) && meta.imageCount <= 5, 'INCOMPLETE_SHARED_DRAFT');
    checkScope(meta, scope); checkScope(gm, scope);
    const sections = await read(`generations/${operationId}/sections`) ?? {};
    requireValue(Object.keys(sections).length === meta.sectionCount, 'INCOMPLETE_SHARED_DRAFT');
    const parts = [];
    for (let index = 0; index < gm.expectedParts; index++) {
      const part = await read(`generations/${operationId}/parts/p${index}`);
      requireValue(part && part.index === index && positive(part.count) && part.count <= 16 &&
        Object.keys(part.slots ?? {}).length === part.count && new TextEncoder().encode(JSON.stringify(part)).length <= 65536,
      'INVALID_SHARED_PART');
      parts.push(part);
    }
    const editorSections = await read(`sharedDrafts/${operationId}/sections`) ?? {};
    // RTDBは数値キー0～4の集合を配列として返すことがある。空き枠を除いた固定キーの辞書へ戻す。
    const images = Object.fromEntries(Object.entries(await read(`sharedDrafts/${operationId}/images`) ?? {})
      .filter(([, image]) => image !== null));
    requireValue(Object.keys(editorSections).length === meta.sectionCount && Object.keys(images).length === meta.imageCount,
      'INCOMPLETE_SHARED_DRAFT');
    const plan: SharedDraftPlan = { ...scope, schemaVersion: 1, operationId,
      expectedSharedRevision: meta.expectedSharedRevision, baseLayoutGeneration: meta.baseLayoutGeneration,
      baseLayoutRevision: meta.baseLayoutRevision, sourceControlRevision: meta.sourceControlRevision,
      calendarRevision: meta.calendarRevision, sections, parts,
      editor: { sections: editorSections, images, reasons: await readReasons(operationId, meta.reasonCount),
        hasEditReasons: meta.hasEditReasons, hasImageBindings: meta.hasImageBindings } };
    restoreSharedDraft(plan);
    await authorize();

    return plan;
  }

  /** 操作IDと固定入力の結果が一致する場合だけ、受領記録を返す。 */
  async function lookup(operation: PendingSeatOperation, inputDigest: string) {
    const plan = fixed(operation);
    await authorize();
    const result = await read(`sharedOperations/${plan.operationId}`);
    if (!result) return { status: await read(`sharedDrafts/${plan.operationId}/meta`) ? 'preparing' as const : 'notFound' as const };
    requireValue(result.schemaVersion === 1 && result.operationId === plan.operationId && result.generation === plan.operationId &&
      result.referenceId === plan.operationId && result.inputDigest === inputDigest &&
      result.baseLayoutGeneration === plan.baseLayoutGeneration && result.baseLayoutRevision === plan.baseLayoutRevision &&
      result.resultRevision === plan.expectedSharedRevision + 1 && positive(result.committedAt), 'SHARED_RESULT_MISMATCH');
    checkScope(result, scope);

    return { status: 'confirmed' as const, receipt: { operationId: plan.operationId, kind: 'share' as const,
      inputDigest, resultRevision: result.resultRevision } };
  }

  /** 保存中断後も、現在認可・全基準版が同じ場合だけ明示再開を許可する。 */
  async function canSend(operation: PendingSeatOperation) {
    const plan = fixed(operation), actor = await authorize(), current = await basis();

    return sharedCanonical(current) === sharedCanonical({ ...scope, expectedSharedRevision: plan.expectedSharedRevision,
      baseLayoutGeneration: plan.baseLayoutGeneration, baseLayoutRevision: plan.baseLayoutRevision,
      sourceControlRevision: plan.sourceControlRevision, calendarRevision: plan.calendarRevision }) &&
      actor.role.revision === operation.expectedVersions.roleRevision &&
      actor.device.preparedRoleRevision === operation.expectedVersions.deviceRevision;
  }

  /** 端末に固定された構成・編集情報を準備し、共有選択版と結果だけを一体更新する。 */
  async function send(operation: PendingSeatOperation) {
    const plan = fixed(operation), id = plan.operationId;
    requireValue(await canSend(operation), 'STALE_SHARED_DRAFT');
    const actor = await authorize(), digest = await seatOperationDigest(operation);
    const meta = { ...scope, schemaVersion: 1, operationId: id, generation: id,
      humanUid: actor.role.humanUid, deviceUid: actor.deviceAuthUid, baseLayoutGeneration: plan.baseLayoutGeneration,
      baseLayoutRevision: plan.baseLayoutRevision, sourceControlRevision: plan.sourceControlRevision,
      calendarRevision: plan.calendarRevision, expectedSharedRevision: plan.expectedSharedRevision,
      sectionCount: Object.keys(plan.sections).length, reasonCount: Object.keys(plan.editor.reasons).length,
      imageCount: Object.keys(plan.editor.images).length, hasEditReasons: plan.editor.hasEditReasons,
      hasImageBindings: plan.editor.hasImageBindings, inputDigest: digest, draftDigest: operation.draftDigest,
      roleRevision: operation.expectedVersions.roleRevision, deviceRevision: operation.expectedVersions.deviceRevision };
    await putOnce(`sharedDrafts/${id}/meta`, meta);
    for (const [slot, image] of Object.entries(plan.editor.images)) await putOnce(`sharedDrafts/${id}/images/${slot}`, image);
    const reservation = { ...scope, schemaVersion: 4, operationId: id, generation: id, deviceUid: actor.deviceAuthUid,
      baseLayoutGeneration: plan.baseLayoutGeneration, baseLayoutRevision: plan.baseLayoutRevision,
      expectedSharedRevision: plan.expectedSharedRevision, sourceControlRevision: plan.sourceControlRevision,
      calendarRevision: plan.calendarRevision, active: true, revision: 1,
      roleRevision: operation.expectedVersions.roleRevision, deviceRevision: operation.expectedVersions.deviceRevision };
    const known = await read(`references/${id}`);
    if (known) requireValue(sharedCanonical(known) === sharedCanonical(reservation), 'SHARED_REFERENCE_MISMATCH');
    else {
      const pins: Record<string, unknown> = { [`references/${id}`]: reservation, [`generations/${id}/refs/${id}`]: true };
      if (plan.baseLayoutGeneration) pins[`generations/${plan.baseLayoutGeneration}/refs/${id}`] = true;
      for (const [slot, image] of Object.entries(plan.editor.images)) pins[`images/${slot}/references/${image.bank}/${id}`] = true;
      await update(ref(context.deviceDatabase, context.root), pins);
    }
    let gm = { ...scope, schemaVersion: 2, kind: 'layout', phase: 'building', expectedSections: Object.keys(plan.sections).length,
      sectionCursor: 0, expectedParts: plan.parts.length, cursor: 0, totalCells: plan.parts.reduce((sum, part) => sum + part.count, 0),
      receivedCells: 0, sectionCellTotal: 0, revision: 1, lastSection: '', lastPart: '' };
    const liveMeta = await read(`generations/${id}/meta`);
    if (!liveMeta) await set(ref(context.deviceDatabase, `${context.root}/generations/${id}/meta`), gm);
    for (const [sectionId, section] of Object.entries(plan.sections)) {
      gm = { ...gm, revision: gm.revision + 1, sectionCursor: gm.sectionCursor + 1, lastSection: sectionId,
        sectionCellTotal: gm.sectionCellTotal + Number(section.rows) * Number(section.columns) };
      const old = await read(`generations/${id}/sections/${sectionId}`);
      if (old) requireValue(sharedCanonical(old) === sharedCanonical(section), 'SHARED_CONTENT_CONFLICT');
      else await update(ref(context.deviceDatabase, context.root), {
        [`generations/${id}/meta`]: gm, [`generations/${id}/sections/${sectionId}`]: section,
        [`generations/${id}/sectionOrder/s${gm.sectionCursor - 1}`]: sectionId });
    }
    for (const part of plan.parts) {
      const partId = `p${part.index}`;
      gm = { ...gm, revision: gm.revision + 1, cursor: gm.cursor + 1, receivedCells: gm.receivedCells + part.count, lastPart: partId };
      const old = await read(`generations/${id}/parts/${partId}`);
      if (old) { requireValue(sharedCanonical(old) === sharedCanonical(part), 'SHARED_CONTENT_CONFLICT'); continue; }
      const paths: Record<string, unknown> = { [`generations/${id}/meta`]: gm, [`generations/${id}/parts/${partId}`]: part };
      for (const [slot, item] of Object.entries(part.slots)) {
        const point = { part: partId, slot }, prefix = `generations/${id}`;
        paths[`${prefix}/ids/${item.id}`] = point;
        paths[`${prefix}/indexes/cells/${item.cellId}`] = point;
        paths[`${prefix}/indexes/coordinates/${item.sectionId}/r${item.row}c${item.column}`] = point;
        if (item.kind === 'seat') paths[`${prefix}/labels/${item.sectionId}/${item.lineId}/${sharedLabelKey(String(item.label))}`] = point;
        const consumed = item.numberingMode === 'automatic' ? item.number : item.consumedNumber;
        if (consumed !== undefined) paths[`${prefix}/indexes/numbers/${item.sectionId}/${item.lineId}/n${consumed}`] = point;
      }
      await update(ref(context.deviceDatabase, context.root), paths);
    }
    if (!await read(`sharedDrafts/${id}/progress`)) await putOnce(`sharedDrafts/${id}/progress`, { sections: 0, reasons: 0, lastSection: '', lastReason: '' });
    for (const [sectionId, editor] of Object.entries(plan.editor.sections)) await putEditor('sections', sectionId, editor, id);
    for (const [seatId, reason] of Object.entries(plan.editor.reasons)) await putEditor('reasons', seatId, reason, id);
    const ready = { ...gm, phase: 'ready', revision: gm.revision + 1 };
    const finalMeta = await read(`generations/${id}/meta`);
    if (finalMeta.phase !== 'ready') await set(ref(context.deviceDatabase, `${context.root}/generations/${id}/meta`), ready);
    else requireValue(sharedCanonical(finalMeta) === sharedCanonical(ready), 'SHARED_CONTENT_CONFLICT');
    requireValue(await canSend(operation), 'STALE_SHARED_DRAFT');
    const resultRevision = plan.expectedSharedRevision + 1;
    await update(ref(context.deviceDatabase, context.root), {
      sharedHead: { ...scope, schemaVersion: 1, generation: id, revision: resultRevision, operationId: id,
        baseLayoutGeneration: plan.baseLayoutGeneration, baseLayoutRevision: plan.baseLayoutRevision, referenceId: id },
      [`sharedOperations/${id}`]: { ...scope, schemaVersion: 1, generation: id, resultRevision, operationId: id,
        baseLayoutGeneration: plan.baseLayoutGeneration, baseLayoutRevision: plan.baseLayoutRevision, referenceId: id,
        inputDigest: digest, humanUid: actor.role.humanUid, deviceUid: actor.deviceAuthUid, committedAt: serverTimestamp() },
    });
  }

  /** 編集情報の1件と進捗を一体追記し、部分保存で完了件数だけを増やさない。 */
  async function putEditor(kind: 'sections' | 'reasons', key: string, value: unknown, id: string) {
    const old = await read(`sharedDrafts/${id}/${kind}/${key}`);
    if (old !== null) {
      requireValue(sharedCanonical(old) === sharedCanonical(value), 'SHARED_CONTENT_CONFLICT');
      return;
    }
    const progress = await read(`sharedDrafts/${id}/progress`);
    await update(ref(context.deviceDatabase, context.root), {
      [`sharedDrafts/${id}/${kind}/${key}`]: value,
      [`sharedDrafts/${id}/progress`]: { ...progress, [kind]: progress[kind] + 1,
        [kind === 'sections' ? 'lastSection' : 'lastReason']: key },
    });
  }

  /** 過去の結果でも同じ候補本文と全画像を照合し、現共有先から成功を推測しない。 */
  async function verifyApplied(operation: PendingSeatOperation, receipt: SeatOperationReceipt) {
    const expected = fixed(operation), found = await lookup(operation, await seatOperationDigest(operation));
    requireValue(found.status === 'confirmed' && sharedCanonical(found.receipt) === sharedCanonical(receipt), 'SHARED_RESULT_MISMATCH');
    requireValue(sharedCanonical(await readPlan(operation.operationId)) === sharedCanonical(expected), 'SHARED_CONTENT_CONFLICT');
    for (const [slot, image] of Object.entries(expected.editor.images)) {
      await verifyVenueImage(await read(`images/${slot}/banks/${image.bank}`), image, scope);
    }
    await authorize();
  }

  /** 現共有版だけを一貫して取得する。呼出元が置換確認と端末保存を終えてから再開する。 */
  async function readCurrent() {
    await authorize();
    const head = await read('sharedHead');
    if (!head) return null;
    checkScope(head, scope);
    requireValue(head.schemaVersion === 1 && isId(head.operationId) && head.generation === head.operationId &&
      head.referenceId === head.operationId && positive(head.revision), 'INVALID_SHARED_HEAD');
    const plan = await readPlan(head.operationId), source = restoreSharedDraft(plan);
    const result = await read(`sharedOperations/${head.operationId}`), meta = await read(`sharedDrafts/${head.operationId}/meta`);
    requireValue(result?.schemaVersion === 1 && result.operationId === head.operationId && result.generation === head.generation &&
      result.resultRevision === head.revision && result.inputDigest === meta.inputDigest &&
      result.baseLayoutGeneration === plan.baseLayoutGeneration && result.baseLayoutRevision === plan.baseLayoutRevision &&
      head.baseLayoutGeneration === plan.baseLayoutGeneration && head.baseLayoutRevision === plan.baseLayoutRevision &&
      result.referenceId === head.operationId && result.humanUid === meta.humanUid && result.deviceUid === meta.deviceUid &&
      head.revision === plan.expectedSharedRevision + 1 && positive(result.committedAt), 'SHARED_RESULT_MISMATCH');
    checkScope(result, scope);
    const images = [];
    for (const [slot, image] of Object.entries(plan.editor.images)) {
      const payload = await read(`images/${slot}/banks/${image.bank}`), blob = await verifyVenueImage(payload, image, scope);
      images.push({ slot, head: image, payload, blob });
    }
    requireValue(sharedCanonical(head) === sharedCanonical(await read('sharedHead')), 'SHARED_VERSION_CHANGED');
    await authorize();

    // 共有後に正本が進んでも、取得時の最新版へ黙って基準版を置き換えない。
    const baseVersions = { layoutRevision: plan.baseLayoutRevision, assignmentRevision: 0, ticketRevision: 0, attendeeRevision: 0,
      controlRevision: plan.sourceControlRevision, calendarRevision: plan.calendarRevision };

    return { head, source, images, baseVersions };
  }

  const transport: SeatOperationTransport = { lookup, canSend, send, verifyApplied };
  return { basis, transport, readCurrent };
}
