import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EncryptedPayload } from "./crypto";
import type { PreparationState } from "./domain";

interface MetadataRecord {
  key: string;
  value: PreparationState | string | number | boolean;
}

interface EncryptedRecord {
  visitorId: string;
  payload: EncryptedPayload;
}

interface Poc004Database extends DBSchema {
  metadata: { key: string; value: MetadataRecord };
  restricted: { key: string; value: EncryptedRecord };
}

export const DEFAULT_DATABASE_NAME = "concert-reception-poc-004";

export class Poc004Repository {
  private databasePromise: Promise<IDBPDatabase<Poc004Database>>;

  constructor(readonly databaseName = DEFAULT_DATABASE_NAME) {
    this.databasePromise = openDB<Poc004Database>(databaseName, 1, {
      upgrade(database) {
        database.createObjectStore("metadata", { keyPath: "key" });
        database.createObjectStore("restricted", { keyPath: "visitorId" });
      }
    });
  }

  async setPreparation(value: PreparationState): Promise<void> {
    await (await this.databasePromise).put("metadata", { key: "preparation", value });
  }

  async getPreparation(): Promise<PreparationState | undefined> {
    const record = await (await this.databasePromise).get("metadata", "preparation");
    return record?.value as PreparationState | undefined;
  }

  async putRestricted(visitorId: string, payload: EncryptedPayload): Promise<void> {
    await (await this.databasePromise).put("restricted", { visitorId, payload });
  }

  async getRestricted(visitorId: string): Promise<EncryptedPayload | undefined> {
    return (await (await this.databasePromise).get("restricted", visitorId))?.payload;
  }

  async countRestricted(): Promise<number> {
    return (await this.databasePromise).count("restricted");
  }

  async removeExpired(now = new Date()): Promise<number> {
    const database = await this.databasePromise;
    const transaction = database.transaction("restricted", "readwrite");
    let removed = 0;
    for (const cursor of await transaction.store.getAll()) {
      if (new Date(cursor.payload.expiresAt).getTime() <= now.getTime()) {
        await transaction.store.delete(cursor.visitorId);
        removed += 1;
      }
    }
    await transaction.done;
    return removed;
  }

  async close(): Promise<void> {
    (await this.databasePromise).close();
  }

  async delete(): Promise<void> {
    await this.close();
    await deleteDB(this.databaseName);
  }
}
