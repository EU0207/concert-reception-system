// 席設定の入力・操作と履歴のデータ契約。グループ所属は名簿の内部IDを使用する。

import type { Id, Scope, SeatAssignment, SeatLayout } from '../seats/types.ts';

// 同じ取得版の全名簿を渡す。#230・104で取込ラベルを内部UUIDへ解決し、

// # 型定義と操作名

// 追加ファイルも既存所属へ含める。購入者ID・氏名からgroupIdを推測しない。
export interface AllocationPerson extends Scope {
  attendeeId: Id;
  groupId: Id | null;
  rosterOrder: number;
  attendancePlan: 'planned' | 'cancelled';
  paid: boolean;
}

/** グループの固定状態と、手動変更の理由。 */
export interface GroupState {
  groupId: Id;
  fixed: boolean;
  manualReason: string | null;
}

/** 古い状態からの更新を防ぐため、席設定が参照する各データの版。 */
export interface AssignmentVersions {
  commit: number;
  layout: number;
  source: number;
  assignment: number;
  attendee: number;
  ticket: number;
  control: number;
  reception: number;
}

/** 同じ取得版でそろえた会場・全名簿とグループ状態。 */
export interface AllocationSnapshot {
  layout: SeatLayout;
  people: AllocationPerson[];
  groupStates: GroupState[];
  versions: AssignmentVersions;
}

/** 席設定操作の識別情報と、操作開始時に参照したデータ版。 */
export interface AssignmentCommand extends Scope {
  operationId: Id;
  actorId: Id;
  deviceId: Id;
  requestedAt: number;
  expectedVersions: AssignmentVersions;
}

/** 名簿順または指定の抽選順で行う自動配置。乱数の生成は呼出元が担当する。 */
export type AutoAllocationCommand = AssignmentCommand &
  (
    | { mode: 'roster'; individualOrder?: never }
    | { mode: 'random'; individualOrder: readonly Id[] }
  );

/** グループ単位の操作に共通する入力。 */
export interface GroupCommand extends AssignmentCommand {
  groupId: Id;
}

/** グループ所属を維持した席の個別指定に必要な入力。 */
export interface SplitGroupCommand extends GroupCommand {
  seatIds: readonly Id[];
  reason: string;
}

/** 来場者へ席を手動指定する入力。 */
export interface ManualAssignmentCommand extends AssignmentCommand {
  attendeeId: Id;
  seatId: Id;
  reason?: string;
}

/** 来場者の席割当を解除する入力。 */
export interface ClearAssignmentCommand extends AssignmentCommand {
  attendeeId: Id;
  reason?: string;
}

/** 自動配置で割り当てられなかった理由。 */
export type AllocationProblem =
  | 'GROUP_OVER_10'
  | 'GROUP_CANCELLED'
  | 'GROUP_ISSUED'
  | 'GROUP_FIXED'
  | 'GROUP_ALREADY_ASSIGNED'
  | 'NO_CONTIGUOUS_GENERAL_SEATS'
  | 'NO_GENERAL_SEAT'
  | 'INDIVIDUAL_ISSUED';

/** 配置できなかったグループまたは個人と、その理由。 */
export interface UnplacedUnit {
  groupId?: Id;
  attendeeId?: Id;
  reason: AllocationProblem;
}

/** 操作の影響を受ける割当とグループ状態を抜き出したデータ。 */
export interface AssignmentProjection {
  rows: { attendeeId: Id; assignment: SeatAssignment | null }[];
  groups: GroupState[];
}

/** 保存層で確定する履歴の案。操作情報・参照版と変更前後を保持する。 */
export interface AssignmentEvent extends Scope {
  operationId: Id;
  actorId: Id;
  deviceId: Id;
  requestedAt: number;
  kind:
    | 'autoAllocate'
    | 'manualAssign'
    | 'clearAssignment'
    | 'splitGroup'
    | 'unlockGroup'
    | 'reallocateGroup'
    | 'undoReallocation';
  expectedVersions: AssignmentVersions;
  resultVersions: AssignmentVersions;
  before: AssignmentProjection;
  after: AssignmentProjection;
  // 操作直前のbeforeとは別に、固定解除前へ戻すための確定履歴を保持する。
  undoTarget?: AssignmentProjection;
  groupId?: Id;
  reason?: string;
  referenceOperationId?: Id;
  individualOrder: Id[];
  problems: UnplacedUnit[];
}

/** 保存前の席設定変更案と、それに対応する履歴案。 */
export interface AssignmentPlan {
  after: AllocationSnapshot;
  event: AssignmentEvent;
}

// #104が確定済み履歴を取得して実装する。端末の未確定プランを履歴として渡さない。
export type ReadCommittedAssignment = (operationId: Id) => AssignmentEvent | undefined;
