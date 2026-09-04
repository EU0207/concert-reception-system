import type { FirebaseClient } from "./firebase-client";
import { clearFirebaseClient } from "./firebase-client";
import type { Poc004Repository } from "./repository";

export interface CloseConditions {
  performanceEnded: boolean;
  pendingWrites: number;
  administratorConfirmed: boolean;
}

export function mayClosePerformance(conditions: CloseConditions): boolean {
  return conditions.performanceEnded && conditions.pendingWrites === 0 && conditions.administratorConfirmed;
}

export async function clearLocalPocData(repository: Poc004Repository, firebaseClient?: FirebaseClient): Promise<void> {
  if (firebaseClient) await clearFirebaseClient(firebaseClient);
  await repository.delete();
  if ("caches" in globalThis) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.includes("poc-004") || name.includes("workbox")).map((name) => caches.delete(name)));
  }
  if ("navigator" in globalThis && "serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}
