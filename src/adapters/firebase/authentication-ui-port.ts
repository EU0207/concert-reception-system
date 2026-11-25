// 本人認証画面を既存のFirebase認証へ接続する。業務DB・端末鍵は操作しない。

import { onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { requireValue } from '../../domain/seats/validation.ts';
import type { AuthenticationUiPort } from '../../app/authentication-screen.ts';
import type { FirebasePrincipals } from './principals.ts';
import {
  readHumanIdentity, signInHumanGoogle, signInHumanPassword,
  reauthenticateHumanGoogle, reauthenticateHumanPassword, signOutHuman,
} from './principals.ts';

/** 本人確認とメール操作だけを提供し、認証成功を役割・端末承認へ昇格させない。 */
export function createAuthenticationUiPort(principals: FirebasePrincipals): AuthenticationUiPort {
  principals.humanAuth.languageCode = 'ja';

  return {
    /** 本人用Authの復元を待ち、未ログインは正常な未認証状態として返す。 */
    async identity() {
      await principals.humanAuth.authStateReady();
      return principals.humanAuth.currentUser ? readHumanIdentity(principals) : null;
    },

    google: () => signInHumanGoogle(principals),
    password: (email, password) => signInHumanPassword(principals, email, password),

    /** 現在の本人にだけ確認メールを送り、メールアドレスを独自保存しない。 */
    async verification() {
      const human = principals.humanAuth.currentUser;
      requireValue(human && !human.isAnonymous, 'HUMAN_IDENTITY_REQUIRED');

      await sendEmailVerification(human);
    },

    /** メール確認後の本人情報とトークンを更新し、途中の本人変更を拒否する。 */
    async refresh() {
      const human = principals.humanAuth.currentUser;
      requireValue(human, 'HUMAN_IDENTITY_REQUIRED');
      await human.reload();
      requireValue(principals.humanAuth.currentUser?.uid === human.uid, 'HUMAN_UID_CHANGED');
      await readHumanIdentity(principals, true);
    },

    /** 未登録アドレスかどうかを画面に区別して表示しない。 */
    async resetPassword(email) {
      try {
        await sendPasswordResetEmail(principals.humanAuth, email);
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'auth/user-not-found') throw error;
      }
    },

    /** 現在の本人のプロバイダーに合わせて再認証する。 */
    async reauthenticate(password) {
      const identity = await readHumanIdentity(principals);
      if (identity.provider === 'google.com') {
        await reauthenticateHumanGoogle(principals);
      } else {
        requireValue(password, 'PASSWORD_REQUIRED');
        await reauthenticateHumanPassword(principals, password);
      }
    },

    signOut: () => signOutHuman(principals),
    onChange: (listener) => onAuthStateChanged(principals.humanAuth, () => listener()),
  };
}
