import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createEvent, type PocEvent, type RemoteEvent } from "../../src/domain";
import { projectEvents } from "../../src/projection";
import { PocRepository } from "../../src/repository";
import {
  pushPending,
  synchronize,
  type RemoteEventStore,
  type UploadAcknowledgement
} from "../../src/sync";

class FakeRemoteStore implements RemoteEventStore {
  readonly events = new Map<string, RemoteEvent>();
  failNextUpload = false;

  async ensureRun(): Promise<void> {}

  async upload(event: PocEvent, authUid: string): Promise<UploadAcknowledgement> {
    if (this.failNextUpload) {
      this.failNextUpload = false;
      throw new Error("架空の通信障害");
    }
    const existing = this.events.get(event.eventId);
    if (existing) {
      return { eventId: event.eventId, serverReceivedAt: existing.serverReceivedAt, alreadyExisted: true };
    }
    const remote = {
      ...event,
      authUid,
      serverReceivedAt: "2026-09-02T00:00:10.000Z"
    } as RemoteEvent;
    this.events.set(event.eventId, remote);
    return { eventId: event.eventId, serverReceivedAt: remote.serverReceivedAt, alreadyExisted: false };
  }

  async list(runId: string): Promise<RemoteEvent[]> {
    return [...this.events.values()].filter((event) => event.runId === runId);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

const repositories: PocRepository[] = [];

function repository(name: string): PocRepository {
  const value = new PocRepository(`sync-${name}-${crypto.randomUUID()}`);
  repositories.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((database) => database.delete()));
});

function reception(deviceId: string, eventId: string): PocEvent {
  return createEvent({
    runId: "RUN-TEST",
    performanceId: "FAKE-PERFORMANCE",
    eventType: "reception.recorded",
    deviceId,
    actorId: `actor-${deviceId}`,
    eventId,
    payload: { qrId: "FAKE-P002-QR-0001", result: "accepted" }
  });
}

describe("synchronize", () => {
  it("オンライン増分送信では全件再取得しない", async () => {
    const database = repository("push-only");
    const remote = new FakeRemoteStore();
    await database.addPending(reception("device-01", "event-push-001"));

    const result = await pushPending(database, remote, "RUN-TEST", "auth-01");

    expect(result).toMatchObject({ uploaded: 1, downloaded: 0, failedEventIds: [] });
    expect(await database.listPending("RUN-TEST")).toHaveLength(0);
  });

  it("失敗したイベントを消さず、再試行後に同期済みにする", async () => {
    const database = repository("retry");
    const remote = new FakeRemoteStore();
    await database.addPending(reception("device-01", "event-001"));
    remote.failNextUpload = true;

    const failed = await synchronize(database, remote, "RUN-TEST", "auth-01");
    expect(failed.failedEventIds).toEqual(["event-001"]);
    expect(await database.listPending("RUN-TEST")).toHaveLength(1);

    const recovered = await synchronize(database, remote, "RUN-TEST", "auth-01");
    expect(recovered.uploaded).toBe(1);
    expect(await database.listPending("RUN-TEST")).toHaveLength(0);
  });

  it("6環境の記録を統合し、全環境で同じ競合を導出する", async () => {
    const remote = new FakeRemoteStore();
    const environments = Array.from({ length: 6 }, (_, index) => repository(`device-${index + 1}`));

    for (const [index, database] of environments.entries()) {
      await database.addPending(reception(`device-${index + 1}`, `event-00${index + 1}`));
      await synchronize(database, remote, "RUN-TEST", `auth-${index + 1}`);
    }
    expect(remote.events).toHaveLength(6);

    for (const [index, database] of environments.entries()) {
      await synchronize(database, remote, "RUN-TEST", `auth-${index + 1}`);
      const projection = projectEvents(await database.listEvents("RUN-TEST"));
      expect(projection.conflicts).toHaveLength(1);
      expect(projection.conflicts[0]?.receptions).toHaveLength(6);
    }
  });
});
