import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Seat, VenueImage } from "./domain";

export interface PreparationState {
  eventId: "FAKE-EVENT-P005";
  cacheName: string;
  images: VenueImage[];
  imageBytes: number;
  seatCount: number;
  completedAt: string;
  persisted: boolean | null;
}

export interface DeviceResult {
  schemaVersion: 1;
  pocId: "POC-005";
  deviceModel: "iPhone 17" | "iPhone 13 mini" | "Galaxy Z Fold8";
  osVersion: string;
  browserUserAgent: string;
  preparedImages: boolean;
  offlineReload: boolean;
  browserRestart: boolean;
  currentSeatVisible: boolean;
  fallbackListVisible: boolean;
  smallScreenUsable?: boolean;
  foldOuter?: boolean;
  foldInner?: boolean;
  foldStateRetained?: boolean;
  notes: string;
  recordedAt: string;
}

interface PocDatabase extends DBSchema {
  seats: { key: string; value: Seat };
  metadata: { key: string; value: PreparationState };
  ui: { key: string; value: string };
  results: { key: string; value: DeviceResult };
}

export class PocRepository {
  private database?: Promise<IDBPDatabase<PocDatabase>>;

  constructor(private readonly databaseName = "concert-reception-poc-005") {}

  async replacePreparation(seats: readonly Seat[], state: PreparationState): Promise<void> {
    const db = await this.db();
    const transaction = db.transaction(["seats", "metadata"], "readwrite");
    await transaction.objectStore("seats").clear();
    for (const seat of seats) await transaction.objectStore("seats").put(seat);
    await transaction.objectStore("metadata").put(state, "preparation");
    await transaction.done;
  }

  async getPreparation(): Promise<PreparationState | undefined> {
    return (await this.db()).get("metadata", "preparation");
  }

  async listSeats(): Promise<Seat[]> {
    return (await this.db()).getAll("seats");
  }

  async saveSelectedSeat(seatId: string): Promise<void> {
    await (await this.db()).put("ui", seatId, "selectedSeatId");
  }

  async getSelectedSeat(): Promise<string | undefined> {
    return (await this.db()).get("ui", "selectedSeatId");
  }

  async saveDeviceResult(result: DeviceResult): Promise<void> {
    await (await this.db()).put("results", result, result.deviceModel);
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
        db.createObjectStore("seats", { keyPath: "id" });
        db.createObjectStore("metadata");
        db.createObjectStore("ui");
        db.createObjectStore("results");
      }
    });
    return this.database;
  }
}
