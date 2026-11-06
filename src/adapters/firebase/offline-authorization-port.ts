// トークンの更新ができない状況でも準備済みの許可を使えるよう、復元UIDだけをSDKへ照会する。
// 新しい権限は作らず、#104が検証した暗号化済み準備結果の範囲へ限定する。
import { onIdTokenChanged } from 'firebase/auth';
import type { FirebasePrincipals } from './principals.ts';
import type { AuthorizationSnapshot, HumanIdentity } from '../../domain/authorization/types.ts';
import type { AuthorizationPort } from '../../security/authorization-controller.ts';
import { requireValue, SeatDomainError } from '../../domain/seats/validation.ts';

/** SDKの期限切れトークンを更新すると完全オフラインで止まるため、オンライン取得と分ける。 */
export async function createOfflineAuthorizationPort(
  principals: FirebasePrincipals,
  confirmed: AuthorizationSnapshot,
): Promise<AuthorizationPort & { dispose(): void }> {
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
    fetchCurrent: () => Promise.reject(new SeatDomainError('ONLINE_ADAPTER_REQUIRED')),
    onInvalidate: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      disposed = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      listeners.clear();
    },
  };
}
