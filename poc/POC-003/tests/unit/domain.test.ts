import { describe, expect, it } from "vitest";
import {
  ScanGate,
  canExportZip,
  changeSeat,
  createFakeTickets,
  findByConfirmationCode,
  reissueTicket,
  resolveQr
} from "../../src/domain";

describe("POC-003 ticket rules", () => {
  it("creates 500 unique fake tickets without personal data in QR values", () => {
    const tickets = createFakeTickets();
    expect(tickets).toHaveLength(500);
    expect(new Set(tickets.map((ticket) => ticket.ticketId)).size).toBe(500);
    expect(new Set(tickets.map((ticket) => ticket.qrToken)).size).toBe(500);
    expect(new Set(tickets.map((ticket) => ticket.confirmationCode)).size).toBe(500);
    expect(tickets.every((ticket) => ticket.qrToken.startsWith("FAKE-P003-QR-"))).toBe(true);
    expect(() => createFakeTickets(501)).toThrow();
  });

  it("keeps the QR token when changing a seat", () => {
    const original = createFakeTickets(1)[0]!;
    const changed = changeSeat(
      original,
      { floorSection: "1階 C区画", row: "3列", number: "12番" },
      "架空変更",
      "2026-09-03T00:00:00.000Z"
    );
    expect(changed.qrToken).toBe(original.qrToken);
    expect(changed.seat.number).toBe("12番");
    expect(changed.history[0]?.previousSeat).toEqual(original.seat);
  });

  it("invalidates the old QR token when reissuing", () => {
    const original = createFakeTickets(1)[0]!;
    const reissued = reissueTicket(original, "架空紛失", "2026-09-03T00:00:00.000Z");
    expect(reissued.qrToken).not.toBe(original.qrToken);
    expect(resolveQr([reissued], original.qrToken).status).toBe("invalidated");
    expect(resolveQr([reissued], reissued.qrToken).status).toBe("accepted");
    expect(reissued.history[0]?.previousQrToken).toBe(original.qrToken);
  });

  it("finds a ticket by normalized confirmation code", () => {
    const tickets = createFakeTickets(2);
    expect(findByConfirmationCode(tickets, " p30002 ")?.ticketId).toBe("FAKE-P003-TICKET-0002");
    expect(findByConfirmationCode(tickets, "NOPE")).toBeUndefined();
  });

  it("permits ZIP export only to lead and delegate roles", () => {
    expect(canExportZip("lead")).toBe(true);
    expect(canExportZip("delegate")).toBe(true);
    expect(canExportZip("reception")).toBe(false);
    expect(canExportZip("temporary-admin")).toBe(false);
  });

  it("blocks another decoded QR until next is selected", () => {
    const tickets = createFakeTickets(2);
    const gate = new ScanGate();
    expect(gate.decide(tickets, tickets[0]!.qrToken).status).toBe("accepted");
    expect(gate.decide(tickets, tickets[1]!.qrToken).status).toBe("locked");
    gate.next();
    expect(gate.decide(tickets, tickets[1]!.qrToken).status).toBe("accepted");
  });
});
