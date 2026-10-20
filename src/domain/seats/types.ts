export type Id = string;
export interface Scope { environmentId: Id; performanceId: Id }
export type CellKind = 'unset' | 'seat' | 'gap' | 'space' | 'aisle';
export type Axis = 'horizontal' | 'vertical';
export type SeatOrder = 'forward' | 'reverse';
export type StagePosition = 'left' | 'top';
export interface LineSetting extends Scope {
  lineId: Id; index: number; name: string; prefix: string;
  startNumber: number; nextAutomaticNumber: number;
}
export interface LayoutCell extends Scope {
  cellId: Id; row: number; column: number; kind: CellKind;
  seatId?: Id; consumedNumber?: number;
}
export interface EmergencyChange {
  kind: 'add' | 'number' | 'position'; operationId: Id; markedAt: number; reason: string;
}
export interface SeatBase extends Scope {
  seatId: Id; sectionId: Id; lineId: Id; displayOrder: number;
  category: 'general' | 'reserved' | 'special'; usable: boolean;
  reservedLabel?: string; emergencyChange?: EmergencyChange;
}
export type Seat = SeatBase & (
  | { numberingMode: 'automatic'; prefix: string; number: number; manualNumber?: never }
  | { numberingMode: 'manual'; manualNumber: string; prefix?: never; number?: never }
);
export interface LayoutSection extends Scope {
  sectionId: Id; name: string; floorId?: Id; displayOrder: number;
  rows: number; columns: number; axis: Axis; seatOrder: SeatOrder;
  stagePosition: StagePosition; lineSettings: LineSetting[]; cells: LayoutCell[];
}
export interface SectionModel { section: LayoutSection; seats: Seat[]; initialNumbered: boolean }
export interface SeatAssignment extends Scope {
  attendeeId: Id; seatId: Id; groupId?: Id; fixed: boolean; revision: number;
}
// 券の正本は#112。チェック解除だけで発券済み保護を外さないための参照入力。
export interface TicketProtection extends Scope {
  attendeeId: Id; issued: boolean; sent: boolean; hasIssuedHistory: boolean;
  activeCredentialId: string | null;
}
export interface SeatLayout extends Scope {
  sections: SectionModel[]; assignments: SeatAssignment[]; ticketProtections: TicketProtection[];
}
export interface LineInput { name: string; prefix?: string; startNumber?: number }
export interface SectionInput {
  name: string; floorId?: Id; displayOrder?: number; rows: number; columns: number;
  axis: Axis; seatOrder: SeatOrder; stagePosition?: StagePosition; lines: readonly LineInput[];
}
export interface CalculationOptions {
  newId?: () => Id;
  // 保存層が過去に削除したIDを渡す。過去のID台帳をこの計算層で推測しない。
  retiredIds?: readonly Id[];
  duringPerformance?: boolean;
  emergency?: Omit<EmergencyChange, 'kind'>;
}
export type CellSelections = Readonly<Record<Id, CellKind>>;
export interface ExtensionInput {
  dimension: 'rows' | 'columns'; count: number; lines?: readonly LineInput[];
  // 追加後の論理座標だけを指定する。既存セルへの選択を拒否する。
  selections?: Readonly<Record<string, CellKind>>;
}
export interface ReconfigurationInput {
  rows?: number; columns?: number; axis?: Axis; seatOrder?: SeatOrder;
  lines?: readonly LineInput[]; selections?: CellSelections;
}
export interface SeatVersions {
  layoutRevision: number; assignmentRevision: number; ticketRevision: number; controlRevision: number;
}
export interface SlideSeatMapCommand extends Scope {
  operationId: Id; sectionId: Id; direction: 'up' | 'down' | 'left' | 'right';
  amount: 1; expectedVersions: SeatVersions;
}
export interface SeatChangePlan {
  after: SeatLayout;
  impact: {
    changed: boolean; changedSeatIds: Id[]; affectedAttendeeIds: Id[];
    retiredIds: Id[]; confirmationRequired: boolean;
  };
}
export interface SectionOffset { rowOffset: number; columnOffset: number }
export interface BaseLayoutSnapshot { coordinateSpace: 'base'; layout: SeatLayout }
export interface LogicalLayoutSnapshot { coordinateSpace: 'logical'; layout: SeatLayout }
