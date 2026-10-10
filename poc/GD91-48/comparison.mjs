import {isDeepStrictEqual} from 'node:util';
import {validate} from '../GD91-07/planner.mjs';

// 論理比較の隔離候補。認可・確定版照合とRulesによる完成証明は別途必要。
export class ComparisonError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const need = (condition, code) => { if (!condition) throw new ComparisonError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shape = (value, required, optional = []) => object(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => [...required, ...optional].includes(key));
const uuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const optionalSeat = ['reservedLabel', 'displayOrder', 'emergencyChange'];
const commonSeat = ['seatId', 'sectionId', 'lineId', 'numberingMode', 'category', 'usable'];

function seatShape(seat) {
  need(object(seat), 'INVALID_SEAT_SCHEMA');
  const numbering = seat.numberingMode === 'automatic' ? ['prefix', 'number'] : ['manualNumber'];
  need(shape(seat, [...commonSeat, ...numbering], optionalSeat), 'INVALID_SEAT_SCHEMA');
  need(['automatic', 'manual'].includes(seat.numberingMode), 'INVALID_NUMBERING_MODE');
  need(['general', 'reserved', 'special'].includes(seat.category)
    && typeof seat.usable === 'boolean', 'INVALID_SEAT_ATTRIBUTES');
  if (Object.hasOwn(seat, 'reservedLabel')) need(typeof seat.reservedLabel === 'string', 'INVALID_SEAT_ATTRIBUTES');
  if (Object.hasOwn(seat, 'displayOrder')) need(Number.isSafeInteger(seat.displayOrder)
    && seat.displayOrder >= 0, 'INVALID_SEAT_ATTRIBUTES');
  if (Object.hasOwn(seat, 'emergencyChange')) {
    const e = seat.emergencyChange;
    need(shape(e, ['kind', 'reason']) && ['add', 'renumber', 'move'].includes(e.kind)
      && typeof e.reason === 'string' && e.reason.trim().length > 0, 'INVALID_CHANGE_MARKER');
  }
}

export function indexSeatFacts(entry, context) {
  need(shape(entry, ['environmentId', 'performanceId', 'generation', 'model'])
    && typeof entry.environmentId === 'string' && entry.environmentId.trim().length > 0
    && typeof entry.performanceId === 'string' && entry.performanceId.trim().length > 0
    && uuid(entry.generation), 'INVALID_ENTRY');
  const m = entry.model;
  need(shape(m, ['section', 'seats', 'assignments', 'ticketRefs', 'initialNumbered'], ['receptionRefs'])
    && Array.isArray(m.seats) && Array.isArray(m.assignments) && Array.isArray(m.ticketRefs), 'INVALID_MODEL');
  need(m.assignments.length === 0 && m.ticketRefs.length === 0
    && (m.receptionRefs === undefined || Array.isArray(m.receptionRefs) && m.receptionRefs.length === 0), 'DUPLICATED_BUSINESS_STATE');
  const section = m.section;
  need(shape(section, ['sectionId', 'name', 'rows', 'columns', 'axis', 'seatOrder', 'stagePosition', 'lineSettings', 'cells'])
    && Array.isArray(section.cells) && Array.isArray(section.lineSettings), 'INVALID_SECTION_SCHEMA');
  for (const cell of section.cells) need(shape(cell, ['cellId', 'row', 'column', 'kind'], ['seatId', 'consumedNumber']), 'INVALID_CELL_SCHEMA');
  for (const line of section.lineSettings) need(shape(line, ['lineId', 'index', 'name', 'prefix', 'startNumber', 'nextAutomaticNumber']), 'INVALID_LINE_SCHEMA');
  for (const seat of m.seats) seatShape(seat);
  try { validate(m, context); } catch { throw new ComparisonError('INVALID_LAYOUT'); }
  need(m.initialNumbered === true, 'UNPREPARED_SECTION');

  // セルを一度索引化し、席ごとに全セルを検索し直さない。
  const cells = new Map(section.cells.map(cell => [cell.cellId, structuredClone(cell)]));
  const cellsBySeat = new Map(section.cells.filter(cell => cell.kind === 'seat').map(cell => [cell.seatId, cell]));
  const facts = new Map(), displayNumbers = new Map();
  for (const seat of m.seats) {
    const raw = seat.numberingMode === 'automatic' ? seat.prefix + seat.number : seat.manualNumber;
    const displayNumber = raw.trim();
    const lineNumbers = displayNumbers.get(seat.lineId) ?? new Set();
    need(!lineNumbers.has(displayNumber), 'DUPLICATED_DISPLAY_NUMBER');
    lineNumbers.add(displayNumber); displayNumbers.set(seat.lineId, lineNumbers);
    facts.set(seat.seatId, {seat: structuredClone(seat), cell: structuredClone(cellsBySeat.get(seat.seatId)), displayNumber});
  }
  return {facts, cells, lines: new Map(section.lineSettings.map(line => [line.lineId, structuredClone(line)])),
    sectionId: section.sectionId, indexedCells: cells.size, indexedSeats: facts.size};
}

const differentKeys = (before, after) => [...new Set([...before.keys(), ...after.keys()])]
  .filter(id => !isDeepStrictEqual(before.get(id), after.get(id))).sort();

export function compareSections(before, after, context, operation = 'replaceSection') {
  need(operation === 'replaceSection', 'UNSUPPORTED_OPERATION');
  const old = indexSeatFacts(before, context), next = indexSeatFacts(after, context);
  need(before.environmentId === after.environmentId && before.performanceId === after.performanceId
    && old.sectionId === next.sectionId, 'WRONG_SCOPE');
  need(before.generation !== after.generation, 'REUSED_GENERATION');
  need(after.model.section.rows >= before.model.section.rows
    && after.model.section.columns >= before.model.section.columns, 'UNSUPPORTED_SHRINK');
  const oldSeatIds = [...old.facts.keys()].sort(), nextSeatIds = [...next.facts.keys()].sort();
  const removedSeatIds = oldSeatIds.filter(id => !next.facts.has(id));
  const addedSeatIds = nextSeatIds.filter(id => !old.facts.has(id));
  const changedSeatIds = oldSeatIds.filter(id => !isDeepStrictEqual(old.facts.get(id), next.facts.get(id)));
  return {factSchemaVersion: 1, environmentId: before.environmentId, performanceId: before.performanceId,
    sectionId: old.sectionId, baseGeneration: before.generation, generation: after.generation,
    oldSeatIds, nextSeatIds, changedSeatIds, removedSeatIds, addedSeatIds,
    changedCellIds: differentKeys(old.cells, next.cells), changedLineIds: differentKeys(old.lines, next.lines),
    indexedCells: old.indexedCells + next.indexedCells, indexedSeats: old.indexedSeats + next.indexedSeats};
}
