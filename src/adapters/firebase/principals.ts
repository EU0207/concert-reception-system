// 本人と端末のFirebase認証を扱う。ログイン・連携と再認証、資格の保存方法をまとめる。

import { getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  browserSessionPersistence,
  connectAuthEmulator,
  EmailAuthProvider,
  getIdTokenResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import type { AppConfig } from '../../app/config.ts';
import { parseConfig } from '../../app/config.ts';
import { requireValue } from '../../domain/seats/validation.ts';
import type { HumanIdentity } from '../../domain/authorization/types.ts';

export interface FirebasePrincipals {
  humanApp: FirebaseApp;
  deviceApp: FirebaseApp;
  humanAuth: Auth;
  deviceAuth: Auth;
}

/** 保存領域を確認し、指定Appの認証と資格の復元方法を設定する。 */
function authFor(app: FirebaseApp): Auth {
  // セッション保存不能から長期保存へ勝手に切り替わらないよう、先に利用可否を確かめる。
  try {
    const probe = `concert-auth-probe:${crypto.randomUUID()}`;

    sessionStorage.setItem(probe, '1');
    sessionStorage.removeItem(probe);
  } catch {
    requireValue(false, 'SESSION_PERSISTENCE_UNAVAILABLE');
  }

  // 初回はセッション保存を選び、準備後に残したIndexedDBの資格も復元対象にする。
  return initializeAuth(app, {
    persistence: [browserSessionPersistence, indexedDBLocalPersistence],
  });
}

/** 環境設定に対応する、本人用と端末用のFirebase認証を作る。 */
export function createFirebasePrincipals(
  input: AppConfig,
  emulatorAuthPort?: number,
): FirebasePrincipals {
  const config = parseConfig(input);

  requireValue(
    config.environmentType !== 'evaluation-local' && config.firebase,
    'FIREBASE_CONFIG_REQUIRED',
  );

  if (emulatorAuthPort !== undefined) {
    requireValue(
      config.environmentType === 'evaluation-firebase' &&
        config.firebase.projectId.startsWith('demo-') &&
        Number.isSafeInteger(emulatorAuthPort) &&
        emulatorAuthPort >= 1024 &&
        emulatorAuthPort <= 65535,
      'INVALID_EMULATOR_CONFIGURATION',
    );
  }

  /** 用途別のFirebase Appと認証を作成・再利用する。 */
  const create = (kind: 'human' | 'device') => {
    const name = `concert:${config.environmentId}:${kind}`;
    const prior = getApps().find((app) => app.name === name);

    if (prior) {
      for (const key of ['apiKey', 'authDomain', 'projectId', 'appId', 'databaseURL'] as const) {
        requireValue(prior.options[key] === config.firebase![key], 'FIREBASE_ENVIRONMENT_MISMATCH');
      }
    }

    const app = prior ?? initializeApp(config.firebase!, name);
    const auth = authFor(app);

    if (emulatorAuthPort !== undefined && auth.emulatorConfig === null) {
      connectAuthEmulator(auth, `http://127.0.0.1:${emulatorAuthPort}`, {
        disableWarnings: true,
      });
    }

    requireValue(
      emulatorAuthPort === undefined
        ? auth.emulatorConfig === null
        : auth.emulatorConfig?.host === '127.0.0.1' &&
            auth.emulatorConfig.port === emulatorAuthPort,
      'FIREBASE_CONNECTION_MODE_MISMATCH',
    );

    return { app, auth };
  };

  // 同じ本人の端末Aだけを停止できるよう、本人と端末は別の認証状態にする。
  const human = create('human'),
    device = create('device');

  return {
    humanApp: human.app,
    deviceApp: device.app,
    humanAuth: human.auth,
    deviceAuth: device.auth,
  };
}

/** Googleのポップアップで本人をログインさせる。 */
export async function signInHumanGoogle(principals: FirebasePrincipals): Promise<void> {
  await signInWithPopup(
    principals.humanAuth,
    new GoogleAuthProvider(),
    browserPopupRedirectResolver,
  );
}

/** メールアドレスとパスワードで本人をログインさせる。 */
export async function signInHumanPassword(
  principals: FirebasePrincipals,
  email: string,
  password: string,
): Promise<void> {
  await signInWithEmailAndPassword(principals.humanAuth, email, password);
}

/** 現在の本人UIDに、Googleの認証方式を連携する。 */
export async function linkHumanGoogle(principals: FirebasePrincipals): Promise<void> {
  // 別UIDへ移すと権限と操作履歴の主体がずれるため、Google連携でも既存UIDを保つ。

  const human = principals.humanAuth.currentUser;

  requireValue(
    human && human.uid !== principals.deviceAuth.currentUser?.uid,
    'HUMAN_IDENTITY_REQUIRED',
  );

  const beforeUid = human.uid;
  const result = await linkWithPopup(human, new GoogleAuthProvider(), browserPopupRedirectResolver);

  requireValue(
    result.user.uid === beforeUid && principals.humanAuth.currentUser?.uid === beforeUid,
    'HUMAN_UID_CHANGED',
  );
  // 連携だけでは再認証完了としない。呼出元が明示的に再認証へ進む。
}

/** Googleで本人を再認証する。 */
export async function reauthenticateHumanGoogle(principals: FirebasePrincipals): Promise<void> {
  const human = principals.humanAuth.currentUser;

  requireValue(human, 'HUMAN_IDENTITY_REQUIRED');
  await reauthenticateWithPopup(human, new GoogleAuthProvider(), browserPopupRedirectResolver);
}

/** 現在の本人をパスワードで再認証する。 */
export async function reauthenticateHumanPassword(
  principals: FirebasePrincipals,
  password: string,
): Promise<void> {
  const human = principals.humanAuth.currentUser;

  requireValue(human?.email, 'HUMAN_IDENTITY_REQUIRED');
  await reauthenticateWithCredential(human, EmailAuthProvider.credential(human.email, password));
}

/** SDKの資格を確認し、本人UID・認証方式と認証時刻を返す。 */
export async function readHumanIdentity(
  principals: FirebasePrincipals,
  refresh = false,
): Promise<HumanIdentity> {
  // 資格情報を保存形式へ流さないため、生トークンはSDK内に留めて確認値だけ返す。

  await principals.humanAuth.authStateReady();

  const human = principals.humanAuth.currentUser;

  requireValue(
    human && human.uid !== principals.deviceAuth.currentUser?.uid,
    'HUMAN_IDENTITY_REQUIRED',
  );

  const result = await getIdTokenResult(human, refresh);

  requireValue(principals.humanAuth.currentUser?.uid === human.uid, 'HUMAN_UID_CHANGED');

  const provider = result.signInProvider;

  requireValue(provider === 'google.com' || provider === 'password', 'UNSUPPORTED_HUMAN_PROVIDER');

  const authTime = result.claims.auth_time;

  requireValue(
    typeof authTime === 'number' && Number.isSafeInteger(authTime) && authTime >= 0,
    'INVALID_AUTHENTICATION_TIME',
  );

  return {
    uid: human.uid,
    emailVerified: result.claims.email_verified === true,
    provider,
    authenticatedAt: authTime * 1000,
  };
}

/** 端末の匿名認証を復元・作成し、端末UIDを返す。 */
export async function ensureDeviceIdentity(principals: FirebasePrincipals): Promise<string> {
  // 本文のUIDを信用すると別端末を装えるため、端末UIDはSDKの匿名資格から読む。

  await principals.deviceAuth.authStateReady();

  const user =
    principals.deviceAuth.currentUser ?? (await signInAnonymously(principals.deviceAuth)).user;

  requireValue(
    user.isAnonymous && user.uid !== principals.humanAuth.currentUser?.uid,
    'DEVICE_IDENTITY_REQUIRED',
  );

  return user.uid;
}

/** 準備状態に応じて、本人・端末の資格の保存方式を切り替える。 */
export async function setPreparedPersistence(
  principals: FirebasePrincipals,
  prepared: boolean,
): Promise<void> {
  // 準備前の端末に長期ログインを残さないため、永続化は準備完了後だけ切り替える。

  const persistence = prepared ? indexedDBLocalPersistence : browserSessionPersistence;

  try {
    await Promise.all([
      principals.humanAuth.setPersistence(persistence),
      principals.deviceAuth.setPersistence(persistence),
    ]);
  } catch (error) {
    // 片方だけ長期保存になった状態を準備成功にしない。失敗時は両方の短期保存を試みる。
    await Promise.allSettled([
      principals.humanAuth.setPersistence(browserSessionPersistence),
      principals.deviceAuth.setPersistence(browserSessionPersistence),
    ]);

    throw error;
  }
}

/** 本人の認証だけをログアウトし、端末の匿名認証は維持する。 */
export async function signOutHuman(principals: FirebasePrincipals): Promise<void> {
  await signOut(principals.humanAuth);
}
