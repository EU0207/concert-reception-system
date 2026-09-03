import { describe, expect, it } from "vitest";
import { createEvent } from "../../src/domain";

const base = {
  runId: "RUN-TEST",
  performanceId: "FAKE-PERFORMANCE",
  deviceId: "device-01",
  actorId: "actor-01"
};

describe("createEvent", () => {
  it("同じ入力IDと時刻で再現可能なイベントを作る", () => {
    const event = createEvent({
      ...base,
      eventType: "reception.recorded",
      eventId: "event-001",
      clientOccurredAt: "2026-09-02T00:00:00.000Z",
      payload: { qrId: "FAKE-QR-001", result: "accepted" }
    });
    expect(event).toMatchObject({
      eventId: "event-001",
      eventType: "reception.recorded",
      payload: { qrId: "FAKE-QR-001" }
    });
  });

  it("200文字を超える再読取りメモを拒否する", () => {
    expect(() =>
      createEvent({
        ...base,
        eventType: "reread.recorded",
        payload: {
          qrId: "FAKE-QR-001",
          reason: "other",
          memo: "架".repeat(201)
        }
      })
    ).toThrow("200文字以内");
  });

  it("空の連絡タイトルを拒否する", () => {
    expect(() =>
      createEvent({
        ...base,
        eventType: "message.posted",
        payload: { title: "", body: "架空本文", priority: "normal" }
      })
    ).toThrow("1～50文字");
  });
});
