// ADR-005の本人Authと端末Authを、別のFirebase Appへ分離する。

import { getApps, initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import {
  browserSessionPersistence,
  connectAuthEmulator,
  EmailAuthProvider,
  getAuth,
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
} from "firebase/auth";
import type { Auth } from "firebase/auth";
import type { AppConfig } from "../../app/config.ts";
import { parseConfig } from "../../app/config.ts";
import { requireValue } from "../../domain/seats/validation.ts";
import type { HumanIdentity } from "../../domain/authorization/types.ts";

export interface FirebasePrincipals {
  humanApp: FirebaseApp;
  deviceApp: FirebaseApp;
  humanAuth: Auth;
  deviceAuth: Auth;
}

function authFor(app: FirebaseApp, existing: boolean): Auth {
  // 初回はセッション保存を選び、準備後に残したIndexedDBの資格も復元対象にする。
  return existing
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: [browserSessionPersistence, indexedDBLocalPersistence],
      });
}

/** 呼出し時だけ初期化する。通常のローカル評価画面から自動では呼ばない。 */
export function createFirebasePrincipals(
  input: AppConfig,
  emulatorAuthPort?: number,
): FirebasePrincipals {
  const config = parseConfig(input);
  requireValue(
    config.environmentType !== "evaluation-local" && config.firebase,
    "FIREBASE_CONFIG_REQUIRED",
  );
  if (emulatorAuthPort !== undefined) {
    requireValue(
      config.environmentType === "evaluation-firebase" &&
        config.firebase.projectId.startsWith("demo-") &&
        Number.isSafeInteger(emulatorAuthPort) &&
        emulatorAuthPort >= 1024 &&
        emulatorAuthPort <= 65535,
      "INVALID_EMULATOR_CONFIGURATION",
    );
  }
  const create = (kind: "human" | "device") => {
    const name = `concert:${config.environmentId}:${kind}`;
    const prior = getApps().find((app) => app.name === name);
    if (prior) {
      for (const key of [
        "apiKey",
        "authDomain",
        "projectId",
        "appId",
        "databaseURL",
      ] as const) {
        requireValue(
          prior.options[key] === config.firebase![key],
          "FIREBASE_ENVIRONMENT_MISMATCH",
        );
      }
    }
    const app = prior ?? initializeApp(config.firebase!, name);
    const auth = authFor(app, Boolean(prior));
    if (emulatorAuthPort !== undefined && !prior) {
      connectAuthEmulator(auth, `http://127.0.0.1:${emulatorAuthPort}`, {
        disableWarnings: true,
      });
    }
    if (prior) {
      requireValue(
        emulatorAuthPort === undefined
          ? auth.emulatorConfig === null
          : auth.emulatorConfig?.host === "127.0.0.1" &&
              auth.emulatorConfig.port === emulatorAuthPort,
        "FIREBASE_CONNECTION_MODE_MISMATCH",
      );
    }
    return { app, auth };
  };
  const human = create("human"),
    device = create("device");
  return {
    humanApp: human.app,
    deviceApp: device.app,
    humanAuth: human.auth,
    deviceAuth: device.auth,
  };
}

/** Google操作は、開発者・利用者が画面から明示的に開始する。 */
export async function signInHumanGoogle(
  principals: FirebasePrincipals,
): Promise<void> {
  await signInWithPopup(
    principals.humanAuth,
    new GoogleAuthProvider(),
    browserPopupRedirectResolver,
  );
}

export async function signInHumanPassword(
  principals: FirebasePrincipals,
  email: string,
  password: string,
): Promise<void> {
  await signInWithEmailAndPassword(principals.humanAuth, email, password);
}

/** 既存の本人UIDへGoogleを連携し、別UIDへの置換や自動統合は行わない。 */
export async function linkHumanGoogle(
  principals: FirebasePrincipals,
): Promise<void> {
  const human = principals.humanAuth.currentUser;
  requireValue(
    human && human.uid !== principals.deviceAuth.currentUser?.uid,
    "HUMAN_IDENTITY_REQUIRED",
  );
  const beforeUid = human.uid;
  const result = await linkWithPopup(
    human,
    new GoogleAuthProvider(),
    browserPopupRedirectResolver,
  );
  requireValue(
    result.user.uid === beforeUid &&
      principals.humanAuth.currentUser?.uid === beforeUid,
    "HUMAN_UID_CHANGED",
  );
  // 連携だけでは再認証完了としない。呼出元が明示的に再認証へ進む。
}

export async function reauthenticateHumanGoogle(
  principals: FirebasePrincipals,
): Promise<void> {
  const human = principals.humanAuth.currentUser;
  requireValue(human, "HUMAN_IDENTITY_REQUIRED");
  await reauthenticateWithPopup(
    human,
    new GoogleAuthProvider(),
    browserPopupRedirectResolver,
  );
}

export async function reauthenticateHumanPassword(
  principals: FirebasePrincipals,
  password: string,
): Promise<void> {
  const human = principals.humanAuth.currentUser;
  requireValue(human?.email, "HUMAN_IDENTITY_REQUIRED");
  await reauthenticateWithCredential(
    human,
    EmailAuthProvider.credential(human.email, password),
  );
}

/** 生トークンをアプリの保存形式へ渡さず、必要な確認値だけを返す。 */
export async function readHumanIdentity(
  principals: FirebasePrincipals,
  refresh = false,
): Promise<HumanIdentity> {
  await principals.humanAuth.authStateReady();
  const human = principals.humanAuth.currentUser;
  requireValue(
    human && human.uid !== principals.deviceAuth.currentUser?.uid,
    "HUMAN_IDENTITY_REQUIRED",
  );
  const result = await getIdTokenResult(human, refresh);
  requireValue(
    principals.humanAuth.currentUser?.uid === human.uid,
    "HUMAN_UID_CHANGED",
  );
  const provider = result.signInProvider;
  requireValue(
    provider === "google.com" || provider === "password",
    "UNSUPPORTED_HUMAN_PROVIDER",
  );
  const authTime = result.claims.auth_time;
  requireValue(
    typeof authTime === "number" &&
      Number.isSafeInteger(authTime) &&
      authTime >= 0,
    "INVALID_AUTHENTICATION_TIME",
  );
  return {
    uid: human.uid,
    emailVerified: result.claims.email_verified === true,
    provider,
    authenticatedAt: authTime * 1000,
  };
}

/** 端末UIDをSDKから取得する。本人UIDや本文の自己申告を端末資格へ流用しない。 */
export async function ensureDeviceIdentity(
  principals: FirebasePrincipals,
): Promise<string> {
  await principals.deviceAuth.authStateReady();
  const user =
    principals.deviceAuth.currentUser ??
    (await signInAnonymously(principals.deviceAuth)).user;
  requireValue(
    user.isAnonymous && user.uid !== principals.humanAuth.currentUser?.uid,
    "DEVICE_IDENTITY_REQUIRED",
  );
  return user.uid;
}

/** 永続化は明示的な準備完了後だけ許可する。通常はブラウザーのセッションに限定する。 */
export async function setPreparedPersistence(
  principals: FirebasePrincipals,
  prepared: boolean,
): Promise<void> {
  const persistence = prepared
    ? indexedDBLocalPersistence
    : browserSessionPersistence;
  await principals.humanAuth.setPersistence(persistence);
  await principals.deviceAuth.setPersistence(persistence);
}

/** 端末資格は保持する。呼出元が先に本人セッションの失効と画面ロックを行う。 */
export async function signOutHuman(
  principals: FirebasePrincipals,
): Promise<void> {
  await signOut(principals.humanAuth);
}
