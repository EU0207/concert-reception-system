import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import { businessEventsEqual, type PocEvent, type RemoteEvent, type StoredEvent } from "./domain";

interface ReferenceQr {
  qrId: string;
  seat: string;
}

interface MetadataRecord {
  key: string;
  value: string | number | boolean;
}

interface PocDatabase extends DBSchema {
  referenceQrs: {
    key: string;
    value: ReferenceQr;
  };
  events: {
    key: string;
    value: StoredEvent;
    indexes: {
      "by-run": string;
      "by-sync-status": string;
    };
  };
  metadata: {
    key: string;
    value: MetadataRecord;
  };
}

export const DEFAULT_DATABASE_NAME = "concert-reception-poc-001";

export class PocRepository {
  private databasePromise: Promise<IDBPDatabase<PocDatabase>>;

  constructor(readonly databaseName = DEFAULT_DATABASE_NAME) {
    this.databasePromise = openDB<PocDatabase>(databaseName, 1, {
      upgrade(database) {
        database.createObjectStore("referenceQrs", { keyPath: "qrId" });
        const events = database.createObjectStore("events", { keyPath: "eventId" });
        events.createIndex("by-run", "runId");
        events.createIndex("by-sync-status", "syncStatus");
        database.createObjectStore("metadata", { keyPath: "key" });
      }
    });
  }

  async seedReferenceQrs(count = 500): Promise<void> {
    const database = await this.databasePromise;
    const transaction = database.transaction("referenceQrs", "readwrite");
    if ((await transaction.store.count()) === count) return;
    await transaction.store.clear();
    for (let index = 1; index <= count; index += 1) {
      const sequence = index.toString().padStart(3, "0");
      await transaction.store.put({ qrId: `FAKE-QR-${sequence}`, seat: `A-${sequence}` });
    }
    await transaction.done;
  }

  async hasReferenceQr(qrId: string): Promise<boolean> {
    return Boolean(await (await this.databasePromise).get("referenceQrs", qrId));
  }

  async addPending(event: PocEvent): Promise<void> {
    const database = await this.databasePromise;
    const existing = await database.get("events", event.eventId);
    if (existing) {
      if (!businessEventsEqual(stripSync(existing), event)) {
        throw new Error(`eventId ${event.eventId} の内容が一致しません。`);
      }
      return;
    }
    await database.add("events", { ...event, syncStatus: "pending" } as StoredEvent);
  }

  async upsertRemote(event: RemoteEvent): Promise<void> {
    const database = await this.databasePromise;
    const existing = await database.get("events", event.eventId);
    const remoteStored = {
      ...withoutRemoteMetadata(event),
      syncStatus: "synced" as const,
      serverReceivedAt: event.serverReceivedAt
    } as StoredEvent;
    if (existing && !businessEventsEqual(stripSync(existing), stripSync(remoteStored))) {
      throw new Error(`remote eventId ${event.eventId} の内容がローカルと一致しません。`);
    }
    await database.put("events", remoteStored);
  }

  async markSynced(eventId: string, serverReceivedAt: string): Promise<void> {
    const database = await this.databasePromise;
    const transaction = database.transaction("events", "readwrite");
    const event = await transaction.store.get(eventId);
    if (!event) throw new Error(`同期対象 ${eventId} が見つかりません。`);
    await transaction.store.put({ ...event, syncStatus: "synced", serverReceivedAt });
    await transaction.done;
  }

  async listPending(runId: string): Promise<StoredEvent[]> {
    const database = await this.databasePromise;
    const pending = await database.getAllFromIndex("events", "by-sync-status", "pending");
    return pending.filter((event) => event.runId === runId);
  }

  async listEvents(runId: string): Promise<StoredEvent[]> {
    return (await this.databasePromise).getAllFromIndex("events", "by-run", runId);
  }

  async setMetadata(key: string, value: MetadataRecord["value"]): Promise<void> {
    await (await this.databasePromise).put("metadata", { key, value });
  }

  async getMetadata(key: string): Promise<MetadataRecord["value"] | undefined> {
    return (await (await this.databasePromise).get("metadata", key))?.value;
  }

  async close(): Promise<void> {
    (await this.databasePromise).close();
  }

  async delete(): Promise<void> {
    await this.close();
    await deleteDB(this.databaseName);
  }
}

function stripSync(event: StoredEvent): PocEvent {
  const { syncStatus: _syncStatus, serverReceivedAt: _serverReceivedAt, ...businessEvent } = event;
  return businessEvent as PocEvent;
}

function withoutRemoteMetadata(event: RemoteEvent): PocEvent {
  const { authUid: _authUid, serverReceivedAt: _serverReceivedAt, ...businessEvent } = event;
  return businessEvent as PocEvent;
}
