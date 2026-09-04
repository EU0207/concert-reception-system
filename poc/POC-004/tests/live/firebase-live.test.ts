import { deleteApp, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptJson } from "../../src/crypto";

interface Client {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  uid: string;
  email: string;
}

const expectedProjectId = "crs-poc-001-20260902-01";
const config: FirebaseOptions = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

if (config.projectId !== expectedProjectId || !config.apiKey || !config.authDomain || !config.appId) {
  throw new Error("POC-004の接続先またはFirebase設定が不正です。実環境試験を中止します。");
}

const runId = `FAKE-P004-LIVE-${Date.now()}`;
const eventId = "FAKE-P004-LIVE-EVENT";
const password = `FAKE-${crypto.randomUUID()}-Strong9`;
const clients: Record<string, Client> = {};

function newClient(label: string): Omit<Client, "uid" | "email"> {
  const app = initializeApp(config, `poc004-live-${label}-${crypto.randomUUID()}`);
  return { app, auth: getAuth(app), db: getFirestore(app) };
}

async function createClient(label: string): Promise<Client> {
  const base = newClient(label);
  const email = `poc004-${label}-${crypto.randomUUID()}@example.invalid`;
  const credential = await createUserWithEmailAndPassword(base.auth, email, password);
  return { ...base, uid: credential.user.uid, email };
}

beforeAll(async () => {
  for (const label of ["owner", "deputy", "receptionist", "temporary", "lost"]) {
    clients[label] = await createClient(label);
  }
  const owner = clients.owner!;
  await setDoc(doc(owner.db, "poc004Runs", runId), {
    runId,
    eventId,
    ownerUid: owner.uid,
    syntheticDataOnly: true,
    createdAt: Timestamp.now()
  });
  for (const [label, role] of [
    ["owner", "owner"],
    ["deputy", "deputy"],
    ["receptionist", "receptionist"],
    ["temporary", "temporaryAdmin"],
    ["lost", "receptionist"]
  ] as const) {
    const client = clients[label]!;
    await setDoc(doc(owner.db, "poc004Runs", runId, "members", client.uid), {
      uid: client.uid,
      eventId,
      role,
      active: true,
      ...(label === "temporary" ? { expiresAt: Timestamp.fromDate(new Date(Date.now() + 120_000)) } : {})
    });
  }
});

afterAll(async () => {
  const owner = clients.owner;
  if (owner) {
    for (const [collection, id] of [
      ["publicRecords", "ticket"],
      ["publicRecords", "temporary-note"],
      ["restrictedFields", "visitor"],
      ["restrictedFields", "expired"],
      ["auditEvents", "owner-audit"]
    ] as const) {
      await deleteDoc(doc(owner.db, "poc004Runs", runId, collection, id)).catch(() => undefined);
    }
    for (const label of ["deputy", "receptionist", "temporary", "lost", "owner"]) {
      const client = clients[label];
      if (client) await deleteDoc(doc(owner.db, "poc004Runs", runId, "members", client.uid)).catch(() => undefined);
    }
    await deleteDoc(doc(owner.db, "poc004Runs", runId)).catch(() => undefined);
  }
  for (const client of Object.values(clients)) {
    if (!client.auth.currentUser) await signInWithEmailAndPassword(client.auth, client.email, password).catch(() => undefined);
    if (client.auth.currentUser) await deleteUser(client.auth.currentUser).catch(() => undefined);
    await deleteApp(client.app);
  }
});

describe("real Firebase limited verification", () => {
  it("rejects a wrong password and accepts the individual account", async () => {
    const receptionist = clients.receptionist!;
    await signOut(receptionist.auth);
    await expect(signInWithEmailAndPassword(receptionist.auth, receptionist.email, "wrong-password")).rejects.toThrow();
    await expect(signInWithEmailAndPassword(receptionist.auth, receptionist.email, password)).resolves.toBeDefined();
  });

  it("enforces role separation and encrypted restricted fields", async () => {
    const owner = clients.owner!;
    const restricted = await encryptJson({ note: "架空の限定情報" }, "FAKE-shared-passphrase", new Date(Date.now() + 86_400_000).toISOString(), 10_000);
    await setDoc(doc(owner.db, "poc004Runs", runId, "publicRecords", "ticket"), { ticketId: "FAKE-TICKET", seat: "A-001" });
    await setDoc(doc(owner.db, "poc004Runs", runId, "restrictedFields", "visitor"), {
      ...restricted,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 86_400_000))
    });
    await expect(getDoc(doc(clients.receptionist!.db, "poc004Runs", runId, "publicRecords", "ticket"))).resolves.toMatchObject({ exists: expect.any(Function) });
    await expect(getDoc(doc(clients.deputy!.db, "poc004Runs", runId, "restrictedFields", "visitor"))).resolves.toMatchObject({ exists: expect.any(Function) });
    await expect(getDoc(doc(clients.receptionist!.db, "poc004Runs", runId, "restrictedFields", "visitor"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(clients.temporary!.db, "poc004Runs", runId, "restrictedFields", "visitor"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("limits temporary administrators and stops a disabled device", async () => {
    await expect(setDoc(doc(clients.temporary!.db, "poc004Runs", runId, "publicRecords", "temporary-note"), { value: "FAKE" })).resolves.toBeUndefined();
    await expect(updateDoc(doc(clients.temporary!.db, "poc004Runs", runId, "members", clients.receptionist!.uid), { active: false })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(clients.lost!.db, "poc004Runs", runId, "publicRecords", "ticket"))).resolves.toBeDefined();
    await updateDoc(doc(clients.owner!.db, "poc004Runs", runId, "members", clients.lost!.uid), { active: false });
    await expect(getDoc(doc(clients.lost!.db, "poc004Runs", runId, "publicRecords", "ticket"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks expired values and keeps audit events append-only", async () => {
    const owner = clients.owner!;
    await setDoc(doc(owner.db, "poc004Runs", runId, "restrictedFields", "expired"), {
      ciphertext: "FAKE-CIPHERTEXT",
      expiresAt: Timestamp.fromDate(new Date(Date.now() - 1_000))
    });
    await expect(getDoc(doc(owner.db, "poc004Runs", runId, "restrictedFields", "expired"))).rejects.toMatchObject({ code: "permission-denied" });
    const auditRef = doc(owner.db, "poc004Runs", runId, "auditEvents", "owner-audit");
    await setDoc(auditRef, { actorUid: owner.uid, action: "FAKE-CLOSE", createdAt: Timestamp.now() });
    await expect(updateDoc(auditRef, { action: "CHANGED" })).rejects.toMatchObject({ code: "permission-denied" });
  });
});
