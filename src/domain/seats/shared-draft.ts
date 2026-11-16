// 構成形式2の不変候補と、形式1の共有用編集情報を分けて保存・復元する。

import type { Scope, SeatLayout, SectionModel } from './types.ts';
import { validateLayout, checkScope, isId, nonnegative, positive, requireValue, displayNumber } from './validation.ts';
import type { VenueImageHead, ImageSlot } from './venue-image.ts';
import { validateImageHead, validateImageSlot } from './venue-image.ts';

export interface SharedDraftBasis extends Scope {
  expectedSharedRevision: number;
  baseLayoutGeneration: string;
  baseLayoutRevision: number;
  sourceControlRevision: number;
  calendarRevision: number;
}

export interface SharedEditorInput {
  layout: SeatLayout;
  editReasons?: Record<string, string>;
  imageBindings?: Record<string, ImageSlot>;
}

export interface SharedDraftPlan extends SharedDraftBasis {
  schemaVersion: 1;
  operationId: string;
  sections: Record<string, Record<string, unknown>>;
  parts: { index: number; count: number; slots: Record<string, Record<string, unknown>> }[];
  editor: {
    sections: Record<string, { initialNumbered: boolean; imageSlot?: ImageSlot }>;
    reasons: Record<string, string>;
    images: Partial<Record<ImageSlot, VenueImageHead>>;
    hasEditReasons: boolean;
    hasImageBindings: boolean;
  };
}

/** 表示番号を、RTDBで衝突せず参照できる子キーへ変換する。 */
export function sharedLabelKey(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('.', '%2E').replaceAll('$', '%24')
    .replaceAll('#', '%23').replaceAll('[', '%5B').replaceAll(']', '%5D').replaceAll('/', '%2F');
}

/** JSONのオブジェクト順を無視し、固定入力と取得本文を同じ内容として照合する。 */
export function sharedCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sharedCanonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${sharedCanonical((value as Record<string, unknown>)[key])}`).join(',')}}`;

  return JSON.stringify(value);
}

/** 完全な製品入力を検査し、16セル単位の構成候補と欠落しない編集状態へ変換する。 */
export function planSharedDraft(input: SharedEditorInput, basis: SharedDraftBasis, operationId: string,
  images: Partial<Record<ImageSlot, VenueImageHead>>): SharedDraftPlan {
  const source = structuredClone(input);
  validateLayout(source.layout);
  requireValue(source.layout.assignments.length === 0 && source.layout.ticketProtections.length === 0, 'SHARED_VENUE_LAYOUT_ONLY');
  checkScope(source.layout, basis);
  requireValue(isId(operationId) && nonnegative(basis.expectedSharedRevision) && nonnegative(basis.baseLayoutRevision) &&
    positive(basis.sourceControlRevision) && positive(basis.calendarRevision) &&
    (basis.baseLayoutRevision === 0 ? basis.baseLayoutGeneration === '' : isId(basis.baseLayoutGeneration)), 'INVALID_SHARED_BASIS');
  requireValue(source.layout.sections.length > 0, 'SHARED_LAYOUT_REQUIRED');
  const sections: SharedDraftPlan['sections'] = {}, editor: SharedDraftPlan['editor'] = {
    sections: {}, reasons: {}, images: structuredClone(images),
    hasEditReasons: source.editReasons !== undefined, hasImageBindings: source.imageBindings !== undefined,
  };
  for (const [slot, head] of Object.entries(images)) {
    validateImageSlot(slot);
    validateImageHead(head, basis);
    requireValue(head.active, 'INVALID_SHARED_IMAGE');
  }
  const items: Record<string, unknown>[] = [];
  for (const model of source.layout.sections) {
    const { section, seats } = model;
    const { sectionId, cells, lineSettings, ...header } = section;
    sections[sectionId] = { ...header,
      lines: Object.fromEntries(lineSettings.map((line) => [line.lineId, line])),
      lineIndices: Object.fromEntries(lineSettings.map((line) => [`i${line.index}`, line.lineId])) };
    const imageSlot = source.imageBindings?.[sectionId];
    if (imageSlot !== undefined) validateImageSlot(imageSlot);
    editor.sections[sectionId] = { initialNumbered: model.initialNumbered,
      ...(imageSlot === undefined ? {} : { imageSlot }) };
    const seatMap = new Map(seats.map((seat) => [seat.seatId, seat]));
    for (const cell of cells) {
      const seat = cell.seatId ? seatMap.get(cell.seatId) : undefined;
      const line = lineSettings[section.axis === 'horizontal' ? cell.row : cell.column]!;
      items.push({ ...cell, ...(seat ?? {}), id: seat?.seatId ?? cell.cellId, sectionId, lineId: line.lineId,
        label: seat ? displayNumber(seat) : '' });
    }
  }
  requireValue(Object.keys(source.imageBindings ?? {}).every((key) => sections[key]), 'INVALID_IMAGE_BINDINGS');
  const seatIds = new Set(source.layout.sections.flatMap((model) => model.seats.map((seat) => seat.seatId)));
  for (const [seatId, reason] of Object.entries(source.editReasons ?? {})) {
    requireValue(seatIds.has(seatId) && typeof reason === 'string' && reason === reason.trim() &&
      Array.from(reason).length > 0 && Array.from(reason).length <= 200, 'INVALID_EDIT_REASON');
    editor.reasons[seatId] = reason;
  }
  const parts: SharedDraftPlan['parts'] = [];
  for (let start = 0; start < items.length; start += 16) {
    const batch = items.slice(start, start + 16);
    const part = { index: parts.length, count: batch.length,
      slots: Object.fromEntries(batch.map((item, index) => [`s${String(index).padStart(2, '0')}`, item])) };
    requireValue(new TextEncoder().encode(JSON.stringify(part)).length <= 65536, 'SHARED_PART_TOO_LARGE');
    parts.push(part);
  }

  return { environmentId: basis.environmentId, performanceId: basis.performanceId,
    expectedSharedRevision: basis.expectedSharedRevision, baseLayoutGeneration: basis.baseLayoutGeneration,
    baseLayoutRevision: basis.baseLayoutRevision, sourceControlRevision: basis.sourceControlRevision,
    calendarRevision: basis.calendarRevision, schemaVersion: 1, operationId, sections, parts, editor };
}

/** 検証済みの構成と編集情報から製品型を戻す。現在の割当・券を共有案から作らない。 */
export function restoreSharedDraft(plan: SharedDraftPlan): SharedEditorInput {
  const scope = { environmentId: plan.environmentId, performanceId: plan.performanceId };
  const models: SectionModel[] = [];
  for (const [sectionId, raw] of Object.entries(plan.sections)) {
    const { lines, lineIndices: _indices, ...header } = raw;
    const items = plan.parts.flatMap((part) => Object.values(part.slots)).filter((item) => item.sectionId === sectionId);
    const cells = items.map((item) => ({ ...scope, cellId: item.cellId, row: item.row, column: item.column,
      kind: item.kind, ...(item.seatId ? { seatId: item.seatId } : {}),
      ...(item.consumedNumber === undefined ? {} : { consumedNumber: item.consumedNumber }) }));
    const seats = items.filter((item) => item.kind === 'seat').map((item) => {
      const { id: _id, cellId: _cellId, row: _row, column: _column, kind: _kind, label: _label, consumedNumber: _consumed, ...seat } = item;

      return seat;
    });
    const editor = plan.editor.sections[sectionId];
    requireValue(editor && typeof editor.initialNumbered === 'boolean', 'SHARED_EDITOR_REQUIRED');
    models.push({ section: { ...header, ...scope, sectionId,
      lineSettings: Object.values(lines as Record<string, { index: number }>).sort((a, b) => a.index - b.index), cells },
      seats, initialNumbered: editor.initialNumbered } as unknown as SectionModel);
  }
  const result = { layout: validateLayout({ ...scope, sections: models.sort((a, b) => a.section.displayOrder - b.section.displayOrder),
    assignments: [], ticketProtections: [] }),
    ...(plan.editor.hasEditReasons ? { editReasons: plan.editor.reasons } : {}),
    ...(plan.editor.hasImageBindings ? { imageBindings: Object.fromEntries(Object.entries(plan.editor.sections)
      .filter(([, value]) => value.imageSlot !== undefined).map(([key, value]) => [key, value.imageSlot!])) } : {}) };
  const rebuilt = planSharedDraft(result, plan, plan.operationId, plan.editor.images);
  requireValue(sharedCanonical(rebuilt) === sharedCanonical(plan), 'INVALID_SHARED_DRAFT');

  return result;
}
