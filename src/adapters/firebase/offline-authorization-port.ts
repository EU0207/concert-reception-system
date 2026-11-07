// SDKが復元した本人・端末と準備結果を照合し、オフライン専用の認可窓口を提供する。

import { onIdTokenChanged } from 'firebase/auth';
import type { FirebasePrincipals } from './principals.ts';
import type { AuthorizationSnapshot, HumanIdentity } from '../../domain/authorization/types.ts';
import type { AuthorizationPort } from '../../security/authorization-controller.ts';
import { requireValue, SeatDomainError } from '../../domain/seats/validation.ts';

// # 本文：復元した資格と準備結果の照合

/** SDKが復元した資格と準備結果を使う、オフライン専用の認可窓口を作る。 */
export async function createOfflineAuthorizationPort(
  principals: FirebasePrincipals,
  confirmed: AuthorizationSnapshot,
): Promise<AuthorizationPort & { dispose(): void }> {
  // SDKの期限切れトークンを更新すると完全オフラインで止まるため、オンライン取得と分ける。

  await Promise.all([
    principals.humanAuth.authStateReady(),
    principals.deviceAuth.authStateReady(),
  ]);
  requireValue(
    principals.humanApp.name === `concert:${confirmed.environmentId}:human` &&
      principals.deviceApp.name === `concert:${confirmed.environmentId}:device`,
    'FIREBASE_ENVIRONMENT_MISMATCH',
  );

  const expected = structuredClone(confirmed);
  let disposed = false,
    invalidated = false;
  const listeners = new Set<(reason?: 'authorization' | 'network') => void>();

  /** 復元した本人・端末UIDを照合し、準備時の本人確認値を返す。 */
  const identity = (): { human: HumanIdentity | null; deviceUid: string | null } => {
    const human = principals.humanAuth.currentUser,
      device = principals.deviceAuth.currentUser;
    const matches =
      !disposed &&
      !invalidated &&
      human?.uid === expected.role.humanUid &&
      human.emailVerified === true &&
      device?.isAnonymous === true &&
      device.uid === expected.deviceAuthUid;

    return {
      human: matches
        ? {
            uid: human.uid,
            emailVerified: true,
            // providerDataの「連携済み方式」を今回のログイン方式と誤認せず、最後の確認値を使う。
            provider: expected.session.authProvider,
            authenticatedAt: expected.session.humanAuthTime,
          }
        : null,
      deviceUid: matches ? device.uid : null,
    };
  };

  requireValue(identity().human, 'RESTORED_PRINCIPAL_MISMATCH');

  const unsubscribers = [principals.humanAuth, principals.deviceAuth].map((auth) => {
    let first = true;

    return onIdTokenChanged(auth, () => {
      if (first) {
        first = false;

        return;
      }

      invalidated = true;

      for (const listener of listeners) listener('authorization');
    });
  });

  return {
    identity,

    /** オフライン専用のため、オンライン認可の取得要求を拒否する。 */
    fetchCurrent: () => Promise.reject(new SeatDomainError('ONLINE_ADAPTER_REQUIRED')),

    /** 復元資格の失効通知を受け取る処理を登録する。 */
    onInvalidate: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },

    /** 復元資格の監視を止め、この窓口の利用を終了する。 */
    dispose: () => {
      disposed = true;

      for (const unsubscribe of unsubscribers) unsubscribe();

      listeners.clear();
    },
  };
}
