import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth
} from "firebase/auth";
import {
  connectFirestoreEmulator,
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

const projectId = "demo-concert-reception-poc-004";
const runId = `FAKE-P004-${Date.now()}`;
const eventId = "FAKE-P004-EVENT";
const password = `FAKE-${crypto.randomUUID()}-Strong9`;
const clients: Record<string, Client> = {};

function newClient(label: string): Omit<Client, "uid" | "email"> {
  const app = initializeApp({ apiKey: "demo-api-key", projectId, authDomain: `${projectId}.firebaseapp.com` }, `poc004-${label}-${crypto.randomUUID()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  return { app, auth, db };
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
  await setDoc(doc(owner.db, "poc004Runs", runId, "members", owner.uid), {
    uid: owner.uid, eventId, role: "owner", active: true
  });
  await setDoc(doc(owner.db, "poc004Runs", runId, "members", clients.deputy!.uid), {
    uid: clients.deputy!.uid, eventId, role: "deputy", active: true
  });
  await setDoc(doc(owner.db, "poc004Runs", runId, "members", clients.receptionist!.uid), {
    uid: clients.receptionist!.uid, eventId, role: "receptionist", active: true
  });
  await setDoc(doc(owner.db, "poc004Runs", runId, "members", clients.temporary!.uid), {
    uid: clients.temporary!.uid,
    eventId,
    role: "temporaryAdmin",
    active: true,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 60_000))
  });
  await setDoc(doc(owner.db, "poc004Runs", runId, "members", clients.lost!.uid), {
    uid: clients.lost!.uid, eventId, role: "receptionist", active: true
  });
});

afterAll(async () => {
  const owner = clients.owner;
  if (owner) {
    const paths = [
      ["publicRecords", "ticket"],
      ["publicRecords", "temporary-note"],
      ["restrictedFields", "visitor"],
      ["restrictedFields", "expired"],
      ["auditEvents", "owner-audit"]
    ] as const;
    for (const [collection, id] of paths) {
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

describe("Firebase Authentication and Security Rules", () => {
  it("rejects a wrong password and accepts the individual account", async () => {
    const receptionist = clients.receptionist!;
    await signOut(receptionist.auth);
    await expect(signInWithEmailAndPassword(receptionist.auth, receptionist.email, "wrong-password")).rejects.toThrow();
    await expect(signInWithEmailAndPassword(receptionist.auth, receptionist.email, password)).resolves.toBeDefined();
  });

  it("allows public data to active members and blocks role-excluded restricted data", async () => {
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

  it("lets temporary administrators manage public work but not memberships", async () => {
    await expect(setDoc(doc(clients.temporary!.db, "poc004Runs", runId, "publicRecords", "temporary-note"), { value: "FAKE" })).resolves.toBeUndefined();
    await expect(updateDoc(doc(clients.temporary!.db, "poc004Runs", runId, "members", clients.receptionist!.uid), { active: false })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("blocks expired restricted values", async () => {
    await setDoc(doc(clients.owner!.db, "poc004Runs", runId, "restrictedFields", "expired"), {
      ciphertext: "FAKE-CIPHERTEXT",
      expiresAt: Timestamp.fromDate(new Date(Date.now() - 1_000))
    });
    await expect(getDoc(doc(clients.owner!.db, "poc004Runs", runId, "restrictedFields", "expired"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("stops a lost-device account after the active flag reaches the server", async () => {
    await expect(getDoc(doc(clients.lost!.db, "poc004Runs", runId, "publicRecords", "ticket"))).resolves.toBeDefined();
    await updateDoc(doc(clients.owner!.db, "poc004Runs", runId, "members", clients.lost!.uid), { active: false });
    await expect(getDoc(doc(clients.lost!.db, "poc004Runs", runId, "publicRecords", "ticket"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("keeps audit events append-only for non-cleanup operations", async () => {
    const auditRef = doc(clients.owner!.db, "poc004Runs", runId, "auditEvents", "owner-audit");
    await setDoc(auditRef, { actorUid: clients.owner!.uid, action: "FAKE-CLOSE", createdAt: Timestamp.now() });
    await expect(updateDoc(auditRef, { action: "CHANGED" })).rejects.toMatchObject({ code: "permission-denied" });
  });
});
