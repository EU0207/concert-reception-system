// ローカル画面確認だけに使う本人認証の見本。通信・資格情報の保存・業務認可は行わない。

import type { HumanIdentity } from '../domain/authorization/types.ts';
import type { AuthenticationUiPort } from './authentication-screen.ts';

/** 見本の本人状態を画面内だけで保持し、メール確認の表示も擬似的に切り替える。 */
export function createAuthenticationPreview(): AuthenticationUiPort {
  let identity: HumanIdentity | null = null;
  const listeners = new Set<() => void>();

  /** 見本の本人を変更し、購読中の画面へ知らせる。 */
  function change(value: HumanIdentity | null) {
    identity = value;
    for (const listener of listeners) listener();
  }

  return {
    identity: async () => identity ? { ...identity } : null,
    google: async () => change({ uid: 'preview-human', provider: 'google.com', emailVerified: true, authenticatedAt: Date.now() }),
    password: async () => change({ uid: 'preview-human', provider: 'password', emailVerified: false, authenticatedAt: Date.now() }),
    verification: async () => {},
    refresh: async () => { if (identity) change({ ...identity, emailVerified: true }); },
    resetPassword: async () => {},
    reauthenticate: async () => { if (identity) change({ ...identity, authenticatedAt: Date.now() }); },
    signOut: async () => change(null),
    onChange: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
