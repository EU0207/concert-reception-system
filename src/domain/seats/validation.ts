import type { Id, Scope, Seat, SeatLayout, SectionModel, CalculationOptions } from './types.ts';

export const SEAT_LIMITS = Object.freeze({ sections: 16, linesPerSection: 256, cells: 4096,
  sectionName: 100, lineName: 64, prefix: 64, displayNumber: 64, reservedLabel: 100, reason: 200 });
export class SeatDomainError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'SeatDomainError'; this.code = code; }
}
export function requireValue(value: unknown, code: string): asserts value {
  if (!value) throw new SeatDomainError(code);
}
export const isId = (v: unknown): v is Id => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const positive = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
export const nonnegative = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
export function text(value: unknown, max: number, code: string, empty = false): asserts value is string {
  requireValue(typeof value === 'string' && value.length <= max
    && (empty || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/u.test(value), code);
}
export function checkScope(v: Scope, scope: Scope) {
  requireValue(v.environmentId === scope.environmentId && v.performanceId === scope.performanceId, 'SCOPE_MISMATCH');
}
export function displayNumber(seat: Seat): string {
  return seat.numberingMode === 'manual' ? seat.manualNumber : seat.prefix + seat.number;
}
export function allIds(layout: SeatLayout): Id[] {
  return layout.sections.flatMap(m => [m.section.sectionId, ...m.section.lineSettings.map(l => l.lineId),
    ...m.section.cells.map(c => c.cellId), ...m.seats.map(s => s.seatId)]);
}
export function idFactory(layout: SeatLayout, options: CalculationOptions) {
  const used = new Set([...allIds(layout), ...(options.retiredIds ?? [])].map(id => id.toLowerCase()));
  return () => {
    const value = (options.newId ?? (() => globalThis.crypto.randomUUID()))();
    requireValue(isId(value) && !used.has(value.toLowerCase()), 'INVALID_OR_REUSED_ID');
    used.add(value.toLowerCase()); return value;
  };
}
export function validateLayout(layout: SeatLayout): SeatLayout {
  requireValue(isId(layout.environmentId) && isId(layout.performanceId), 'INVALID_SCOPE');
  requireValue(Array.isArray(layout.sections) && layout.sections.length <= SEAT_LIMITS.sections, 'SECTION_LIMIT');
  const ids = allIds(layout).map(id => { requireValue(isId(id), 'INVALID_ID'); return id.toLowerCase(); });
  requireValue(new Set(ids).size === ids.length, 'DUPLICATE_ID');
  let count = 0;
  for (const model of layout.sections) {
    checkScope(model.section, layout); validateSection(model, layout);
    count += model.section.rows * model.section.columns;
    requireValue(Number.isSafeInteger(count) && count <= SEAT_LIMITS.cells, 'CELL_LIMIT');
  }
  requireValue(Array.isArray(layout.assignments) && Array.isArray(layout.ticketProtections), 'INVALID_REFERENCES');
  const seats = new Set(layout.sections.flatMap(m => m.seats.map(s => s.seatId)));
  const people = new Set<Id>(), assigned = new Set<Id>(), tickets = new Set<Id>();
  for (const t of layout.ticketProtections) {
    checkScope(t, layout);
    requireValue(isId(t.attendeeId) && !tickets.has(t.attendeeId) && typeof t.issued === 'boolean'
      && typeof t.sent === 'boolean' && typeof t.hasIssuedHistory === 'boolean'
      && (t.activeCredentialId === null || typeof t.activeCredentialId === 'string' && t.activeCredentialId.length > 0), 'INVALID_TICKET_REFERENCE');
    tickets.add(t.attendeeId);
  }
  for (const a of layout.assignments) {
    checkScope(a, layout);
    requireValue(isId(a.attendeeId) && seats.has(a.seatId) && !people.has(a.attendeeId)
      && !assigned.has(a.seatId) && typeof a.fixed === 'boolean' && nonnegative(a.revision)
      && (a.groupId === undefined || isId(a.groupId)), 'INVALID_ASSIGNMENT');
    requireValue(tickets.has(a.attendeeId), 'MISSING_TICKET_PROTECTION');
    people.add(a.attendeeId); assigned.add(a.seatId);
  }
  return layout;
}
function validateSection(model: SectionModel, scope: Scope) {
  const s = model.section;
  requireValue(positive(s.rows) && positive(s.columns) && s.rows * s.columns <= SEAT_LIMITS.cells, 'INVALID_DIMENSIONS');
  requireValue(['horizontal', 'vertical'].includes(s.axis) && ['forward', 'reverse'].includes(s.seatOrder)
    && ['left', 'top'].includes(s.stagePosition) && nonnegative(s.displayOrder), 'INVALID_SECTION');
  requireValue(s.floorId === undefined || isId(s.floorId), 'INVALID_FLOOR_ID');
  text(s.name, SEAT_LIMITS.sectionName, 'INVALID_SECTION_NAME');
  const lineCount = s.axis === 'horizontal' ? s.rows : s.columns;
  requireValue(lineCount <= SEAT_LIMITS.linesPerSection && s.lineSettings.length === lineCount, 'LINE_LIMIT');
  requireValue(s.cells.length === s.rows * s.columns && typeof model.initialNumbered === 'boolean', 'INCOMPLETE_GRID');
  for (const [i, l] of s.lineSettings.entries()) {
    checkScope(l, scope); text(l.name, SEAT_LIMITS.lineName, 'INVALID_LINE_NAME');
    text(l.prefix, SEAT_LIMITS.prefix, 'INVALID_PREFIX', true);
    requireValue(l.index === i && positive(l.startNumber) && positive(l.nextAutomaticNumber)
      && l.nextAutomaticNumber >= l.startNumber, 'INVALID_LINE');
  }
  const map = new Map(model.seats.map(seat => [seat.seatId, seat]));
  const referenced = new Set<Id>(), positions = new Set<string>(), numbers = new Set<string>(), consumed = new Set<string>();
  for (const c of s.cells) {
    checkScope(c, scope);
    requireValue(nonnegative(c.row) && c.row < s.rows && nonnegative(c.column) && c.column < s.columns
      && ['unset', 'seat', 'gap', 'space', 'aisle'].includes(c.kind), 'INVALID_CELL');
    const position = `${c.row},${c.column}`; requireValue(!positions.has(position), 'DUPLICATE_COORDINATE'); positions.add(position);
    const line = s.lineSettings[s.axis === 'horizontal' ? c.row : c.column]!;
    let used: number | undefined;
    if (c.kind === 'seat') {
      const seat = map.get(c.seatId!);
      requireValue(seat && !referenced.has(seat.seatId) && seat.sectionId === s.sectionId && seat.lineId === line.lineId, 'INVALID_SEAT_REFERENCE');
      checkScope(seat, scope); referenced.add(seat.seatId);
      requireValue(['general', 'reserved', 'special'].includes(seat.category) && typeof seat.usable === 'boolean'
        && nonnegative(seat.displayOrder), 'INVALID_SEAT');
      if (seat.reservedLabel !== undefined) text(seat.reservedLabel, SEAT_LIMITS.reservedLabel, 'INVALID_RESERVED_LABEL', true);
      if (seat.numberingMode === 'automatic') {
        requireValue(positive(seat.number) && seat.prefix === line.prefix && seat.manualNumber === undefined
          && c.consumedNumber === undefined, 'INVALID_AUTOMATIC_NUMBER'); used = seat.number;
      } else {
        requireValue(seat.numberingMode === 'manual' && seat.number === undefined && seat.prefix === undefined, 'INVALID_NUMBERING_MODE');
        text(seat.manualNumber, SEAT_LIMITS.displayNumber, 'INVALID_MANUAL_NUMBER');
        requireValue(seat.manualNumber === seat.manualNumber.trim(), 'UNTRIMMED_MANUAL_NUMBER'); used = c.consumedNumber;
      }
      text(displayNumber(seat), SEAT_LIMITS.displayNumber, 'INVALID_DISPLAY_NUMBER');
      const numberKey = JSON.stringify([line.lineId, displayNumber(seat).trim()]);
      requireValue(!numbers.has(numberKey), 'DUPLICATE_DISPLAY_NUMBER'); numbers.add(numberKey);
      if (seat.emergencyChange) {
        requireValue(['add', 'number', 'position'].includes(seat.emergencyChange.kind)
          && isId(seat.emergencyChange.operationId) && nonnegative(seat.emergencyChange.markedAt), 'INVALID_EMERGENCY_CHANGE');
        text(seat.emergencyChange.reason, SEAT_LIMITS.reason, 'INVALID_REASON');
      }
    } else {
      requireValue(c.seatId === undefined, 'NON_SEAT_REFERENCE');
      if (c.kind === 'gap') { requireValue(positive(c.consumedNumber), 'MISSING_GAP_NUMBER'); used = c.consumedNumber; }
      else requireValue(c.consumedNumber === undefined, 'NON_CONSUMING_CELL');
    }
    if (used !== undefined) {
      requireValue(positive(used) && used >= line.startNumber && used < line.nextAutomaticNumber, 'INVALID_CONSUMPTION');
      const key = JSON.stringify([line.lineId, used]); requireValue(!consumed.has(key), 'DUPLICATE_CONSUMPTION'); consumed.add(key);
    }
  }
  requireValue(referenced.size === model.seats.length, 'ORPHAN_SEAT');
  if (!model.initialNumbered) requireValue(s.cells.every(c => c.kind === 'unset'), 'UNNUMBERED_STRUCTURE');
}
