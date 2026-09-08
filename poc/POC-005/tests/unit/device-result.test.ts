import { describe, expect, it } from "vitest";
import { validateDeviceResult } from "../../src/device-result";
import type { DeviceResult } from "../../src/repository";

const base: DeviceResult = {
  schemaVersion: 1,
  pocId: "POC-005",
  deviceModel: "iPhone 17",
  osVersion: "26.6.1",
  browserUserAgent: "fake-user-agent",
  preparedImages: true,
  offlineReload: true,
  browserRestart: true,
  currentSeatVisible: true,
  fallbackListVisible: true,
  notes: "",
  recordedAt: "2026-09-07T00:00:00.000Z"
};

describe("実機結果", () => {
  it("iPhone 17の完了結果を許可する", () => expect(validateDeviceResult(base)).toEqual([]));
  it("iPhone 13 miniは小画面確認を必須にする", () => {
    expect(validateDeviceResult({ ...base, deviceModel: "iPhone 13 mini", smallScreenUsable: false }).join(" ")).toContain("小画面");
  });
  it("Fold8は内外画面と開閉保持を必須にする", () => {
    const errors = validateDeviceResult({ ...base, deviceModel: "Galaxy Z Fold8" });
    expect(errors).toHaveLength(3);
  });
});
