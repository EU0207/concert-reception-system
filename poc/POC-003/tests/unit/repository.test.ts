import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { PocRepository } from "../../src/repository";

const repositories: PocRepository[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.deleteLocalData()));
});

describe("POC-003 IndexedDB repository", () => {
  it("seeds exactly 500 fake tickets and records an offline reception", async () => {
    const repository = new PocRepository(`poc-003-test-${crypto.randomUUID()}`);
    repositories.push(repository);
    await repository.seedFakeTickets();
    await repository.seedFakeTickets();
    const tickets = await repository.listTickets();
    expect(tickets).toHaveLength(500);
    const resolution = await repository.resolveQr(tickets[0]!.qrToken);
    expect(resolution.status).toBe("accepted");
    await repository.recordReception(tickets[0]!.qrToken, resolution.status);
    expect(await repository.receptionCount()).toBe(1);
  });

  it("persists seat and reissue changes", async () => {
    const repository = new PocRepository(`poc-003-test-${crypto.randomUUID()}`);
    repositories.push(repository);
    await repository.seedFakeTickets();
    const ticket = (await repository.listTickets())[0]!;
    const changed = { ...ticket, seat: { floorSection: "2階 C", row: "1列", number: "1番" } };
    await repository.saveTicket(changed);
    expect((await repository.getTicket(ticket.ticketId))?.seat.number).toBe("1番");
  });
});
