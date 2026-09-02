import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createEvent, type RemoteEvent } from "../../src/domain";
import { PocRepository } from "../../src/repository";

const databases: PocRepository[] = [];

function repository(): PocRepository {
  const value = new PocRepository(`test-${crypto.randomUUID()}`);
  databases.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe("PocRepository", () => {
  it("500件の架空QRだけを準備する", async () => {
    const database = repository();
    await database.seedReferenceQrs();
    expect(await database.hasReferenceQr("FAKE-QR-001")).toBe(true);
    expect(await database.hasReferenceQr("FAKE-QR-500")).toBe(true);
    expect(await database.hasReferenceQr("REAL-QR-001")).toBe(false);
  });

  it("同じeventIdの同一イベントを重複保存しない", async () => {
    const database = repository();
    const event = createEvent({
      runId: "RUN-TEST",
      performanceId: "FAKE-PERFORMANCE",
      eventType: "reception.recorded",
      deviceId: "device-01",
      actorId: "actor-01",
      eventId: "event-001",
      clientOccurredAt: "2026-09-02T00:00:00.000Z",
      payload: { qrId: "FAKE-QR-001", result: "accepted" }
    });
    await database.addPending(event);
    await database.addPending(event);
    expect(await database.listPending("RUN-TEST")).toHaveLength(1);
  });

  it("同期確認を受けるまでpendingを維持する", async () => {
    const database = repository();
    const event = createEvent({
      runId: "RUN-TEST",
      performanceId: "FAKE-PERFORMANCE",
      eventType: "reception.recorded",
      deviceId: "device-01",
      actorId: "actor-01",
      eventId: "event-001",
      payload: { qrId: "FAKE-QR-001", result: "accepted" }
    });
    await database.addPending(event);
    expect(await database.listPending("RUN-TEST")).toHaveLength(1);
    await database.markSynced(event.eventId, "2026-09-02T00:00:10.000Z");
    expect(await database.listPending("RUN-TEST")).toHaveLength(0);
    expect((await database.listEvents("RUN-TEST"))[0]).toMatchObject({
      syncStatus: "synced",
      serverReceivedAt: "2026-09-02T00:00:10.000Z"
    });
  });

  it("Firestoreがpayloadの項目順を変えても同一イベントとして扱う", async () => {
    const database = repository();
    const event = createEvent({
      runId: "RUN-TEST",
      performanceId: "FAKE-PERFORMANCE",
      eventType: "message.posted",
      deviceId: "device-01",
      actorId: "actor-01",
      eventId: "event-ordered-payload",
      clientOccurredAt: "2026-09-02T00:00:00.000Z",
      payload: { title: "架空連絡", body: "架空本文", priority: "important" }
    });
    await database.addPending(event);
    await database.upsertRemote({
      ...event,
      payload: { priority: "important", body: "架空本文", title: "架空連絡" },
      authUid: "anonymous-test-user",
      serverReceivedAt: "2026-09-02T00:00:10.000Z"
    } as RemoteEvent);
    expect(await database.listPending("RUN-TEST")).toHaveLength(0);
  });
});
