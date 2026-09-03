import { describe, expect, it } from "vitest";
import { percentile, summarizeDurations } from "../../src/metrics";

describe("performance metrics", () => {
  it("nearest-rankで中央値と95パーセンタイルを集計する", () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(summarizeDurations(values)).toEqual({
      count: 100,
      minimumMs: 1,
      medianMs: 50,
      p95Ms: 95,
      maximumMs: 100
    });
  });

  it("入力配列を変更しない", () => {
    const values = [3, 1, 2];
    expect(percentile([...values].sort((a, b) => a - b), 0.5)).toBe(2);
    summarizeDurations(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it("空配列と不正値を拒否する", () => {
    expect(() => summarizeDurations([])).toThrow("集計対象");
    expect(() => summarizeDurations([Number.NaN])).toThrow("有限値");
  });
});
