import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import { createFakeTickets, resolveQr, type FakeTicket, type QrResolution } from "./domain";

export interface ReceptionRecord {
  eventId: string;
  qrToken: string;
  result: QrResolution["status"];
  recordedAt: string;
}

interface PocDatabase extends DBSchema {
  tickets: {
    key: string;
    value: FakeTicket;
  };
  receptions: {
    key: string;
    value: ReceptionRecord;
  };
  metadata: {
    key: string;
    value: unknown;
  };
}

export class PocRepository {
  private database?: Promise<IDBPDatabase<PocDatabase>>;

  constructor(private readonly databaseName = "concert-reception-poc-003") {}

  async seedFakeTickets(): Promise<void> {
    const db = await this.db();
    if ((await db.count("tickets")) === 500) return;
    const transaction = db.transaction("tickets", "readwrite");
    await transaction.store.clear();
    for (const ticket of createFakeTickets()) await transaction.store.put(ticket);
    await transaction.done;
    await db.put("metadata", true, "prepared");
  }

  async listTickets(): Promise<FakeTicket[]> {
    return (await this.db()).getAll("tickets");
  }

  async getTicket(ticketId: string): Promise<FakeTicket | undefined> {
    return (await this.db()).get("tickets", ticketId);
  }

  async saveTicket(ticket: FakeTicket): Promise<void> {
    await (await this.db()).put("tickets", ticket);
  }

  async resolveQr(qrToken: string): Promise<QrResolution> {
    return resolveQr(await this.listTickets(), qrToken);
  }

  async recordReception(qrToken: string, result: QrResolution["status"]): Promise<ReceptionRecord> {
    const record: ReceptionRecord = {
      eventId: crypto.randomUUID(),
      qrToken,
      result,
      recordedAt: new Date().toISOString()
    };
    await (await this.db()).put("receptions", record);
    return record;
  }

  async receptionCount(): Promise<number> {
    return (await this.db()).count("receptions");
  }

  async deleteLocalData(): Promise<void> {
    const db = await this.database;
    db?.close();
    this.database = undefined;
    await deleteDB(this.databaseName);
  }

  private db(): Promise<IDBPDatabase<PocDatabase>> {
    this.database ??= openDB<PocDatabase>(this.databaseName, 1, {
      upgrade(db) {
        db.createObjectStore("tickets", { keyPath: "ticketId" });
        db.createObjectStore("receptions", { keyPath: "eventId" });
        db.createObjectStore("metadata");
      }
    });
    return this.database;
  }
}
