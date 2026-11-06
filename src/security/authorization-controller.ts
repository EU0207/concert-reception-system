// オンライン復帰時の確認を先行させ、停止・失効時に平文の利用を止める。

import {
  authorizeOffline,
  authorizeOnline,
  validateAuthorization,
} from "../domain/authorization/policy.ts";
import type {
  AuthorizationSnapshot,
  AuthorizedOperation,
  HumanIdentity,
  OfflinePermission,
} from "../domain/authorization/types.ts";
import { requireValue } from "../domain/seats/validation.ts";

export interface AuthorizationPort {
  /** App Checkと認証を確認した要求で、同じ現在版の認可を取得する。 */
  fetchCurrent(): Promise<{
    snapshot: AuthorizationSnapshot;
    serverNow: number;
  }>;
  identity(): { human: HumanIdentity | null; deviceUid: string | null };
  onInvalidate(listener: () => void): () => void;
}

export type AuthorizationState =
  | "locked"
  | "checking"
  | "online"
  | "offline"
  | "stopped";

export class AuthorizationController {
  private port: AuthorizationPort;
  private onLock: () => void;
  private version = 0;
  private snapshot: AuthorizationSnapshot | undefined;
  private permit: OfflinePermission | undefined;
  private serverOffset = 0;
  private stateValue: AuthorizationState = "locked";
  private unsubscribe: () => void;
  private appVersion: string;
  private disposed = false;
  private offlineBlocked = false;

  constructor(port: AuthorizationPort, appVersion: string, onLock: () => void) {
    this.port = port;
    this.appVersion = appVersion;
    this.onLock = onLock;
    this.unsubscribe = port.onInvalidate(() => {
      this.offlineBlocked = true;
      this.lock();
    });
  }

  get state(): AuthorizationState {
    return this.stateValue;
  }

  /** 復号済みの表示を片付ける。端末の暗号文とCryptoKeyは削除しない。 */
  lock(): void {
    this.version++;
    this.stateValue = "locked";
    this.snapshot = undefined;
    this.permit = undefined;
    this.onLock();
  }

  /** 通信が戻っただけでは操作を再開せず、現在認可の確認完了を待つ。 */
  async reconnect(): Promise<void> {
    requireValue(!this.disposed, "AUTHORIZATION_DISPOSED");
    this.lock();
    this.stateValue = "checking";
    const version = this.version;
    let responseReceived = false;
    try {
      const { snapshot, serverNow } = await this.port.fetchCurrent();
      responseReceived = true;
      requireValue(version === this.version, "AUTHORIZATION_CHANGED");
      this.checkIdentity(snapshot);
      validateAuthorization(snapshot, serverNow);
      this.serverOffset = serverNow - Date.now();
      this.snapshot = structuredClone(snapshot);
      this.offlineBlocked = false;
      this.stateValue = "online";
    } catch (error) {
      // 古い要求の失敗が、後から完了した新しい確認を上書きしないようにする。
      if (version === this.version) {
        if (
          responseReceived ||
          (error &&
            typeof error === "object" &&
            "code" in error &&
            (String(error.code).toLowerCase().includes("permission") ||
              error.code === "DEVICE_UNAVAILABLE"))
        )
          this.offlineBlocked = true;
        this.lock();
        this.stateValue =
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "DEVICE_UNAVAILABLE"
            ? "stopped"
            : "locked";
      }
      throw error;
    }
  }

  /** 復元済みの本人と検証済み準備結果を使う。通信復帰の失敗から自動では呼ばない。 */
  useOffline(
    snapshot: AuthorizationSnapshot,
    permit: OfflinePermission,
    now = Date.now(),
  ): void {
    requireValue(
      !this.disposed && !this.offlineBlocked,
      "OFFLINE_RECONFIRMATION_REQUIRED",
    );
    this.lock();
    this.checkIdentity(snapshot);
    authorizeOffline(
      snapshot,
      permit,
      snapshot.role.humanUid,
      "ownResultRead",
      now,
      this.appVersion,
    );
    this.snapshot = structuredClone(snapshot);
    this.permit = structuredClone(permit);
    this.stateValue = "offline";
  }

  /** 暗号処理へ渡す再検査関数。途中で認可が変わると、古い結果の利用を拒否する。 */
  access(operation: AuthorizedOperation): () => void {
    const version = this.version;
    const assertAuthorized = () => {
      requireValue(
        version === this.version && this.snapshot,
        "AUTHORIZATION_CHANGED",
      );
      try {
        this.checkIdentity(this.snapshot);
        if (this.stateValue === "online") {
          authorizeOnline(
            this.snapshot,
            operation,
            Date.now() + this.serverOffset,
          );
        } else {
          requireValue(
            this.stateValue === "offline" && this.permit,
            "AUTHORIZATION_LOCKED",
          );
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
      "CURRENT_IDENTITY_MISMATCH",
    );
  }
}
