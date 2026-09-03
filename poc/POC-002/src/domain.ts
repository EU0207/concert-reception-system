export const REREAD_REASONS = [
  "legitimate-reentry",
  "consecutive-or-misread",
  "administrator-review",
  "other"
] as const;

export type RereadReason = (typeof REREAD_REASONS)[number];
export type MessagePriority = "normal" | "important";

export interface ReceptionPayload {
  qrId: string;
  result: "accepted";
}

export interface RereadPayload {
  qrId: string;
  reason: RereadReason;
  memo: string;
  correctsEventId?: string;
}

export interface MessagePayload {
  title: string;
  body: string;
  priority: MessagePriority;
}

export interface MessageRevisionPayload {
  targetEventId: string;
  reason: string;
  title?: string;
  body?: string;
}

export interface MessageAcknowledgementPayload {
  targetEventId: string;
}

export interface PocEventPayloadMap {
  "reception.recorded": ReceptionPayload;
  "reread.recorded": RereadPayload;
  "reread.corrected": RereadPayload;
  "message.posted": MessagePayload;
  "message.corrected": MessageRevisionPayload;
  "message.cancelled": MessageRevisionPayload;
  "message.acknowledged": MessageAcknowledgementPayload;
}

export type PocEventType = keyof PocEventPayloadMap;

export type PocEvent = {
  [K in PocEventType]: {
    eventId: string;
    runId: string;
    performanceId: string;
    eventType: K;
    deviceId: string;
    actorId: string;
    clientOccurredAt: string;
    payload: PocEventPayloadMap[K];
  };
}[PocEventType];

export type SyncStatus = "pending" | "synced";

export type StoredEvent = PocEvent & {
  syncStatus: SyncStatus;
  serverReceivedAt?: string;
};

export type RemoteEvent = PocEvent & {
  authUid: string;
  serverReceivedAt: string;
};

export interface EventFactoryOptions<K extends PocEventType> {
  runId: string;
  performanceId: string;
  eventType: K;
  deviceId: string;
  actorId: string;
  payload: PocEventPayloadMap[K];
  eventId?: string;
  clientOccurredAt?: string;
}

export function createEvent<K extends PocEventType>(options: EventFactoryOptions<K>): PocEvent {
  validatePayload(options.eventType, options.payload);
  return {
    eventId: options.eventId ?? crypto.randomUUID(),
    runId: options.runId,
    performanceId: options.performanceId,
    eventType: options.eventType,
    deviceId: options.deviceId,
    actorId: options.actorId,
    clientOccurredAt: options.clientOccurredAt ?? new Date().toISOString(),
    payload: structuredClone(options.payload)
  } as PocEvent;
}

function validatePayload<K extends PocEventType>(
  eventType: K,
  payload: PocEventPayloadMap[K]
): void {
  if (eventType === "reread.recorded" || eventType === "reread.corrected") {
    const reread = payload as RereadPayload;
    if (!REREAD_REASONS.includes(reread.reason)) {
      throw new Error("再読取り理由が不正です。");
    }
    if (reread.memo.length > 200) {
      throw new Error("再読取りメモは200文字以内です。");
    }
  }

  if (eventType === "message.posted") {
    const message = payload as MessagePayload;
    if (message.title.length === 0 || message.title.length > 50) {
      throw new Error("連絡タイトルは1～50文字です。");
    }
    if (message.body.length === 0 || message.body.length > 500) {
      throw new Error("連絡本文は1～500文字です。");
    }
  }
}

export function compareEvents(left: PocEvent, right: PocEvent): number {
  const timeOrder = left.clientOccurredAt.localeCompare(right.clientOccurredAt);
  return timeOrder === 0 ? left.eventId.localeCompare(right.eventId) : timeOrder;
}

export function businessEventsEqual(left: PocEvent, right: PocEvent): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])])
    );
  }
  return value;
}
