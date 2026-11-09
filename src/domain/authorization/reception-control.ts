// 公演管理版を照合し、本番受付の状態変更と一緒に保存する監査情報を組み立てる。

import type { Scope } from '../seats/types.ts';
import { checkScope, nonnegative, positive, requireValue } from '../seats/validation.ts';
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

interface ConfirmedDataVersion {
  commitRevision: number;
  layoutRevision: number;
  viewRevision: number;
}

interface ReceptionPreparation extends Scope {
  controlRevision: number;
  dataVersion: ConfirmedDataVersion;
  confirmedAt: number;
}

interface ReceptionControlContext {
  authorization: AuthorizationSnapshot;
  serverTime: number;
  /** 保存側が取得した確定版とBD-08-04の確認記録。要求本文から受け取らない。 */
  currentDataVersion: ConfirmedDataVersion | null;
  preparation: ReceptionPreparation | null;
}

/** 確定業務・構成・表示版が準備確認時点から変わっていないかを検査する。 */
function requireCurrentPreparation(current: ReceptionControl, context: ReceptionControlContext) {
  const { preparation, currentDataVersion, serverTime } = context;
  requireValue(preparation?.dataVersion && currentDataVersion, 'RECEPTION_PREPARATION_REQUIRED');
  checkScope(preparation, current);

  const revisions = ['commitRevision', 'layoutRevision', 'viewRevision'] as const;
  requireValue(
    preparation.controlRevision === current.controlRevision &&
      positive(preparation.confirmedAt) &&
      preparation.confirmedAt <= serverTime &&
      positive(currentDataVersion.layoutRevision) &&
      revisions.every(
        (key) => nonnegative(currentDataVersion[key]) &&
          preparation.dataVersion[key] === currentDataVersion[key],
      ),
    'STALE_RECEPTION_PREPARATION',
  );
}

/** 現在認可と公演管理版を検査し、受付の開始・停止に必要な次の値を返す。 */
export function planReceptionControl(
  current: ReceptionControl,
  request: ReceptionControlRequest,
  context: ReceptionControlContext,
) {
  const { authorization, serverTime } = context;
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
    requireCurrentPreparation(current, context);
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
