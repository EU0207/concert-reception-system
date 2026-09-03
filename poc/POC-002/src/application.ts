import { createEvent, type RereadReason } from "./domain";
import { createFirestoreRemoteStore } from "./firebase-store";
import { projectEvents, type PocProjection } from "./projection";
import { PocRepository } from "./repository";
import { pushPending, synchronize, type RemoteEventStore, type SyncResult } from "./sync";

export interface TimedReceptionResult {
  eventId: string;
  durationMs: number;
}

export interface ApplicationOptions {
  runId: string;
  performanceId: string;
  deviceId: string;
  actorId: string;
  databaseName?: string;
}

export class PocApplication {
  readonly repository: PocRepository;
  private remote?: RemoteEventStore;
  private authUid?: string;
  private unsubscribe?: () => void;
  private syncInFlight?: Promise<SyncResult>;
  private remoteApply = Promise.resolve();
  private receivedRemoteChanges = 0;

  constructor(readonly options: ApplicationOptions) {
    this.repository = new PocRepository(options.databaseName);
  }

  async prepareLocal(): Promise<void> {
    await this.repository.seedReferenceQrs(500);
    await this.repository.setMetadata("prepared", true);
  }

  async connect(): Promise<void> {
    const connection = await createFirestoreRemoteStore();
    this.remote = connection.store;
    this.authUid = connection.authUid;
    await this.remote.ensureRun(this.options.runId, this.options.performanceId);
    this.unsubscribe?.();
    this.unsubscribe = this.remote.subscribe(this.options.runId, (events) => {
      this.receivedRemoteChanges += events.length;
      this.remoteApply = this.remoteApply.then(async () => {
        for (const event of events) await this.repository.upsertRemote(event);
      });
    });
  }

  async recordReception(qrId: string): Promise<string> {
    if (!(await this.repository.hasReferenceQr(qrId))) {
      throw new Error(`架空QRが登録されていません: ${qrId}`);
    }
    const event = createEvent({
      ...this.baseOptions(),
      eventType: "reception.recorded",
      payload: { qrId, result: "accepted" }
    });
    await this.repository.addPending(event);
    return event.eventId;
  }

  async recordReceptionTimed(qrId: string): Promise<TimedReceptionResult> {
    const startedAt = performance.now();
    const eventId = await this.recordReception(qrId);
    return { eventId, durationMs: performance.now() - startedAt };
  }

  async recordReread(qrId: string, reason: RereadReason, memo: string): Promise<string> {
    if (!(await this.repository.hasReferenceQr(qrId))) {
      throw new Error(`架空QRが登録されていません: ${qrId}`);
    }
    const event = createEvent({
      ...this.baseOptions(),
      eventType: "reread.recorded",
      payload: { qrId, reason, memo }
    });
    await this.repository.addPending(event);
    return event.eventId;
  }

  async postMessage(title: string, body: string, priority: "normal" | "important"): Promise<string> {
    const event = createEvent({
      ...this.baseOptions(),
      eventType: "message.posted",
      payload: { title, body, priority }
    });
    await this.repository.addPending(event);
    return event.eventId;
  }

  async acknowledgeMessage(targetEventId: string): Promise<string> {
    const event = createEvent({
      ...this.baseOptions(),
      eventType: "message.acknowledged",
      payload: { targetEventId }
    });
    await this.repository.addPending(event);
    return event.eventId;
  }

  async sync(): Promise<SyncResult> {
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.performSync();
    try {
      return await this.syncInFlight;
    } finally {
      this.syncInFlight = undefined;
    }
  }

  async pushPending(): Promise<SyncResult> {
    if (!this.remote || !this.authUid) await this.connect();
    if (!this.remote || !this.authUid) throw new Error("同期先へ接続できません。");
    return pushPending(this.repository, this.remote, this.options.runId, this.authUid);
  }

  authIdentity(): string {
    if (!this.authUid) throw new Error("Firebaseへ未接続です。");
    return this.authUid;
  }

  remoteChangeCount(): number {
    return this.receivedRemoteChanges;
  }

  async eventCount(): Promise<number> {
    return (await this.repository.listEvents(this.options.runId)).length;
  }

  private async performSync(): Promise<SyncResult> {
    if (!this.remote || !this.authUid) await this.connect();
    if (!this.remote || !this.authUid) throw new Error("同期先へ接続できません。");
    return synchronize(this.repository, this.remote, this.options.runId, this.authUid);
  }

  async projection(): Promise<PocProjection> {
    return projectEvents(await this.repository.listEvents(this.options.runId));
  }

  async deleteLocalData(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    await this.repository.delete();
  }

  private baseOptions() {
    return {
      runId: this.options.runId,
      performanceId: this.options.performanceId,
      deviceId: this.options.deviceId,
      actorId: this.options.actorId
    };
  }
}
