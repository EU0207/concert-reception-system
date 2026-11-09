// 公演管理版を照合し、本番受付の状態変更と一緒に保存する監査情報を組み立てる。

import type { Scope } from '../seats/types.ts';
import { checkScope, positive, requireValue } from '../seats/validation.ts';
import { authorizeOnline } from './policy.ts';
import type { AuthorizationSnapshot, PerformanceState } from './types.ts';

interface ReceptionControl extends Scope {
  controlRevision: number;
  state: PerformanceState;
  firstReceptionStartedAt: number | null;
}

interface ReceptionControlRequest extends Scope {
  expectedControlRevision: number;
  action: 'start' | 'stop';
}

interface ReceptionControlContext {
  authorization: AuthorizationSnapshot;
  serverTime: number;
  /** 保存側が最新版でBD-08-04の確認を終えた場合だけ設定する。要求本文から受け取らない。 */
  preparationConfirmed: boolean;
}

/** 現在認可と公演管理版を検査し、受付の開始・停止に必要な次の値を返す。 */
export function planReceptionControl(
  current: ReceptionControl,
  request: ReceptionControlRequest,
  context: ReceptionControlContext,
) {
  const { authorization, serverTime, preparationConfirmed } = context;
  checkScope(request, current);
  checkScope(authorization, current);
  authorizeOnline(authorization, 'controlReception', serverTime);

  requireValue(
    positive(current.controlRevision) &&
      positive(current.controlRevision + 1) &&
      request.expectedControlRevision === current.controlRevision &&
      authorization.state === current.state,
    'STALE_PERFORMANCE_CONTROL',
  );

  const firstStart = current.firstReceptionStartedAt;
  requireValue(
    current.state === 'preparing'
      ? firstStart === null
      : positive(firstStart) && firstStart <= serverTime,
    'INVALID_FIRST_RECEPTION_START',
  );

  let state: 'operating' | 'stopped';

  if (request.action === 'start') {
    requireValue(
      current.state === 'preparing' || current.state === 'stopped',
      'RECEPTION_CANNOT_START',
    );
    requireValue(preparationConfirmed === true, 'RECEPTION_PREPARATION_REQUIRED');
    requireValue(serverTime < authorization.staffDeadline, 'STAFF_DEADLINE_EXPIRED');
    state = 'operating';
  } else {
    requireValue(request.action === 'stop' && current.state === 'operating', 'RECEPTION_CANNOT_STOP');
    state = 'stopped';
  }

  const next = {
    ...current,
    controlRevision: current.controlRevision + 1,
    state,
    firstReceptionStartedAt: firstStart ?? serverTime,
  };

  return {
    next,
    audit: {
      environmentId: current.environmentId,
      performanceId: current.performanceId,
      humanUid: authorization.role.humanUid,
      deviceUid: authorization.deviceAuthUid,
      occurredAt: serverTime,
      previousState: current.state,
      state,
      controlRevision: next.controlRevision,
    },
  };
}
