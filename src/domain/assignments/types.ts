import type { Id, Scope, SeatAssignment, SeatLayout } from '../seats/types.ts';

// 同じ取得版の全名簿を渡す。購入者ID・氏名からgroupIdを推測しない。
export interface AllocationPerson extends Scope {
  attendeeId: Id; groupId: Id | null; rosterOrder: number;
  attendancePlan: 'planned' | 'cancelled'; paid: boolean;
}
export interface GroupState { groupId: Id; fixed: boolean; manualReason: string | null }
export interface AssignmentVersions {
  commit: number; layout: number; source: number; assignment: number;
  attendee: number; ticket: number; control: number; reception: number;
}
export interface AllocationSnapshot {
  layout: SeatLayout; people: AllocationPerson[]; groupStates: GroupState[];
  versions: AssignmentVersions;
}
export interface AssignmentCommand extends Scope {
  operationId: Id; actorId: Id; deviceId: Id; requestedAt: number;
  expectedVersions: AssignmentVersions;
}
export type AutoAllocationCommand = AssignmentCommand & (
  | { mode: 'roster'; individualOrder?: never }
  | { mode: 'random'; individualOrder: readonly Id[] }
);
export interface GroupCommand extends AssignmentCommand { groupId: Id }
export interface SplitGroupCommand extends GroupCommand { seatIds: readonly Id[]; reason: string }
export interface ManualAssignmentCommand extends AssignmentCommand {
  attendeeId: Id; seatId: Id; reason?: string;
}
export interface ClearAssignmentCommand extends AssignmentCommand { attendeeId: Id; reason?: string }
export type AllocationProblem = 'GROUP_OVER_10' | 'GROUP_CANCELLED' | 'GROUP_ISSUED'
  | 'GROUP_FIXED' | 'GROUP_ALREADY_ASSIGNED' | 'NO_CONTIGUOUS_GENERAL_SEATS'
  | 'NO_GENERAL_SEAT' | 'INDIVIDUAL_ISSUED';
export interface UnplacedUnit { groupId?: Id; attendeeId?: Id; reason: AllocationProblem }
export interface AssignmentProjection {
  rows: { attendeeId: Id; assignment: SeatAssignment | null }[];
  groups: GroupState[];
}
export interface AssignmentEvent extends Scope {
  operationId: Id; actorId: Id; deviceId: Id; requestedAt: number;
  kind: 'autoAllocate' | 'manualAssign' | 'clearAssignment' | 'splitGroup'
    | 'unlockGroup' | 'reallocateGroup' | 'undoReallocation';
  expectedVersions: AssignmentVersions; resultVersions: AssignmentVersions;
  before: AssignmentProjection; after: AssignmentProjection;
  groupId?: Id; reason?: string; referenceOperationId?: Id;
  individualOrder: Id[]; problems: UnplacedUnit[];
}
export interface AssignmentPlan { after: AllocationSnapshot; event: AssignmentEvent }
// #104が確定済み履歴を取得して実装する。端末の未確定プランを履歴として渡さない。
export type ReadCommittedAssignment = (operationId: Id) => AssignmentEvent | undefined;
