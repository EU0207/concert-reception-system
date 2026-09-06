import { deleteApp, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth
} from "firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  terminate,
  type Firestore
} from "firebase/firestore";

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

export function firebaseOptionsFromEnv(): FirebaseOptions {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
}

export function createFirebaseClient(options = firebaseOptionsFromEnv(), name = "poc004-browser"): FirebaseClient {
  const app = initializeApp(options, name);
  const auth = getAuth(app);
  const firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
  });
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  }
  return { app, auth, firestore };
}

export async function signInForPreparation(client: FirebaseClient, email: string, password: string): Promise<string> {
  await setPersistence(client.auth, browserLocalPersistence);
  return (await signInWithEmailAndPassword(client.auth, email, password)).user.uid;
}

export async function clearFirebaseClient(client: FirebaseClient): Promise<void> {
  await signOut(client.auth).catch(() => undefined);
  await terminate(client.firestore);
  await clearIndexedDbPersistence(getFirestore(client.app)).catch(() => undefined);
  await deleteApp(client.app);
}
