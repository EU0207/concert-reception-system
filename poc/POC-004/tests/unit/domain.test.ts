import { describe, expect, it } from "vitest";
import {
  canStartOffline,
  isMembershipActive,
  may,
  restrictedCsvHeaders,
  validateDefinitions,
  validateOptionalInput,
  type PreparationState
} from "../../src/domain";

describe("role permissions", () => {
  it("limits restricted values to permanent administrators", () => {
    expect(may("owner", "readRestricted")).toBe(true);
    expect(may("deputy", "exportRestricted")).toBe(true);
    expect(may("receptionist", "readRestricted")).toBe(false);
    expect(may("temporaryAdmin", "readRestricted")).toBe(false);
    expect(() => restrictedCsvHeaders(["name"], ["contact"], "receptionist")).toThrow(/権限/);
    expect(restrictedCsvHeaders(["name"], [], "receptionist")).toEqual(["name"]);
  });

  it("expires temporary membership", () => {
    expect(isMembershipActive({ uid: "u1", eventId: "e1", role: "temporaryAdmin", active: true, expiresAt: "2026-09-04T10:00:00Z" }, new Date("2026-09-04T09:59:59Z"))).toBe(true);
    expect(isMembershipActive({ uid: "u1", eventId: "e1", role: "temporaryAdmin", active: true, expiresAt: "2026-09-04T10:00:00Z" }, new Date("2026-09-04T10:00:00Z"))).toBe(false);
  });
});

describe("preparation and optional fields", () => {
  const prepared: PreparationState = {
    eventId: "FAKE-EVENT",
    uid: "FAKE-OWNER",
    role: "owner",
    preparedAt: "2026-09-04T00:00:00Z",
    referenceCount: 500,
    pendingCount: 0,
    adminSecretReady: true
  };

  it("allows only prepared offline starts", () => {
    expect(canStartOffline(prepared, new Date("2026-09-04T01:00:00Z"))).toBe(true);
    expect(canStartOffline({ ...prepared, referenceCount: 0 })).toBe(false);
    expect(canStartOffline({ ...prepared, adminSecretReady: false })).toBe(false);
    expect(canStartOffline(undefined)).toBe(false);
  });

  it("enforces ten definitions and two hundred characters", () => {
    const definitions = Array.from({ length: 10 }, (_, index) => ({ key: `field${index}`, label: `項目${index}` }));
    expect(() => validateDefinitions(definitions)).not.toThrow();
    expect(() => validateDefinitions([...definitions, { key: "field10", label: "項目10" }])).toThrow(/10件/);
    expect(() => validateOptionalInput(definitions, { visitorId: "v1", values: { field0: "あ".repeat(200) } })).not.toThrow();
    expect(() => validateOptionalInput(definitions, { visitorId: "v1", values: { field0: "あ".repeat(201) } })).toThrow(/200文字/);
  });
});
