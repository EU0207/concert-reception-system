// 席構成の公開窓口。呼出元はこのファイルから型と計算処理を利用する。

export type * from './types.ts';
export { SEAT_LIMITS, SeatDomainError, validateLayout, displayNumber } from './validation.ts';
export {
  createLayout,
  createSection,
  numberInitial,
  reconfigureSection,
  extendSection,
  renameSection,
  changeStage,
  addManualSeat,
  editUnassignedSeat,
  slideSection,
  assessSeatChanges,
} from './layout.ts';
export { formatSeatDisplayName } from './display-name.ts';
export { projectBaseLayout } from './coordinates.ts';
