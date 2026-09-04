export type StaffRole = "lead" | "delegate" | "reception" | "temporary-admin";

export interface Seat {
  floorSection: string;
  row: string;
  number: string;
}

export interface TicketHistory {
  type: "seat.changed" | "ticket.reissued";
  occurredAt: string;
  reason: string;
  previousSeat?: Seat;
  previousQrToken?: string;
}

export interface FakeTicket {
  ticketId: string;
  attendeeName: string;
  performanceName: string;
  performanceAt: string;
  venueName: string;
  venueAddress: string;
  seat: Seat;
  qrToken: string;
  invalidatedQrTokens: string[];
  confirmationCode: string;
  history: TicketHistory[];
}

export type QrResolution =
  | { status: "accepted"; ticket: FakeTicket }
  | { status: "invalidated"; ticket: FakeTicket }
  | { status: "unknown" };

export interface ScanDecision {
  status: QrResolution["status"] | "locked";
  ticket?: FakeTicket;
}

export function createFakeTickets(count = 500): FakeTicket[] {
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error("架空チケット件数は1～500件で指定してください。");
  }
  return Array.from({ length: count }, (_, index) => {
    const serial = String(index + 1).padStart(4, "0");
    return {
      ticketId: `FAKE-P003-TICKET-${serial}`,
      attendeeName: `架空来場者 ${serial}`,
      performanceName: "架空コンサート 2027",
      performanceAt: "2027-04-10 14:00",
      venueName: "架空コンサートホール",
      venueAddress: "架空県架空市一丁目2番3号",
      seat: {
        floorSection: index % 2 === 0 ? "1階 A区画" : "2階 B区画",
        row: `${Math.floor(index / 25) + 1}列`,
        number: `${(index % 25) + 1}番`
      },
      qrToken: `FAKE-P003-QR-${serial}-V1`,
      invalidatedQrTokens: [],
      confirmationCode: `P3${serial}`,
      history: []
    };
  });
}

export function resolveQr(tickets: FakeTicket[], qrToken: string): QrResolution {
  const active = tickets.find((ticket) => ticket.qrToken === qrToken);
  if (active) return { status: "accepted", ticket: active };
  const invalidated = tickets.find((ticket) => ticket.invalidatedQrTokens.includes(qrToken));
  if (invalidated) return { status: "invalidated", ticket: invalidated };
  return { status: "unknown" };
}

export function findByConfirmationCode(
  tickets: FakeTicket[],
  confirmationCode: string
): FakeTicket | undefined {
  const normalized = confirmationCode.trim().toUpperCase();
  return tickets.find((ticket) => ticket.confirmationCode === normalized);
}

export function changeSeat(
  ticket: FakeTicket,
  seat: Seat,
  reason: string,
  occurredAt = new Date().toISOString()
): FakeTicket {
  requireReason(reason);
  return {
    ...ticket,
    seat: { ...seat },
    history: [
      ...ticket.history,
      {
        type: "seat.changed",
        occurredAt,
        reason: reason.trim(),
        previousSeat: { ...ticket.seat }
      }
    ]
  };
}

export function reissueTicket(
  ticket: FakeTicket,
  reason: string,
  occurredAt = new Date().toISOString()
): FakeTicket {
  requireReason(reason);
  const version = ticket.invalidatedQrTokens.length + 2;
  const previousQrToken = ticket.qrToken;
  return {
    ...ticket,
    qrToken: `${ticket.ticketId.replace("TICKET", "QR")}-V${version}`,
    invalidatedQrTokens: [...ticket.invalidatedQrTokens, previousQrToken],
    history: [
      ...ticket.history,
      {
        type: "ticket.reissued",
        occurredAt,
        reason: reason.trim(),
        previousQrToken
      }
    ]
  };
}

export function canExportZip(role: StaffRole): boolean {
  return role === "lead" || role === "delegate";
}

export class ScanGate {
  private locked = false;

  decide(tickets: FakeTicket[], qrToken: string): ScanDecision {
    if (this.locked) return { status: "locked" };
    this.locked = true;
    return resolveQr(tickets, qrToken);
  }

  next(): void {
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }
}

function requireReason(reason: string): void {
  if (!reason.trim()) throw new Error("理由を入力してください。");
}
