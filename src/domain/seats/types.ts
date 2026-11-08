// 会場構成のデータ契約。画面や保存方式に依存せず、計算の入力と出力を定義する。

// # 型定義と操作名

export type Id = string;

/** データが属する環境と公演を識別する。 */
export interface Scope {
  environmentId: Id;
  performanceId: Id;
}

/** 未設定・席・欠番・空白・通路のセル種別。 */
export type CellKind = 'unset' | 'seat' | 'gap' | 'space' | 'aisle';
export type Axis = 'horizontal' | 'vertical';
export type SeatOrder = 'forward' | 'reverse';
export type StagePosition = 'left' | 'top';

/** 採番方向に沿った列の名前・接頭辞と番号の進み方。 */
export interface LineSetting extends Scope {
  lineId: Id;
  index: number;
  name: string;
  prefix: string;
  startNumber: number;
  nextAutomaticNumber: number;
}

/** 区画内の1マス。席の場合は席ID、欠番の場合は消費した番号を持つ。 */
export interface LayoutCell extends Scope {
  cellId: Id;
  row: number;
  column: number;
  kind: CellKind;
  seatId?: Id;
  consumedNumber?: number;
}

/** 当日の緊急変更に必要な操作情報と理由。 */
export interface EmergencyChange {
  kind: 'add' | 'number' | 'position';
  operationId: Id;
  markedAt: number;
  reason: string;
}

/** 席ID・所属と利用区分など、自動採番と手入力に共通する情報。 */
export interface SeatBase extends Scope {
  seatId: Id;
  sectionId: Id;
  lineId: Id;
  displayOrder: number;
  category: 'general' | 'reserved' | 'special';
  usable: boolean;
  reservedLabel?: string;
  emergencyChange?: EmergencyChange;
}

/** 自動採番と手入力の項目が混在しないように表した席情報。 */
export type Seat = SeatBase &
  (
    | { numberingMode: 'automatic'; prefix: string; number: number; manualNumber?: never }
    | { numberingMode: 'manual'; manualNumber: string; prefix?: never; number?: never }
  );

/** 区画の寸法・採番方向とセル配置をまとめた情報。 */
export interface LayoutSection extends Scope {
  sectionId: Id;
  name: string;
  floorId?: Id;
  displayOrder: number;
  rows: number;
  columns: number;
  axis: Axis;
  seatOrder: SeatOrder;
  stagePosition: StagePosition;
  lineSettings: LineSetting[];
  cells: LayoutCell[];
}

/** 区画構成と席の一覧に、初回採番の完了状態を組み合わせる。 */
export interface SectionModel {
  section: LayoutSection;
  seats: Seat[];
  initialNumbered: boolean;
}

/** 来場者と席の対応。固定状態と変更の改訂番号を持つ。 */
export interface SeatAssignment extends Scope {
  attendeeId: Id;
  seatId: Id;
  groupId?: Id;
  fixed: boolean;
  revision: number;
}
// 券の正本は#112。チェック解除だけで発券済み保護を外さないための参照入力。
export interface TicketProtection extends Scope {
  attendeeId: Id;
  issued: boolean;
  sent: boolean;
  hasIssuedHistory: boolean;
  activeCredentialId: string | null;
}

/** 席計算に必要な会場構成・割当と券の保護情報。 */
export interface SeatLayout extends Scope {
  sections: SectionModel[];
  assignments: SeatAssignment[];
  ticketProtections: TicketProtection[];
}

/** 列設定の入力値。省略可能な番号設定は計算時に補う。 */
export interface LineInput {
  name: string;
  prefix?: string;
  startNumber?: number;
}

/** 新しい区画の作成に必要な入力値。 */
export interface SectionInput {
  name: string;
  floorId?: Id;
  displayOrder?: number;
  rows: number;
  columns: number;
  axis: Axis;
  seatOrder: SeatOrder;
  stagePosition?: StagePosition;
  lines: readonly LineInput[];
}

/** ID発行や当日の緊急変更情報を、計算処理へ渡すための設定。 */
export interface CalculationOptions {
  newId?: () => Id;
  // 保存層が過去に削除したIDを渡す。過去のID台帳をこの計算層で推測しない。
  retiredIds?: readonly Id[];
  duringPerformance?: boolean;
  emergency?: Omit<EmergencyChange, 'kind'>;
}

/** セルIDごとに指定する変更後のセル種別。 */
export type CellSelections = Readonly<Record<Id, CellKind>>;

/** 行または列を追加する方向・数と追加部分の設定。 */
export interface ExtensionInput {
  dimension: 'rows' | 'columns';
  count: number;
  lines?: readonly LineInput[];
  // 追加後の論理座標だけを指定する。既存セルへの選択を拒否する。
  selections?: Readonly<Record<string, CellKind>>;
}

/** 既存区画を再構成するときの変更項目。 */
export interface ReconfigurationInput {
  rows?: number;
  columns?: number;
  axis?: Axis;
  seatOrder?: SeatOrder;
  lines?: readonly LineInput[];
  selections?: CellSelections;
}

/** 席構成の保存時に照合するデータ版。 */
export interface SeatVersions {
  layoutRevision: number;
  assignmentRevision: number;
  ticketRevision: number;
  controlRevision: number;
}

/** 参照版を指定し、区画を1マス平行移動する操作。 */
export interface SlideSeatMapCommand extends Scope {
  operationId: Id;
  sectionId: Id;
  direction: 'up' | 'down' | 'left' | 'right';
  amount: 1;
  expectedVersions: SeatVersions;
}

/** 保存前の変更案と、確認が必要な席・来場者への影響。 */
export interface SeatChangePlan {
  after: SeatLayout;
  impact: {
    changed: boolean;
    changedSeatIds: Id[];
    affectedAttendeeIds: Id[];
    retiredIds: Id[];
    confirmationRequired: boolean;
  };
}

/** 基準座標から移動した行数と列数。 */
export interface SectionOffset {
  rowOffset: number;
  columnOffset: number;
}

/** 保存層から取得した、移動量をまだ適用していない基準構成。 */
export interface BaseLayoutSnapshot {
  coordinateSpace: 'base';
  layout: SeatLayout;
}

/** 移動量を適用済みの、計算と表示に使う構成。 */
export interface LogicalLayoutSnapshot {
  coordinateSpace: 'logical';
  layout: SeatLayout;
}
