import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { encryptJson } from "../../src/crypto";
import { Poc004Repository } from "../../src/repository";

const names: string[] = [];

afterEach(async () => {
  for (const name of names.splice(0)) await new Poc004Repository(name).delete();
});

describe("POC-004 local repository", () => {
  it("persists preparation and removes only expired restricted records", async () => {
    const name = `poc004-test-${crypto.randomUUID()}`;
    names.push(name);
    const repository = new Poc004Repository(name);
    await repository.setPreparation({
      eventId: "FAKE-EVENT",
      uid: "FAKE-OWNER",
      role: "owner",
      preparedAt: "2026-09-04T00:00:00Z",
      referenceCount: 500,
      pendingCount: 0,
      adminSecretReady: true
    });
    await repository.putRestricted("expired", await encryptJson({ value: "old" }, "FAKE", "2026-09-03T00:00:00Z", 1_000));
    await repository.putRestricted("valid", await encryptJson({ value: "new" }, "FAKE", "2026-10-03T00:00:00Z", 1_000));

    expect((await repository.getPreparation())?.referenceCount).toBe(500);
    expect(await repository.removeExpired(new Date("2026-09-04T00:00:00Z"))).toBe(1);
    expect(await repository.countRestricted()).toBe(1);
    await repository.close();
  });
});
