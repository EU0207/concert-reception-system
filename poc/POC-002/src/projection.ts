import type {
  MessageAcknowledgementPayload,
  MessagePayload,
  MessageRevisionPayload,
  PocEvent,
  ReceptionPayload,
  StoredEvent
} from "./domain";
import { compareEvents } from "./domain";

export interface ReceptionProjection {
  qrId: string;
  firstReception: PocEvent;
  receptions: PocEvent[];
  hasConflict: boolean;
  deviceIds: string[];
}

export interface MessageProjection {
  messageId: string;
  original: PocEvent;
  title: string;
  body: string;
  priority: "normal" | "important";
  cancelled: boolean;
  revisions: PocEvent[];
  acknowledgedActorIds: string[];
}

export interface PocProjection {
  receptions: ReceptionProjection[];
  conflicts: ReceptionProjection[];
  messages: MessageProjection[];
  pendingCount: number;
}

export function projectEvents(events: StoredEvent[]): PocProjection {
  const ordered = [...events].sort(compareEvents);
  const receptions = projectReceptions(ordered);
  return {
    receptions,
    conflicts: receptions.filter((entry) => entry.hasConflict),
    messages: projectMessages(ordered),
    pendingCount: ordered.filter((event) => event.syncStatus === "pending").length
  };
}

function projectReceptions(events: PocEvent[]): ReceptionProjection[] {
  const byQr = new Map<string, PocEvent[]>();
  for (const event of events) {
    if (event.eventType !== "reception.recorded") continue;
    const qrId = (event.payload as ReceptionPayload).qrId;
    const bucket = byQr.get(qrId) ?? [];
    bucket.push(event);
    byQr.set(qrId, bucket);
  }

  return [...byQr.entries()]
    .map(([qrId, receptions]) => {
      const ordered = [...receptions].sort(compareEvents);
      const firstReception = ordered[0];
      if (!firstReception) throw new Error("受付イベントがありません。");
      return {
        qrId,
        firstReception,
        receptions: ordered,
        hasConflict: ordered.length > 1,
        deviceIds: [...new Set(ordered.map((event) => event.deviceId))].sort()
      };
    })
    .sort((left, right) => left.qrId.localeCompare(right.qrId));
}

function projectMessages(events: PocEvent[]): MessageProjection[] {
  const messages = new Map<string, MessageProjection>();

  for (const event of events) {
    if (event.eventType === "message.posted") {
      const payload = event.payload as MessagePayload;
      messages.set(event.eventId, {
        messageId: event.eventId,
        original: event,
        title: payload.title,
        body: payload.body,
        priority: payload.priority,
        cancelled: false,
        revisions: [],
        acknowledgedActorIds: []
      });
      continue;
    }

    if (event.eventType === "message.corrected" || event.eventType === "message.cancelled") {
      const payload = event.payload as MessageRevisionPayload;
      const message = messages.get(payload.targetEventId);
      if (!message) continue;
      message.revisions.push(event);
      if (event.eventType === "message.corrected") {
        message.title = payload.title ?? message.title;
        message.body = payload.body ?? message.body;
      } else {
        message.cancelled = true;
      }
      continue;
    }

    if (event.eventType === "message.acknowledged") {
      const payload = event.payload as MessageAcknowledgementPayload;
      const message = messages.get(payload.targetEventId);
      if (!message || message.priority !== "important") continue;
      if (!message.acknowledgedActorIds.includes(event.actorId)) {
        message.acknowledgedActorIds.push(event.actorId);
        message.acknowledgedActorIds.sort();
      }
    }
  }

  return [...messages.values()].sort((left, right) =>
    compareEvents(left.original, right.original)
  );
}
