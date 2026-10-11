// 架空データ用の純粋計算。認可・共有保存・乱数生成は扱わない。
import {isDeepStrictEqual as equal} from 'node:util';

const VERSION_KEYS = ['commit', 'layout', 'source', 'assignment', 'attendee', 'ticket', 'control', 'reception'];
const copy = value => structuredClone(value);
function requireThat(condition, code) {
  if (!condition) throw new Error(code);
}
const id = value => typeof value === 'string' && value.length > 0 && !value.includes('/');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const issued = person => person.everIssued || person.activeCredentialId !== null;
const stateOf = (snapshot, groupId) => snapshot.groupStates[groupId] ?? {fixed: false, manualReason: null};

export function validateSnapshot(snapshot) {
  requireThat(snapshot.schemaVersion === 1 && id(snapshot.environmentId) && id(snapshot.performanceId), 'SCOPE');
  requireThat(snapshot.completeRoster === true, 'INCOMPLETE_ROSTER');
  requireThat(equal(Object.keys(snapshot.versions).sort(), [...VERSION_KEYS].sort()) && VERSION_KEYS.every(k => integer(snapshot.versions[k])), 'VERSIONS');
  const sections = new Map(), people = new Map(), seats = new Map(), positions = new Set(), orders = new Set();
  for (const section of snapshot.sections) {
    requireThat(id(section.sectionId) && !sections.has(section.sectionId) && integer(section.displayOrder), 'SECTION');
    requireThat(['horizontal', 'vertical'].includes(section.axis) && ['forward', 'reverse'].includes(section.seatOrder), 'DIRECTION');
    requireThat(![...sections.values()].some(s => s.displayOrder === section.displayOrder), 'SECTION_ORDER');
    sections.set(section.sectionId, section);
  }
  const linePositions = new Map(), lineOrders = new Map(), crossPositions = new Map();
  for (const seat of snapshot.seats) {
    requireThat(id(seat.seatId) && !seats.has(seat.seatId) && sections.has(seat.sectionId) && id(seat.lineId), 'SEAT');
    requireThat(integer(seat.row) && integer(seat.column) && integer(seat.lineOrder), 'COORDINATE');
    requireThat(['general', 'wheelchair', 'companion', 'unusable', 'reserved'].includes(seat.category) && typeof seat.usable === 'boolean', 'CATEGORY');
    const key = `${seat.sectionId}/${seat.row}/${seat.column}`;
    requireThat(!positions.has(key), 'DUPLICATE_POSITION'); positions.add(key);
    const section = sections.get(seat.sectionId), line = `${seat.sectionId}/${seat.lineId}`;
    const cross = section.axis === 'horizontal' ? seat.row : seat.column;
    requireThat(!linePositions.has(line) || equal(linePositions.get(line), [cross, seat.lineOrder]), 'LINE_GEOMETRY');
    const orderKey = `${seat.sectionId}/${seat.lineOrder}`;
    requireThat(!lineOrders.has(orderKey) || lineOrders.get(orderKey) === seat.lineId, 'LINE_ORDER');
    const crossKey = `${seat.sectionId}/${cross}`;
    requireThat(!crossPositions.has(crossKey) || crossPositions.get(crossKey) === seat.lineId, 'LINE_GEOMETRY');
    crossPositions.set(crossKey, seat.lineId);
    linePositions.set(line, [cross, seat.lineOrder]); lineOrders.set(orderKey, seat.lineId);
    seats.set(seat.seatId, seat);
  }
  for (const person of snapshot.people) {
    requireThat(id(person.attendeeId) && !people.has(person.attendeeId) && integer(person.rosterOrder) && !orders.has(person.rosterOrder), 'ROSTER');
    requireThat(person.groupId === null || id(person.groupId), 'GROUP');
    requireThat(['planned', 'cancelled'].includes(person.attendancePlan) && typeof person.everIssued === 'boolean', 'ATTENDANCE');
    requireThat(person.activeCredentialId === null || id(person.activeCredentialId), 'TICKET');
    people.set(person.attendeeId, person); orders.add(person.rosterOrder);
  }
  requireThat(equal(Object.keys(snapshot.assignments).sort(), [...seats.keys()].sort()), 'ASSIGNMENT_KEYS');
  const occupied = new Set();
  for (const attendeeId of Object.values(snapshot.assignments)) {
    requireThat(attendeeId === '' || (people.has(attendeeId) && people.get(attendeeId).attendancePlan === 'planned' && !occupied.has(attendeeId)), 'ASSIGNMENT');
    if (attendeeId) occupied.add(attendeeId);
  }
  for (const [groupId, state] of Object.entries(snapshot.groupStates)) {
    requireThat(snapshot.people.some(p => p.groupId === groupId) && typeof state.fixed === 'boolean', 'GROUP_STATE');
    requireThat(state.manualReason === null || (typeof state.manualReason === 'string' && state.manualReason.trim().length > 0), 'GROUP_REASON');
    requireThat(!state.fixed || state.manualReason !== null, 'FIXED_REASON');
  }
  return {sections, people, seats};
}

function begin(snapshot, command) {
  validateSnapshot(snapshot);
  requireThat(command.environmentId === snapshot.environmentId && command.performanceId === snapshot.performanceId && id(command.operationId), 'SCOPE');
  requireThat(equal(command.expectedVersions, snapshot.versions), 'STALE');
  return copy(snapshot);
}
function finish(before, after, command, kind, extra = {}) {
  const delta = (old, next) => Object.fromEntries(Object.keys({...old, ...next}).filter(k => !equal(old[k], next[k])).map(k => [k, old[k] ?? null]));
  const previous = {assignments: delta(before.assignments, after.assignments), groupStates: delta(before.groupStates, after.groupStates)};
  const next = {assignments: delta(after.assignments, before.assignments), groupStates: delta(after.groupStates, before.groupStates)};
  for (const key of ['commit', 'assignment', 'reception']) after.versions[key]++;
  validateSnapshot(after);
  return {after, event: {schemaVersion: 1, environmentId: before.environmentId, performanceId: before.performanceId,
    operationId: command.operationId, kind, expectedVersions: copy(before.versions), resultVersions: copy(after.versions), before: previous, after: next, ...copy(extra)}};
}
function orderedSeats(snapshot) {
  const sections = new Map(snapshot.sections.map(s => [s.sectionId, s]));
  const coordinate = seat => {
    const section = sections.get(seat.sectionId);
    return (section.axis === 'horizontal' ? seat.column : seat.row) * (section.seatOrder === 'forward' ? 1 : -1);
  };
  return [...snapshot.seats].sort((a, b) => sections.get(a.sectionId).displayOrder - sections.get(b.sectionId).displayOrder || a.lineOrder - b.lineOrder || coordinate(a) - coordinate(b));
}
const available = (snapshot, seat) => seat.category === 'general' && seat.usable && snapshot.assignments[seat.seatId] === '';
function consecutive(snapshot, ordered, count) {
  for (let i = 0; i <= ordered.length - count; i++) {
    const run = ordered.slice(i, i + count), first = run[0];
    if (run.every((seat, index) => available(snapshot, seat) && seat.sectionId === first.sectionId && seat.lineId === first.lineId &&
      (index === 0 || Math.abs(seat.row - run[index - 1].row) + Math.abs(seat.column - run[index - 1].column) === 1))) return run;
  }
  return null;
}
function members(snapshot, groupId) {
  return snapshot.people.filter(p => p.groupId === groupId).sort((a, b) => a.rosterOrder - b.rosterOrder);
}
function groupProblem(snapshot, groupId, group) {
  if (group.length > 10) return 'GROUP_OVER_10';
  if (group.some(p => p.attendancePlan !== 'planned')) return 'GROUP_CANCELLED';
  if (group.some(issued)) return 'GROUP_ISSUED';
  if (stateOf(snapshot, groupId).fixed) return 'GROUP_FIXED';
  return null;
}

export function allocate(snapshot, command) {
  const after = begin(snapshot, command), ordered = orderedSeats(after), groups = new Map(), skipped = [], unplaced = [];
  const roster = [...snapshot.people].sort((a, b) => a.rosterOrder - b.rosterOrder);
  for (const person of roster) if (person.groupId !== null) {
    if (!groups.has(person.groupId)) groups.set(person.groupId, []);
    groups.get(person.groupId).push(person);
  }
  const existing = new Set(Object.values(after.assignments).filter(Boolean));
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length || a[1][0].rosterOrder - b[1][0].rosterOrder);
  for (const [groupId, group] of sorted) {
    const problem = groupProblem(after, groupId, group);
    if (problem) { skipped.push({groupId, reason: problem}); continue; }
    if (group.some(p => existing.has(p.attendeeId))) { skipped.push({groupId, reason: 'GROUP_ALREADY_ASSIGNED'}); continue; }
    const run = consecutive(after, ordered, group.length);
    if (!run) { unplaced.push({groupId, reason: 'NO_CONTIGUOUS_GENERAL_SEATS'}); continue; }
    run.forEach((seat, i) => { after.assignments[seat.seatId] = group[i].attendeeId; });
  }
  const individuals = roster.filter(p => p.groupId === null && p.attendancePlan === 'planned' && !issued(p) && !existing.has(p.attendeeId));
  let individualOrder = individuals.map(p => p.attendeeId);
  requireThat(['roster', 'random'].includes(command.mode), 'MODE');
  if (command.mode === 'random') {
    requireThat(Array.isArray(command.individualOrder) && equal([...command.individualOrder].sort(), [...individualOrder].sort()), 'RANDOM_ORDER');
    individualOrder = [...command.individualOrder];
  }
  for (const attendeeId of individualOrder) {
    const seat = ordered.find(seat => available(after, seat));
    if (seat) after.assignments[seat.seatId] = attendeeId;
    else unplaced.push({attendeeId, reason: 'NO_GENERAL_SEAT'});
  }
  return finish(snapshot, after, command, 'autoAllocate', {individualOrder, skipped, unplaced});
}

function editableGroup(snapshot, command) {
  const group = members(snapshot, command.groupId);
  requireThat(group.length > 0 && group.length <= 10, 'GROUP_SIZE');
  requireThat(group.every(p => p.attendancePlan === 'planned'), 'GROUP_CANCELLED');
  requireThat(!group.some(issued), 'GROUP_ISSUED');
  return group;
}
function clearGroup(snapshot, group) {
  const ids = new Set(group.map(p => p.attendeeId));
  for (const seatId of Object.keys(snapshot.assignments)) if (ids.has(snapshot.assignments[seatId])) snapshot.assignments[seatId] = '';
}

export function splitGroup(snapshot, command) {
  const after = begin(snapshot, command), group = editableGroup(after, command);
  requireThat(typeof command.reason === 'string' && command.reason.trim().length > 0, 'REASON');
  requireThat(Array.isArray(command.seatIds) && command.seatIds.length === group.length && new Set(command.seatIds).size === group.length, 'SEAT_COUNT');
  clearGroup(after, group);
  for (const [i, seatId] of command.seatIds.entries()) {
    const seat = after.seats.find(s => s.seatId === seatId);
    requireThat(seat && seat.usable && seat.category !== 'unusable' && after.assignments[seatId] === '', 'MANUAL_SEAT');
    after.assignments[seatId] = group[i].attendeeId;
  }
  after.groupStates[command.groupId] = {fixed: true, manualReason: command.reason};
  return finish(snapshot, after, command, 'splitGroup', {groupId: command.groupId, reason: command.reason});
}

export function unlockGroup(snapshot, command) {
  const after = begin(snapshot, command); editableGroup(after, command);
  requireThat(stateOf(after, command.groupId).fixed, 'NOT_FIXED');
  after.groupStates[command.groupId].fixed = false;
  return finish(snapshot, after, command, 'unlockGroup', {groupId: command.groupId});
}

export function reallocateGroup(snapshot, command, unlockEvent) {
  const after = begin(snapshot, command), group = editableGroup(after, command);
  requireThat(unlockEvent?.kind === 'unlockGroup' && unlockEvent.groupId === command.groupId &&
    unlockEvent.environmentId === snapshot.environmentId && unlockEvent.performanceId === snapshot.performanceId &&
    equal(unlockEvent.resultVersions, snapshot.versions) && equal(unlockEvent.after.groupStates[command.groupId], stateOf(snapshot, command.groupId)) &&
    unlockEvent.before.groupStates[command.groupId]?.fixed === true && !stateOf(snapshot, command.groupId).fixed &&
    unlockEvent.before.groupStates[command.groupId].manualReason === stateOf(snapshot, command.groupId).manualReason &&
    Object.keys(unlockEvent.before.assignments).length === 0 && Object.keys(unlockEvent.after.assignments).length === 0, 'UNLOCK_RECEIPT');
  clearGroup(after, group);
  const run = consecutive(after, orderedSeats(after), group.length);
  requireThat(run !== null, 'NO_CONTIGUOUS_GENERAL_SEATS');
  run.forEach((seat, i) => { after.assignments[seat.seatId] = group[i].attendeeId; });
  const result = finish(snapshot, after, command, 'reallocateGroup', {groupId: command.groupId, unlockOperationId: unlockEvent.operationId});
  result.event.before.groupStates[command.groupId] = copy(unlockEvent.before.groupStates[command.groupId]);
  result.event.after.groupStates[command.groupId] = copy(stateOf(after, command.groupId));
  return result;
}

export function undoReallocation(snapshot, command, event) {
  const after = begin(snapshot, command), group = editableGroup(after, command);
  requireThat(event?.kind === 'reallocateGroup' && event.groupId === command.groupId && event.environmentId === snapshot.environmentId &&
    event.performanceId === snapshot.performanceId && equal(event.resultVersions, snapshot.versions), 'NOT_LAST_REALLOCATION');
  const attendeeIds = new Set(group.map(p => p.attendeeId));
  requireThat(equal(Object.keys(event.before.assignments).sort(), Object.keys(event.after.assignments).sort()) &&
    Object.keys(event.before.assignments).every(seatId => Object.hasOwn(after.assignments, seatId)) &&
    [event.before, event.after].every(delta => Object.values(delta.assignments).every(value => value === '' || attendeeIds.has(value)) &&
      equal(Object.keys(delta.groupStates), [command.groupId])) && event.before.groupStates[command.groupId]?.fixed === true, 'UNDO_SCOPE');
  for (const [seatId, value] of Object.entries(event.after.assignments)) requireThat(after.assignments[seatId] === value, 'UNDO_STATE');
  for (const [groupId, value] of Object.entries(event.after.groupStates)) requireThat(equal(stateOf(after, groupId), value), 'UNDO_STATE');
  Object.assign(after.assignments, event.before.assignments);
  Object.assign(after.groupStates, event.before.groupStates);
  return finish(snapshot, after, command, 'undoReallocation', {groupId: command.groupId, undoOperationId: event.operationId});
}
