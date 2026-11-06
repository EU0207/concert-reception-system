// オンライン復帰時の確認を先行させ、停止・失効時に平文の利用を止める。

import {
  authorizeOffline,
  authorizeOnline,
  validateAuthorization,
} from '../domain/authorization/policy.ts';
import type {
  AuthorizationSnapshot,
  AuthorizedOperation,
  HumanIdentity,
  OfflinePermission,
} from '../domain/authorization/types.ts';
import { requireValue } from '../domain/seats/validation.ts';

export interface AuthorizationPort {
  /** App Checkと認証を確認した要求で、同じ現在版の認可を取得する。 */
  fetchCurrent(): Promise<{
    snapshot: AuthorizationSnapshot;
    serverNow: number;
  }>;
  identity(): { human: HumanIdentity | null; deviceUid: string | null };
  onInvalidate(listener: (reason?: 'authorization' | 'network') => void): () => void;
}

export type AuthorizationState = 'locked' | 'checking' | 'online' | 'offline' | 'stopped';
export type AuthorizationLockReason =
  | 'recheck'
  | 'network'
  | 'authorization'
  | 'manual'
  | 'expired';

export class AuthorizationController {
  private port: AuthorizationPort;
  private onLock: (reason: AuthorizationLockReason) => void;
  private version = 0;
  private snapshot: AuthorizationSnapshot | undefined;
  private permit: OfflinePermission | undefined;
  private serverOffset = 0;
  private stateValue: AuthorizationState = 'locked';
  private unsubscribe: () => void;
  private appVersion: string;
  private disposed = false;
  private offlineBlocked = false;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    port: AuthorizationPort,
    appVersion: string,
    onLock: (reason: AuthorizationLockReason) => void,
  ) {
    this.port = port;
    this.appVersion = appVersion;
    this.onLock = onLock;
    this.unsubscribe = port.onInvalidate((reason) => {
      if (reason !== 'network') this.offlineBlocked = true;
      this.lock(reason === 'network' ? 'network' : 'authorization');
    });
  }

  get state(): AuthorizationState {
    return this.stateValue;
  }

  /** 未受領の記録を回収できなくしないため、平文表示だけを止め、暗号文と鍵は保つ。 */
  lock(reason: AuthorizationLockReason = 'manual'): void {
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    this.version++;
    this.stateValue = 'locked';
    this.snapshot = undefined;
    this.permit = undefined;
    this.onLock(reason);
  }

  /** 通信が戻っただけでは操作を再開せず、現在認可の確認完了を待つ。 */
  async reconnect(): Promise<void> {
    requireValue(!this.disposed, 'AUTHORIZATION_DISPOSED');
    this.lock('recheck');
    this.stateValue = 'checking';
    const version = this.version;
    let responseReceived = false;
    try {
      const { snapshot, serverNow } = await this.port.fetchCurrent();
      responseReceived = true;
      requireValue(version === this.version, 'AUTHORIZATION_CHANGED');
      this.checkIdentity(snapshot);
      validateAuthorization(snapshot, serverNow);
      this.serverOffset = serverNow - Date.now();
      this.snapshot = structuredClone(snapshot);
      this.offlineBlocked = false;
      this.stateValue = 'online';
      this.scheduleExpiry(serverNow);
    } catch (error) {
      // 古い要求の失敗が、後から完了した新しい確認を上書きしないようにする。
      if (version === this.version) {
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        // AuthやApp Checkの拒否を通信断と扱うと、古い許可へ逃げられるため区別する。
        const unavailable =
          code.toLowerCase().includes('network') || code === 'ONLINE_ADAPTER_REQUIRED';
        const rejected = responseReceived || (code !== '' && !unavailable);
        if (rejected) this.offlineBlocked = true;
        this.lock(rejected ? 'authorization' : 'network');
        this.stateValue =
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'DEVICE_UNAVAILABLE'
            ? 'stopped'
            : 'locked';
      }
      throw error;
    }
  }

  /** 停止を通信失敗と誤認して復帰しないよう、オフライン許可の利用は明示的に分ける。 */
  useOffline(snapshot: AuthorizationSnapshot, permit: OfflinePermission, now = Date.now()): void {
    requireValue(!this.disposed && !this.offlineBlocked, 'OFFLINE_RECONFIRMATION_REQUIRED');
    this.lock();
    this.checkIdentity(snapshot);
    authorizeOffline(
      snapshot,
      permit,
      snapshot.role.humanUid,
      'ownResultRead',
      now,
      this.appVersion,
    );
    this.snapshot = structuredClone(snapshot);
    this.permit = structuredClone(permit);
    this.stateValue = 'offline';
    this.scheduleExpiry(now);
  }

  /** 暗号処理へ渡す再検査関数。途中で認可が変わると、古い結果の利用を拒否する。 */
  access(operation: AuthorizedOperation): () => void {
    const version = this.version;
    const assertAuthorized = () => {
      requireValue(version === this.version && this.snapshot, 'AUTHORIZATION_CHANGED');
      try {
        this.checkIdentity(this.snapshot);
        if (this.stateValue === 'online') {
          authorizeOnline(this.snapshot, operation, Date.now() + this.serverOffset);
        } else {
          requireValue(this.stateValue === 'offline' && this.permit, 'AUTHORIZATION_LOCKED');
          authorizeOffline(
            this.snapshot,
            this.permit,
            this.snapshot.role.humanUid,
            operation,
            Date.now(),
            this.appVersion,
          );
        }
      } catch (error) {
        this.lock();
        throw error;
      }
    };
    assertAuthorized();
    return assertAuthorized;
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    this.lock();
  }

  private checkIdentity(snapshot: AuthorizationSnapshot): void {
    const { human, deviceUid } = this.port.identity();
    requireValue(
      human &&
        human.uid === snapshot.role.humanUid &&
        human.emailVerified === true &&
        human.provider === snapshot.session.authProvider &&
        deviceUid === snapshot.deviceAuthUid,
      'CURRENT_IDENTITY_MISMATCH',
    );
  }

  /** 操作がなくても期限到達時に表示をロックする。長い期限は分割して待つ。 */
  private scheduleExpiry(now: number): void {
    const snapshot = this.snapshot!;
    const deadlines = [snapshot.role.endsAt];
    if (this.stateValue === 'online') deadlines.push(snapshot.session.expiresAt);
    else deadlines.push(this.permit!.expiresAt);
    if (snapshot.role.role === 'temporary' || snapshot.role.role === 'receptionist') {
      deadlines.push(snapshot.staffDeadline);
    }
    const remaining = Math.min(...deadlines) - now;
    const wait = Math.min(Math.max(remaining, 0), 2147483647);
    const version = this.version;
    this.expiryTimer = setTimeout(() => {
      if (version !== this.version) return;
      const currentTime = Date.now() + (this.stateValue === 'online' ? this.serverOffset : 0);
      if (currentTime >= Math.min(...deadlines)) {
        const permissionExpired =
          currentTime >= snapshot.role.endsAt ||
          (['temporary', 'receptionist'].includes(snapshot.role.role) &&
            currentTime >= snapshot.staffDeadline) ||
          (this.stateValue === 'offline' && this.permit && currentTime >= this.permit.expiresAt);
        if (permissionExpired) this.offlineBlocked = true;
        this.lock(permissionExpired ? 'expired' : 'recheck');
      } else this.scheduleExpiry(currentTime);
    }, wait);
  }
}
