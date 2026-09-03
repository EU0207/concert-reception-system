import { describe, expect, it } from "vitest";
import { createEvent, type PocEvent, type StoredEvent } from "../../src/domain";
import { projectEvents } from "../../src/projection";

function stored(event: PocEvent, syncStatus: "pending" | "synced" = "synced"): StoredEvent {
  return { ...event, syncStatus } as StoredEvent;
}

function reception(eventId: string, deviceId: string, qrId = "FAKE-QR-001"): StoredEvent {
  return stored(
    createEvent({
      runId: "RUN-TEST",
      performanceId: "FAKE-PERFORMANCE",
      eventType: "reception.recorded",
      deviceId,
      actorId: `actor-${deviceId}`,
      eventId,
      clientOccurredAt: `2026-09-02T00:00:0${eventId.at(-1)}.000Z`,
      payload: { qrId, result: "accepted" }
    })
  );
}

describe("projectEvents", () => {
  it("複数端末の初回受付を消去せず競合として導出する", () => {
    const result = projectEvents([
      reception("event-001", "device-01"),
      reception("event-002", "device-02")
    ]);
    expect(result.receptions).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.deviceIds).toEqual(["device-01", "device-02"]);
    expect(result.conflicts[0]?.receptions.map((event) => event.eventId)).toEqual([
      "event-001",
      "event-002"
    ]);
  });

  it("正当な再入場イベントを初回受付の競合へ数えない", () => {
    const reread = stored(
      createEvent({
        runId: "RUN-TEST",
        performanceId: "FAKE-PERFORMANCE",
        eventType: "reread.recorded",
        deviceId: "device-02",
        actorId: "actor-02",
        eventId: "event-002",
        clientOccurredAt: "2026-09-02T00:00:02.000Z",
        payload: { qrId: "FAKE-QR-001", reason: "legitimate-reentry", memo: "架空" }
      })
    );
    expect(projectEvents([reception("event-001", "device-01"), reread]).conflicts).toHaveLength(0);
  });

  it("重要連絡の訂正履歴と利用者別確認を保持する", () => {
    const original = createEvent({
      runId: "RUN-TEST",
      performanceId: "FAKE-PERFORMANCE",
      eventType: "message.posted",
      deviceId: "device-01",
      actorId: "actor-01",
      eventId: "message-001",
      clientOccurredAt: "2026-09-02T00:00:01.000Z",
      payload: { title: "架空連絡", body: "訂正前", priority: "important" }
    });
    const correction = createEvent({
      runId: "RUN-TEST",
      performanceId: "FAKE-PERFORMANCE",
      eventType: "message.corrected",
      deviceId: "device-01",
      actorId: "actor-01",
      eventId: "message-002",
      clientOccurredAt: "2026-09-02T00:00:02.000Z",
      payload: { targetEventId: "message-001", reason: "架空訂正", body: "訂正後" }
    });
    const acknowledgement = createEvent({
      runId: "RUN-TEST",
      performanceId: "FAKE-PERFORMANCE",
      eventType: "message.acknowledged",
      deviceId: "device-02",
      actorId: "actor-02",
      eventId: "message-003",
      clientOccurredAt: "2026-09-02T00:00:03.000Z",
      payload: { targetEventId: "message-001" }
    });
    const message = projectEvents([stored(original), stored(correction), stored(acknowledgement)]).messages[0];
    expect(message).toMatchObject({
      title: "架空連絡",
      body: "訂正後",
      priority: "important",
      acknowledgedActorIds: ["actor-02"]
    });
    expect(message?.revisions).toHaveLength(1);
    expect(message?.original.payload).toMatchObject({ body: "訂正前" });
  });
});
