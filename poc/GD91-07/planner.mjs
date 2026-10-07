import { randomUUID } from 'node:crypto';

// 隔離検証用の純粋な計算。認可、永続化、QRの実処理を代替しない。
const kinds = new Set(['unset', 'seat', 'gap', 'space', 'aisle']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positive = n => Number.isSafeInteger(n) && n > 0;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const coordinate = c => `${c.row},${c.column}`;
const lineIndex = (s, c) => s.axis === 'horizontal' ? c.row : c.column;
const position = (s, c) => s.axis === 'horizontal' ? c.column : c.row;
const label = seat => seat.numberingMode === 'automatic' ? seat.prefix + seat.number : seat.manualNumber;

function capacity(rows, columns, context) {
  requireValue(positive(rows) && positive(columns), 'invalid dimensions');
  requireValue(positive(context.maxCells), 'evaluation budget required');
  requireValue(Number.isSafeInteger(rows * columns) && rows * columns <= context.maxCells, 'evaluation budget exceeded');
}
function id(context) {
  const value = (context.newId ?? randomUUID)();
  requireValue(uuid.test(value), 'invalid UUID');
  return value;
}
function lines(specs, firstIndex, context) {
  return specs.map((spec, offset) => {
    requireValue(typeof spec.name === 'string' && spec.name.trim().length > 0, 'line name required');
    requireValue(spec.prefix === undefined || typeof spec.prefix === 'string', 'invalid prefix');
    const startNumber = spec.startNumber ?? 1;
    requireValue(positive(startNumber), 'invalid start number');
    return { lineId: id(context), index: firstIndex + offset, name: spec.name,
      prefix: spec.prefix ?? `${spec.name}-`, startNumber, nextAutomaticNumber: startNumber };
  });
}

export function validate(model, context) {
  const s = model.section;
  capacity(s.rows, s.columns, context);
  requireValue(typeof s.name === 'string' && s.name.trim().length > 0, 'section name required');
  requireValue(['horizontal', 'vertical'].includes(s.axis) && ['forward', 'reverse'].includes(s.seatOrder), 'invalid direction');
  requireValue(['left', 'top'].includes(s.stagePosition), 'invalid stage');
  requireValue(s.lineSettings.length === (s.axis === 'horizontal' ? s.rows : s.columns), 'line count mismatch');
  requireValue(s.cells.length === s.rows * s.columns, 'cell count mismatch');
  const ids = [s.sectionId, ...s.lineSettings.map(l => l.lineId), ...s.cells.map(c => c.cellId), ...model.seats.map(seat => seat.seatId)];
  requireValue(ids.every(value => uuid.test(value)) && new Set(ids).size === ids.length, 'duplicate or invalid ID');
  requireValue(new Set(s.cells.map(coordinate)).size === s.cells.length, 'duplicate coordinate');
  const seatMap = new Map(model.seats.map(seat => [seat.seatId, seat]));
  const referenced = new Set(), numbers = new Set(), consumptions = new Set();
  s.lineSettings.forEach((line, index) => {
    requireValue(line.index === index && typeof line.name === 'string' && line.name.trim().length > 0
      && typeof line.prefix === 'string' && positive(line.startNumber) && positive(line.nextAutomaticNumber)
      && line.nextAutomaticNumber >= line.startNumber, 'invalid line');
  });
  for (const c of s.cells) {
    requireValue(Number.isSafeInteger(c.row) && c.row >= 0 && c.row < s.rows
      && Number.isSafeInteger(c.column) && c.column >= 0 && c.column < s.columns && kinds.has(c.kind), 'invalid cell');
    const line = s.lineSettings[lineIndex(s, c)];
    let consumed;
    if (c.kind === 'seat') {
      const seat = seatMap.get(c.seatId);
      requireValue(seat && !referenced.has(c.seatId) && seat.sectionId === s.sectionId && seat.lineId === line.lineId, 'invalid seat reference');
      referenced.add(c.seatId);
      requireValue(['automatic', 'manual'].includes(seat.numberingMode), 'invalid numbering mode');
      requireValue(typeof label(seat) === 'string' && label(seat).trim().length > 0, 'number required');
      if (seat.numberingMode === 'automatic') {
        requireValue(positive(seat.number) && seat.prefix === line.prefix, 'invalid automatic number');
        consumed = seat.number;
        requireValue(c.consumedNumber === undefined, 'automatic seat has gap record');
      } else if (c.consumedNumber !== undefined) consumed = c.consumedNumber;
      const key = `${line.lineId}|${label(seat)}`;
      requireValue(!numbers.has(key), 'duplicate display number'); numbers.add(key);
    } else {
      requireValue(c.seatId === undefined, 'non-seat reference');
      if (c.kind === 'gap') consumed = c.consumedNumber;
      else requireValue(c.consumedNumber === undefined, 'non-consuming cell');
    }
    if (c.kind === 'gap' || consumed !== undefined) {
      requireValue(positive(consumed) && consumed >= line.startNumber && consumed < line.nextAutomaticNumber, 'invalid consumed number');
      const key = `${line.lineId}|${consumed}`;
      requireValue(!consumptions.has(key), 'duplicate consumption'); consumptions.add(key);
    }
  }
  requireValue(referenced.size === model.seats.length, 'orphan seat');
  requireValue(new Set(model.assignments.map(a => a.attendeeId)).size === model.assignments.length
    && new Set(model.assignments.map(a => a.seatId)).size === model.assignments.length
    && model.assignments.every(a => seatMap.has(a.seatId)), 'invalid assignment reference');
  return model;
}

export function createSection(spec, context) {
  capacity(spec.rows, spec.columns, context);
  const section = { sectionId: id(context), name: spec.name, rows: spec.rows, columns: spec.columns,
    axis: spec.axis, seatOrder: spec.seatOrder, stagePosition: spec.stagePosition ?? 'left',
    lineSettings: lines(spec.lines, 0, context), cells: [] };
  for (let row = 0; row < section.rows; row++) for (let column = 0; column < section.columns; column++) {
    section.cells.push({ cellId: id(context), row, column, kind: 'unset' });
  }
  return validate({ section, seats: [], assignments: [], ticketRefs: [], initialNumbered: false }, context);
}

function numberSelected(model, selectedIds, selections, context) {
  const s = model.section;
  const selected = s.cells.filter(c => selectedIds.has(c.cellId));
  const byCoordinate = new Map(selected.map(c => [coordinate(c), c]));
  for (const [key, kind] of Object.entries(selections)) {
    requireValue(byCoordinate.has(key) && kinds.has(kind), 'invalid selection');
    byCoordinate.get(key).kind = kind;
  }
  for (const line of s.lineSettings) {
    const cells = selected.filter(c => lineIndex(s, c) === line.index)
      .sort((a, b) => (s.seatOrder === 'reverse' ? -1 : 1) * (position(s, a) - position(s, b)));
    for (const c of cells) {
      if (!['seat', 'gap'].includes(c.kind)) continue;
      const number = line.nextAutomaticNumber;
      // 次番号自体も安全整数に保つ。成功前の変更は複製内に限定する。
      requireValue(positive(number + 1), 'number overflow');
      line.nextAutomaticNumber++;
      if (c.kind === 'gap') { c.consumedNumber = number; continue; }
      const seat = { seatId: id(context), sectionId: s.sectionId, lineId: line.lineId,
        numberingMode: 'automatic', prefix: line.prefix, number, category: 'general', usable: true };
      if (context.duringPerformance) {
        requireValue(typeof context.reason === 'string' && context.reason.trim().length > 0, 'reason required');
        seat.emergencyChange = { kind: 'add', reason: context.reason };
      }
      c.seatId = seat.seatId; model.seats.push(seat);
    }
  }
  return validate(model, context);
}

export function numberInitial(before, selections, context) {
  validate(before, context);
  requireValue(!before.initialNumbered && before.section.cells.every(c => c.kind === 'unset'), 'initial numbering already performed');
  const after = structuredClone(before);
  after.initialNumbered = true;
  return numberSelected(after, new Set(after.section.cells.map(c => c.cellId)), selections, context);
}

export function extend(before, spec, context) {
  validate(before, context);
  requireValue(before.initialNumbered, 'initial numbering required');
  requireValue(['rows', 'columns'].includes(spec.dimension) && positive(spec.count), 'invalid extension');
  if (context.duringPerformance) requireValue(typeof context.reason === 'string' && context.reason.trim().length > 0, 'reason required');
  const after = structuredClone(before), s = after.section;
  const alongNumbering = (s.axis === 'horizontal' ? 'columns' : 'rows') === spec.dimension;
  const prepend = alongNumbering && s.seatOrder === 'reverse';
  const oldSize = s[spec.dimension];
  s[spec.dimension] += spec.count;
  capacity(s.rows, s.columns, context);
  if (alongNumbering) requireValue(spec.lines === undefined, 'unexpected new lines');
  else {
    requireValue(Array.isArray(spec.lines) && spec.lines.length === spec.count, 'new line settings required');
    s.lineSettings.push(...lines(spec.lines, s.lineSettings.length, context));
  }
  const field = spec.dimension === 'rows' ? 'row' : 'column';
  if (prepend) s.cells.forEach(c => { c[field] += spec.count; });
  const selectedIds = new Set();
  for (let row = 0; row < s.rows; row++) for (let column = 0; column < s.columns; column++) {
    const value = field === 'row' ? row : column;
    if (prepend ? value >= spec.count : value < oldSize) continue;
    const c = { cellId: id(context), row, column, kind: 'unset' };
    s.cells.push(c); selectedIds.add(c.cellId);
  }
  numberSelected(after, selectedIds, spec.selections ?? {}, context);
  return { after, change: { dimension: spec.dimension, count: spec.count,
    edge: spec.dimension === 'rows' ? (prepend ? 'top' : 'bottom') : (prepend ? 'left' : 'right'),
    translation: { row: prepend && field === 'row' ? spec.count : 0, column: prepend && field === 'column' ? spec.count : 0 },
    addedCellIds: [...selectedIds] } };
}

export function renameSection(before, name, context) {
  validate(before, context);
  const after = structuredClone(before); after.section.name = name;
  return validate(after, context);
}

export function changeStage(before, stagePosition, context) {
  validate(before, context);
  const after = structuredClone(before); after.section.stagePosition = stagePosition;
  return validate(after, context);
}
