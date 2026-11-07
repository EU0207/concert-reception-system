// 席設定の公開窓口。保存や画面の処理はここに含めない。

// # 公開する型と関数

export type * from './types.ts';

export {
  validateAllocation,
  listAssignmentCandidates,
  autoAllocate,
  manualAssign,
  clearAssignment,
  splitGroup,
  unlockGroup,
  reallocateGroup,
  undoReallocation,
} from './allocation.ts';
