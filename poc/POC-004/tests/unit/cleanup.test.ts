import { describe, expect, it } from "vitest";
import { mayClosePerformance } from "../../src/cleanup";

describe("performance close gate", () => {
  it("requires end, zero pending writes and administrator confirmation", () => {
    expect(mayClosePerformance({ performanceEnded: true, pendingWrites: 0, administratorConfirmed: true })).toBe(true);
    expect(mayClosePerformance({ performanceEnded: false, pendingWrites: 0, administratorConfirmed: true })).toBe(false);
    expect(mayClosePerformance({ performanceEnded: true, pendingWrites: 1, administratorConfirmed: true })).toBe(false);
    expect(mayClosePerformance({ performanceEnded: true, pendingWrites: 0, administratorConfirmed: false })).toBe(false);
  });
});
