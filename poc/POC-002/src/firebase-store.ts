import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  signInAnonymously,
  type Auth,
  type User
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocsFromServer,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Timestamp
} from "firebase/firestore";
import { businessEventsEqual, type PocEvent, type RemoteEvent } from "./domain";
import type { RemoteEventStore, UploadAcknowledgement } from "./sync";

interface FirebaseConnection {
  auth: Auth;
  firestore: Firestore;
  user: User;
}

let connectionPromise: Promise<FirebaseConnection> | undefined;

export async function connectFirebase(): Promise<FirebaseConnection> {
  connectionPromise ??= createConnection();
  return connectionPromise;
}

async function createConnection(): Promise<FirebaseConnection> {
  const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR !== "false";
  const options = firebaseOptions(useEmulator);
  const app = getApps().length === 0 ? initializeApp(options) : getApp();
  const auth = getAuth(app);
  const firestore = initializeFirestore(app, { localCache: memoryLocalCache() });

  if (useEmulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  }

  // Auth Emulator must be connected before persistence or sign-in starts Auth.
  await setPersistence(auth, browserLocalPersistence);

  const credential = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
  return { auth, firestore, user: credential.user };
}

function firebaseOptions(useEmulator: boolean): FirebaseOptions {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-concert-reception-poc-002";
  const options = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-api-key",
    authDomain:
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "demo-app-id"
  };
  if (!useEmulator && Object.values(options).some((value) => !value)) {
    throw new Error("外部Firebase接続用の環境変数が不足しています。");
  }
  return options;
}

export class FirestoreRemoteEventStore implements RemoteEventStore {
  constructor(private readonly firestore: Firestore) {}

  async ensureRun(runId: string, performanceId: string): Promise<void> {
    const reference = doc(this.firestore, "pocRuns", runId);
    if ((await getDocFromServer(reference)).exists()) return;
    try {
      await setDoc(reference, {
        runId,
        performanceId,
        createdAt: serverTimestamp(),
        syntheticDataOnly: true
      });
    } catch (error) {
      // Another measurement environment may have created the immutable run concurrently.
      if ((await getDocFromServer(reference)).exists()) return;
      throw error;
    }
  }

  async upload(event: PocEvent, authUid: string): Promise<UploadAcknowledgement> {
    const reference = doc(this.firestore, "pocRuns", event.runId, "events", event.eventId);
    const existing = await getDocFromServer(reference);
    if (existing.exists()) {
      const remote = snapshotToEvent(existing);
      assertSameBusinessEvent(event, remote);
      return {
        eventId: event.eventId,
        serverReceivedAt: remote.serverReceivedAt,
        alreadyExisted: true
      };
    }

    await setDoc(reference, {
      ...event,
      authUid,
      serverReceivedAt: serverTimestamp()
    });
    const created = await getDocFromServer(reference);
    if (!created.exists()) throw new Error(`Firestore確認応答がありません: ${event.eventId}`);
    const remote = snapshotToEvent(created);
    return {
      eventId: event.eventId,
      serverReceivedAt: remote.serverReceivedAt,
      alreadyExisted: false
    };
  }

  async list(runId: string): Promise<RemoteEvent[]> {
    const snapshots = await getDocsFromServer(collection(this.firestore, "pocRuns", runId, "events"));
    return snapshots.docs.map(snapshotToEvent);
  }

  subscribe(runId: string, onEvents: (events: RemoteEvent[]) => void): () => void {
    return onSnapshot(
      collection(this.firestore, "pocRuns", runId, "events"),
      (snapshot) => onEvents(snapshot.docChanges().map((change) => snapshotToEvent(change.doc))),
      () => undefined
    );
  }
}

export async function createFirestoreRemoteStore(): Promise<{
  store: FirestoreRemoteEventStore;
  authUid: string;
}> {
  const connection = await connectFirebase();
  return {
    store: new FirestoreRemoteEventStore(connection.firestore),
    authUid: connection.user.uid
  };
}

function snapshotToEvent(
  snapshot: QueryDocumentSnapshot<DocumentData> | Awaited<ReturnType<typeof getDocFromServer>>
): RemoteEvent {
  const data = snapshot.data() as DocumentData | undefined;
  if (!data) throw new Error(`Firestore文書 ${snapshot.id} にデータがありません。`);
  const timestamp = data.serverReceivedAt as Timestamp | undefined;
  if (!timestamp || typeof timestamp.toDate !== "function") {
    throw new Error(`Firestore文書 ${snapshot.id} に受信時刻がありません。`);
  }
  return {
    eventId: String(data.eventId),
    runId: String(data.runId),
    performanceId: String(data.performanceId),
    eventType: data.eventType,
    deviceId: String(data.deviceId),
    actorId: String(data.actorId),
    authUid: String(data.authUid),
    clientOccurredAt: String(data.clientOccurredAt),
    serverReceivedAt: timestamp.toDate().toISOString(),
    payload: data.payload
  } as RemoteEvent;
}

function assertSameBusinessEvent(local: PocEvent, remote: RemoteEvent): void {
  const {
    authUid: _authUid,
    serverReceivedAt: _serverReceivedAt,
    ...remoteBusinessEvent
  } = remote;
  if (!businessEventsEqual(local, remoteBusinessEvent as PocEvent)) {
    throw new Error(`eventId ${local.eventId} が異なる内容で既に存在します。`);
  }
}
