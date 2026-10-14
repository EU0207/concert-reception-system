import assert from 'node:assert/strict';
import {partPlan as legacyPartPlan} from '../GD91-84/generation-tests.mjs';
import {validate} from '../GD91-07/planner.mjs';

export const schemaVersion = 2;
export const slotsPerPart = 16;
export const coordinateKey = c => 'r' + c.row + 'c' + c.column;
export const consumed = item => item.kind === 'seat' && item.numberingMode === 'automatic' ? item.number : item.consumedNumber;

export function encode(models) {
  const sections = {}, items = [];
  for (const model of models) {
    validate(model, {maxCells: 100000});
    const s = model.section, seats = new Map(model.seats.map(x => [x.seatId, x]));
    sections[s.sectionId] = {
      name: s.name, displayOrder: Object.keys(sections).length, rows: s.rows, columns: s.columns,
      axis: s.axis, seatOrder: s.seatOrder, stagePosition: s.stagePosition,
      ...(s.floorId ? {floorId: s.floorId} : {}),
      lines: Object.fromEntries(s.lineSettings.map(l => [l.lineId, {...l}])),
      lineIndices: Object.fromEntries(s.lineSettings.map(l => ['i' + l.index, l.lineId]))
    };
    for (const c of s.cells) {
      const line = s.lineSettings[s.axis === 'horizontal' ? c.row : c.column], seat = seats.get(c.seatId);
      const item = {
        id: seat?.seatId ?? c.cellId, cellId: c.cellId, row: c.row, column: c.column,
        kind: c.kind, sectionId: s.sectionId, lineId: line.lineId,
        label: seat ? (seat.numberingMode === 'manual' ? seat.manualNumber : seat.prefix + seat.number) : '',
        ...(c.consumedNumber === undefined ? {} : {consumedNumber: c.consumedNumber})
      };
      if (seat) Object.assign(item, seat, {displayOrder: seat.displayOrder ?? items.length});
      items.push(item);
    }
  }
  return {sections, items};
}

export function initialMeta(parts, sections) {
  return {kind: 'layout', schemaVersion, phase: 'building', revision: 1, cursor: 0,
    expectedParts: parts, lastPart: '', expectedSections: sections, sectionCursor: 0,
    lastSection: '', sectionCellTotal: 0, receivedCells: 0};
}

export function sectionPlan(generation, meta, id, section) {
  return {
    ['generations/' + generation + '/meta']: {...meta, sectionCursor: meta.sectionCursor + 1,
      lastSection: id, sectionCellTotal: meta.sectionCellTotal + section.rows * section.columns},
    ['generations/' + generation + '/sections/' + id]: section,
    ['generations/' + generation + '/sectionOrder/s' + meta.sectionCursor]: id
  };
}

export function partPlan(generation, meta, items) {
  assert(items.length > 0 && items.length <= slotsPerPart);
  const body = legacyPartPlan(generation, meta, items), part = 'p' + meta.cursor;
  body['generations/' + generation + '/meta'].receivedCells = meta.receivedCells + items.length;
  for (const [i, item] of items.entries()) {
    const point = {part, slot: 's' + String(i).padStart(2, '0')};
    body['generations/' + generation + '/cells/' + item.cellId] = point;
    body['generations/' + generation + '/coordinates/' + item.sectionId + '/' + coordinateKey(item)] = point;
    const number = consumed(item);
    if (number !== undefined) body['generations/' + generation + '/numbers/' + item.sectionId + '/' + item.lineId + '/n' + number] = point;
  }
  assert(Buffer.byteLength(JSON.stringify(body['generations/' + generation + '/parts/' + part])) <= 65536, 'layout-part-byte-limit');
  return body;
}

export async function build(send, id, models) {
  const {sections, items} = encode(models);
  const batches = [];
  for (let i = 0; i < items.length; i += slotsPerPart) batches.push(items.slice(i, i + slotsPerPart));
  let meta = initialMeta(batches.length, Object.keys(sections).length);
  await send('generations/' + id + '/meta', 'PUT', meta);
  for (const [key, s] of Object.entries(sections)) {
    const body = sectionPlan(id, meta, key, s);
    await send('', 'PATCH', body); meta = body['generations/' + id + '/meta'];
  }
  for (const batch of batches) {
    const body = partPlan(id, meta, batch);
    await send('', 'PATCH', body); meta = body['generations/' + id + '/meta'];
  }
  meta = {...meta, phase: 'ready', revision: meta.revision + 1};
  await send('generations/' + id + '/meta', 'PUT', meta);
  return {meta, sections, items};
}

export function decode(sections, items, context) {
  return Object.entries(sections).map(([sectionId, s]) => {
    const source = items.filter(x => x.sectionId === sectionId), {lines, lineIndices, ...header} = s;
    const cells = source.map(c => ({cellId: c.cellId, row: c.row, column: c.column, kind: c.kind,
      ...(c.seatId ? {seatId: c.seatId} : {}), ...(c.consumedNumber === undefined ? {} : {consumedNumber: c.consumedNumber})}));
    const seats = source.filter(c => c.kind === 'seat').map(c => {
      const {id, cellId, row, column, kind, label, consumedNumber, ...seat} = c;
      return seat;
    });
    return {...context, section: {sectionId, ...header, lineSettings: Object.values(lines).sort((a, b) => a.index - b.index), cells}, seats};
  });
}
