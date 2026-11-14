// 席構成の下書き・初回確定・再確定に対する理由入力の要否を判定する。

import type { SeatEditReasonContext } from './types.ts';
import { requireValue, SEAT_LIMITS, text } from './validation.ts';

/** 保存経路と信頼できる現在状態から、確定時に理由が必要か判定する。 */
export function requiresSeatEditReason(context: SeatEditReasonContext): boolean {
  requireValue(context && (context.phase === 'draft' || context.phase === 'commit') &&
    ['layoutChange', 'slide'].includes(context.operation), 'INVALID_REASON_CONTEXT');
  if (context.phase === 'draft') return false;

  requireValue([context.hasConfirmedLayout, context.isPerformanceDay, context.receptionStarted]
    .every((value) => typeof value === 'boolean'), 'INVALID_REASON_CONTEXT');
  if (context.operation === 'slide') return false;
  return context.hasConfirmedLayout || context.isPerformanceDay || context.receptionStarted;
}

/** 理由不要の編集では省略を許し、既存の呼出元は明示した段階がなければ理由必須を保つ。 */
export function validateSeatEditReason(reason: string | undefined, context?: SeatEditReasonContext): void {
  const required = context === undefined || requiresSeatEditReason(context);
  if (!required && (reason === undefined || reason === '')) return;
  text(reason, SEAT_LIMITS.reason, 'INVALID_REASON');
}
