// 任命時の初期設定と権限編集で、同じ9項目の表示名を使用する。

import type { TemporaryPermission } from '../domain/authorization/types.ts';

export const temporaryPermissionLabels: Record<TemporaryPermission, string> = {
  exceptionManage: '例外の正式追加・編集・削除', manualReception: '手動受付', arrivalCorrection: '当日の来場状態訂正',
  seatDisplayNameEdit: '当日の座席表示名変更', receptionConflictResolve: '当日の受付競合の確認・解消',
  rereadManagementMemo: '管理用の再読取り理由・メモ', dayManagementRead: '当日の来場状況・管理画面の閲覧',
  staffNoticeManage: 'スタッフ連絡の投稿・訂正・取消し', dayAuditRead: '当日業務の履歴閲覧',
};
