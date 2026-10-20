import type { Id, Scope, Seat, SeatAssignment } from '../seats/types.ts';
import { checkScope, isId, nonnegative, positive, requireValue, text, validateLayout,
  SEAT_LIMITS } from '../seats/validation.ts';
import type { AllocationPerson, AllocationSnapshot, AssignmentCommand, AssignmentEvent,
  AssignmentPlan, AssignmentProjection, AssignmentVersions, AutoAllocationCommand,
  ClearAssignmentCommand, GroupCommand, GroupState, ManualAssignmentCommand,
  ReadCommittedAssignment, SplitGroupCommand, UnplacedUnit } from './types.ts';

const versionKeys = ['commit', 'layout', 'source', 'assignment', 'attendee', 'ticket', 'control', 'reception'] as const;
const copy = <T>(v: T): T => structuredClone(v);
const scopeOf = (s: Scope): Scope => ({ environmentId: s.environmentId, performanceId: s.performanceId });
function versions(v: AssignmentVersions) {
  requireValue(v && Object.keys(v).length === versionKeys.length
    && versionKeys.every(k => nonnegative(v[k])), 'INVALID_ASSIGNMENT_VERSIONS');
}
function sameVersions(a: AssignmentVersions, b: AssignmentVersions) {
  versions(a); versions(b); return versionKeys.every(k => a[k] === b[k]);
}
const members = (s: AllocationSnapshot, id: Id) => s.people.filter(p => p.groupId === id)
  .sort((a, b) => a.rosterOrder - b.rosterOrder);
function state(s: AllocationSnapshot, id: Id): GroupState {
  const found = s.groupStates.find(g => g.groupId === id); requireValue(found, 'MISSING_GROUP_STATE'); return found;
}
function issued(s: AllocationSnapshot, id: Id) {
  const t = s.layout.ticketProtections.find(t => t.attendeeId === id);
  requireValue(t, 'MISSING_TICKET_PROTECTION');
  return t.issued || t.sent || t.hasIssuedHistory || t.activeCredentialId !== null;
}
function person(s: AllocationSnapshot, id: Id) {
  const p = s.people.find(p => p.attendeeId === id); requireValue(p, 'PERSON_NOT_FOUND'); return p;
}
function assigned(s: AllocationSnapshot, id: Id) { return s.layout.assignments.find(a => a.attendeeId === id); }

export function validateAllocation(s: AllocationSnapshot): AllocationSnapshot {
  validateLayout(s.layout); versions(s.versions);
  requireValue(Array.isArray(s.people) && Array.isArray(s.groupStates), 'INVALID_ROSTER');
  const ids = new Set<Id>(), orders = new Set<number>(), groups = new Set<Id>();
  for (const p of s.people) {
    checkScope(p, s.layout);
    requireValue(isId(p.attendeeId) && !ids.has(p.attendeeId) && nonnegative(p.rosterOrder)
      && !orders.has(p.rosterOrder) && (p.groupId === null || isId(p.groupId))
      && ['planned', 'cancelled'].includes(p.attendancePlan) && typeof p.paid === 'boolean', 'INVALID_ROSTER');
    ids.add(p.attendeeId); orders.add(p.rosterOrder); if (p.groupId !== null) groups.add(p.groupId);
    issued(s, p.attendeeId);
  }
  requireValue(s.layout.ticketProtections.length === ids.size
    && s.layout.ticketProtections.every(t => ids.has(t.attendeeId)), 'TICKET_ROSTER_MISMATCH');
  const states = new Set<Id>();
  for (const g of s.groupStates) {
    requireValue(groups.has(g.groupId) && !states.has(g.groupId) && typeof g.fixed === 'boolean'
      && (g.manualReason === null || typeof g.manualReason === 'string'), 'INVALID_GROUP_STATE');
    if (g.manualReason !== null) text(g.manualReason, SEAT_LIMITS.reason, 'INVALID_REASON');
    requireValue(!g.fixed || g.manualReason !== null, 'FIXED_REASON_REQUIRED'); states.add(g.groupId);
  }
  requireValue(states.size === groups.size, 'MISSING_GROUP_STATE');
  for (const a of s.layout.assignments) {
    const p = person(s, a.attendeeId);
    requireValue(p.attendancePlan === 'planned' && (a.groupId ?? null) === p.groupId, 'ASSIGNMENT_ROSTER_MISMATCH');
    requireValue(a.fixed === (p.groupId === null ? false : state(s, p.groupId).fixed), 'FIXED_PROJECTION_MISMATCH');
  }
  requireValue(new Set(s.layout.sections.map(m => m.section.displayOrder)).size === s.layout.sections.length,
    'AMBIGUOUS_SECTION_ORDER');
  return s;
}

export function listAssignmentCandidates(s: AllocationSnapshot, filter: 'paid' | 'all' = 'paid'): Id[] {
  validateAllocation(s); requireValue(filter === 'paid' || filter === 'all', 'INVALID_CANDIDATE_FILTER');
  return s.people.filter(p => p.attendancePlan === 'planned' && !assigned(s, p.attendeeId)
    && (filter === 'all' || p.paid)).sort((a, b) => a.rosterOrder - b.rosterOrder).map(p => p.attendeeId);
}
function begin(s: AllocationSnapshot, c: AssignmentCommand) {
  validateAllocation(s); checkScope(c, s.layout);
  requireValue(isId(c.operationId) && isId(c.actorId) && isId(c.deviceId) && nonnegative(c.requestedAt), 'INVALID_ASSIGNMENT_COMMAND');
  requireValue(sameVersions(c.expectedVersions, s.versions), 'STALE_ASSIGNMENT'); return copy(s);
}
function project(s: AllocationSnapshot, ids: readonly Id[], groupIds: readonly Id[]): AssignmentProjection {
  return { rows: ids.map(attendeeId => ({ attendeeId, assignment: copy(assigned(s, attendeeId) ?? null) })),
    groups: groupIds.map(id => copy(state(s, id))) };
}
function finish(before: AllocationSnapshot, after: AllocationSnapshot, c: AssignmentCommand,
  kind: AssignmentEvent['kind'], ids: readonly Id[], groupIds: readonly Id[] = [],
  extra: Partial<Pick<AssignmentEvent, 'groupId' | 'reason' | 'referenceOperationId' | 'individualOrder' | 'problems'>> = {}): AssignmentPlan {
  for (const k of ['commit', 'assignment', 'reception'] as const) {
    requireValue(positive(after.versions[k] + 1), 'ASSIGNMENT_VERSION_OVERFLOW'); after.versions[k]++;
  }
  validateAllocation(after);
  return { after, event: { ...scopeOf(before.layout), operationId: c.operationId, actorId: c.actorId,
    deviceId: c.deviceId, requestedAt: c.requestedAt, kind, expectedVersions: copy(before.versions),
    resultVersions: copy(after.versions), before: project(before, ids, groupIds), after: project(after, ids, groupIds),
    individualOrder: [], problems: [], ...copy(extra) } };
}
interface LocatedSeat { seat: Seat; sectionOrder: number; lineOrder: number; position: number; sectionId: Id; lineId: Id }
function orderedSeats(s: AllocationSnapshot): LocatedSeat[] {
  return s.layout.sections.flatMap(m => {
    const section = m.section;
    requireValue(m.initialNumbered, 'LAYOUT_NOT_NUMBERED');
    return section.cells.filter(c => c.kind === 'seat').map(c => {
      const seat = m.seats.find(seat => seat.seatId === c.seatId)!;
      return { seat, sectionOrder: section.displayOrder, sectionId: section.sectionId, lineId: seat.lineId,
        lineOrder: section.axis === 'horizontal' ? c.row : c.column,
        position: (section.axis === 'horizontal' ? c.column : c.row) * (section.seatOrder === 'forward' ? 1 : -1) };
    });
  }).sort((a, b) => a.sectionOrder - b.sectionOrder || a.lineOrder - b.lineOrder || a.position - b.position);
}
const available = (occupied: Set<Id>, v: LocatedSeat) => v.seat.category === 'general' && v.seat.usable
  && !occupied.has(v.seat.seatId);
function contiguous(s: AllocationSnapshot, ordered: LocatedSeat[], count: number) {
  const occupied = new Set(s.layout.assignments.map(a => a.seatId));
  for (let i = 0; i <= ordered.length - count; i++) {
    const run = ordered.slice(i, i + count), first = run[0]!;
    if (run.every((v, j) => available(occupied, v) && v.sectionId === first.sectionId && v.lineId === first.lineId
      && (j === 0 || v.position === run[j - 1]!.position + 1))) return run;
  }
  return undefined;
}
function put(s: AllocationSnapshot, p: AllocationPerson, seatId: Id, previous?: SeatAssignment) {
  const revision = (previous?.revision ?? 0) + 1; requireValue(positive(revision), 'ASSIGNMENT_VERSION_OVERFLOW');
  s.layout.assignments = s.layout.assignments.filter(a => a.attendeeId !== p.attendeeId);
  const a: SeatAssignment = { ...scopeOf(s.layout), attendeeId: p.attendeeId, seatId,
    fixed: p.groupId !== null && state(s, p.groupId).fixed, revision };
  if (p.groupId !== null) a.groupId = p.groupId; s.layout.assignments.push(a);
}
function groupProblem(s: AllocationSnapshot, g: GroupState, people: AllocationPerson[]): UnplacedUnit['reason'] | null {
  if (people.length > 10) return 'GROUP_OVER_10';
  if (people.some(p => p.attendancePlan !== 'planned')) return 'GROUP_CANCELLED';
  if (people.some(p => issued(s, p.attendeeId))) return 'GROUP_ISSUED';
  if (g.fixed) return 'GROUP_FIXED';
  if (people.some(p => assigned(s, p.attendeeId))) return 'GROUP_ALREADY_ASSIGNED';
  return null;
}
export function autoAllocate(s: AllocationSnapshot, c: AutoAllocationCommand): AssignmentPlan {
  const after = begin(s, c), seats = orderedSeats(after), problems: UnplacedUnit[] = [], changed: Id[] = [];
  requireValue(c.mode === 'roster' || c.mode === 'random', 'INVALID_ALLOCATION_MODE');
  requireValue(c.mode === 'random' || !Object.hasOwn(c, 'individualOrder'), 'INVALID_RANDOM_ORDER');
  const sorted = after.groupStates.map(g => ({ g, people: members(after, g.groupId) }))
    .sort((a, b) => b.people.length - a.people.length || a.people[0]!.rosterOrder - b.people[0]!.rosterOrder);
  for (const { g, people } of sorted) {
    const problem = groupProblem(after, g, people);
    if (problem) { problems.push({ groupId: g.groupId, reason: problem }); continue; }
    const run = contiguous(after, seats, people.length);
    if (!run) { problems.push({ groupId: g.groupId, reason: 'NO_CONTIGUOUS_GENERAL_SEATS' }); continue; }
    people.forEach((p, i) => { put(after, p, run[i]!.seat.seatId); changed.push(p.attendeeId); });
  }
  const individuals = after.people.filter(p => p.groupId === null && p.attendancePlan === 'planned'
    && !assigned(after, p.attendeeId)).sort((a, b) => a.rosterOrder - b.rosterOrder);
  for (const p of individuals.filter(p => issued(after, p.attendeeId))) problems.push({ attendeeId: p.attendeeId, reason: 'INDIVIDUAL_ISSUED' });
  let individualOrder = individuals.filter(p => !issued(after, p.attendeeId)).map(p => p.attendeeId);
  if (c.mode === 'random') {
    requireValue(Array.isArray(c.individualOrder) && c.individualOrder.length === individualOrder.length
      && new Set(c.individualOrder).size === individualOrder.length && c.individualOrder.every(id => individualOrder.includes(id)), 'INVALID_RANDOM_ORDER');
    individualOrder = [...c.individualOrder];
  }
  const occupied = new Set(after.layout.assignments.map(a => a.seatId));
  for (const id of individualOrder) {
    const seat = seats.find(v => available(occupied, v));
    if (seat) { put(after, person(after, id), seat.seat.seatId); occupied.add(seat.seat.seatId); changed.push(id); }
    else problems.push({ attendeeId: id, reason: 'NO_GENERAL_SEAT' });
  }
  return finish(s, after, c, 'autoAllocate', changed, [], { individualOrder, problems });
}
function editableGroup(s: AllocationSnapshot, id: Id) {
  const group = members(s, id); requireValue(group.length > 0 && group.length <= 10, 'GROUP_SIZE');
  requireValue(group.every(p => p.attendancePlan === 'planned'), 'GROUP_CANCELLED');
  requireValue(!group.some(p => issued(s, p.attendeeId)), 'GROUP_ISSUED'); return group;
}
function manualSeat(s: AllocationSnapshot, id: Id) {
  const seat = orderedSeats(s).find(v => v.seat.seatId === id)?.seat;
  requireValue(seat && seat.usable && !s.layout.assignments.some(a => a.seatId === id), 'MANUAL_SEAT_UNAVAILABLE'); return seat;
}
function fixManualGroup(s: AllocationSnapshot, p: AllocationPerson, reason: string | undefined) {
  if (p.groupId === null) return [p.attendeeId];
  const group = editableGroup(s, p.groupId);
  text(reason, SEAT_LIMITS.reason, 'INVALID_REASON');
  Object.assign(state(s, p.groupId), { fixed: true, manualReason: reason });
  for (const member of group) {
    const a = assigned(s, member.attendeeId);
    if (a && !a.fixed) put(s, member, a.seatId, a);
  }
  return group.map(p => p.attendeeId);
}
export function manualAssign(s: AllocationSnapshot, c: ManualAssignmentCommand): AssignmentPlan {
  const after = begin(s, c), p = person(after, c.attendeeId);
  requireValue(p.attendancePlan === 'planned', 'PERSON_CANCELLED');
  requireValue(!issued(after, p.attendeeId), 'PERSON_ISSUED');
  const ids = fixManualGroup(after, p, c.reason);
  const previous = assigned(after, p.attendeeId);
  after.layout.assignments = after.layout.assignments.filter(a => a.attendeeId !== p.attendeeId);
  manualSeat(after, c.seatId);
  if (c.reason !== undefined) text(c.reason, SEAT_LIMITS.reason, 'INVALID_REASON');
  put(after, p, c.seatId, previous);
  return finish(s, after, c, 'manualAssign', ids, p.groupId === null ? [] : [p.groupId],
    c.reason === undefined ? {} : { reason: c.reason });
}
export function clearAssignment(s: AllocationSnapshot, c: ClearAssignmentCommand): AssignmentPlan {
  const after = begin(s, c), p = person(after, c.attendeeId);
  if (c.reason !== undefined) text(c.reason, SEAT_LIMITS.reason, 'INVALID_REASON');
  requireValue(!issued(after, p.attendeeId), 'PERSON_ISSUED');
  requireValue(assigned(after, p.attendeeId), 'ASSIGNMENT_NOT_FOUND');
  const ids = fixManualGroup(after, p, c.reason);
  after.layout.assignments = after.layout.assignments.filter(a => a.attendeeId !== p.attendeeId);
  return finish(s, after, c, 'clearAssignment', ids, p.groupId === null ? [] : [p.groupId],
    c.reason === undefined ? {} : { reason: c.reason });
}
export function splitGroup(s: AllocationSnapshot, c: SplitGroupCommand): AssignmentPlan {
  const after = begin(s, c), group = editableGroup(after, c.groupId), ids = group.map(p => p.attendeeId);
  text(c.reason, SEAT_LIMITS.reason, 'INVALID_REASON');
  requireValue(Array.isArray(c.seatIds) && c.seatIds.length === group.length && new Set(c.seatIds).size === group.length, 'INVALID_GROUP_SEAT_COUNT');
  after.layout.assignments = after.layout.assignments.filter(a => !ids.includes(a.attendeeId));
  for (const id of c.seatIds) manualSeat(after, id);
  Object.assign(state(after, c.groupId), { fixed: true, manualReason: c.reason });
  group.forEach((p, i) => put(after, p, c.seatIds[i]!, assigned(s, p.attendeeId)));
  return finish(s, after, c, 'splitGroup', ids, [c.groupId], { groupId: c.groupId, reason: c.reason });
}
export function unlockGroup(s: AllocationSnapshot, c: GroupCommand): AssignmentPlan {
  const after = begin(s, c), group = editableGroup(after, c.groupId);
  requireValue(state(after, c.groupId).fixed, 'GROUP_NOT_FIXED'); state(after, c.groupId).fixed = false;
  for (const p of group) { const a = assigned(after, p.attendeeId); if (a) put(after, p, a.seatId, a); }
  return finish(s, after, c, 'unlockGroup', group.map(p => p.attendeeId), [c.groupId], { groupId: c.groupId });
}

function sameAssignment(a: SeatAssignment | null, b: SeatAssignment | null) {
  return a === null || b === null ? a === b : a.environmentId === b.environmentId && a.performanceId === b.performanceId
    && a.attendeeId === b.attendeeId && a.seatId === b.seatId && a.groupId === b.groupId && a.fixed === b.fixed && a.revision === b.revision;
}
function sameGroup(a: GroupState, b: GroupState) {
  return a.groupId === b.groupId && a.fixed === b.fixed && a.manualReason === b.manualReason;
}
function receipt(s: AllocationSnapshot, c: GroupCommand, operationId: Id,
  kind: 'unlockGroup' | 'reallocateGroup', read: ReadCommittedAssignment): AssignmentEvent {
  requireValue(isId(operationId) && operationId !== c.operationId, 'INVALID_HISTORY_REFERENCE');
  const e = read(operationId); requireValue(e && e.kind === kind && e.operationId === operationId
    && e.groupId === c.groupId, 'INVALID_HISTORY_REFERENCE'); checkScope(e, s.layout);
  requireValue(sameVersions(e.resultVersions, s.versions), 'NOT_LAST_GROUP_OPERATION');
  const expected = copy(e.expectedVersions);
  for (const k of ['commit', 'assignment', 'reception'] as const) expected[k]++;
  requireValue(sameVersions(expected, e.resultVersions), 'INVALID_HISTORY_VERSIONS');
  const group = members(s, c.groupId), ids = group.map(p => p.attendeeId);
  for (const projection of kind === 'reallocateGroup' ? [e.before, e.after, e.undoTarget] : [e.before, e.after]) {
    requireValue(projection && Array.isArray(projection.rows) && projection.rows.length === ids.length
      && new Set(projection.rows.map(r => r.attendeeId)).size === ids.length
      && projection.rows.every(r => ids.includes(r.attendeeId))
      && Array.isArray(projection.groups) && projection.groups.length === 1
      && projection.groups[0]!.groupId === c.groupId, 'INVALID_HISTORY_SCOPE');
    const check = copy(s);
    check.layout.assignments = check.layout.assignments.filter(a => !ids.includes(a.attendeeId));
    for (const row of projection.rows) {
      requireValue(row.assignment === null || row.assignment.attendeeId === row.attendeeId, 'INVALID_HISTORY_SCOPE');
      if (row.assignment) check.layout.assignments.push(copy(row.assignment));
    }
    Object.assign(state(check, c.groupId), copy(projection.groups[0])); validateAllocation(check);
  }
  requireValue(e.after.rows.every(r => sameAssignment(r.assignment, assigned(s, r.attendeeId) ?? null))
    && sameGroup(e.after.groups[0]!, state(s, c.groupId)), 'HISTORY_STATE_MISMATCH');
  const origin = kind === 'unlockGroup' ? e.before : e.undoTarget!;
  const unlocked = kind === 'unlockGroup' ? e.after : e.before;
  requireValue(origin.groups[0]!.fixed && !unlocked.groups[0]!.fixed && !e.after.groups[0]!.fixed
    && origin.groups[0]!.manualReason === unlocked.groups[0]!.manualReason
    && origin.groups[0]!.manualReason === e.after.groups[0]!.manualReason, 'INVALID_HISTORY_STATE');
  requireValue(origin.rows.every(r => {
    const next = unlocked.rows.find(n => n.attendeeId === r.attendeeId)!.assignment;
    return r.assignment === null ? next === null : next !== null
      && next.seatId === r.assignment.seatId && next.revision === r.assignment.revision + 1;
  }), 'INVALID_UNLOCK_HISTORY');
  return copy(e);
}
export function reallocateGroup(s: AllocationSnapshot, c: GroupCommand, unlockOperationId: Id,
  read: ReadCommittedAssignment): AssignmentPlan {
  const after = begin(s, c), group = editableGroup(after, c.groupId);
  const e = receipt(s, c, unlockOperationId, 'unlockGroup', read), ids = group.map(p => p.attendeeId);
  after.layout.assignments = after.layout.assignments.filter(a => !ids.includes(a.attendeeId));
  const run = contiguous(after, orderedSeats(after), group.length);
  requireValue(run, 'NO_CONTIGUOUS_GENERAL_SEATS');
  group.forEach((p, i) => put(after, p, run[i]!.seat.seatId, assigned(s, p.attendeeId)));
  const result = finish(s, after, c, 'reallocateGroup', ids, [c.groupId], { groupId: c.groupId, referenceOperationId: e.operationId });
  // 取消しは解除直前の固定・理由も復元する。履歴の真正性は保存層が確認する。
  result.event.undoTarget = copy(e.before); return result;
}
export function undoReallocation(s: AllocationSnapshot, c: GroupCommand, operationId: Id,
  read: ReadCommittedAssignment): AssignmentPlan {
  const after = begin(s, c), group = editableGroup(after, c.groupId);
  const e = receipt(s, c, operationId, 'reallocateGroup', read), ids = group.map(p => p.attendeeId);
  after.layout.assignments = after.layout.assignments.filter(a => !ids.includes(a.attendeeId));
  Object.assign(state(after, c.groupId), copy(e.undoTarget!.groups[0]));
  for (const row of e.undoTarget!.rows) if (row.assignment) {
    manualSeat(after, row.assignment.seatId);
    const current = assigned(s, row.attendeeId);
    put(after, person(after, row.attendeeId), row.assignment.seatId,
      { ...row.assignment, revision: Math.max(current?.revision ?? 0, row.assignment.revision) });
  }
  return finish(s, after, c, 'undoReallocation', ids, [c.groupId], { groupId: c.groupId, referenceOperationId: e.operationId });
}
