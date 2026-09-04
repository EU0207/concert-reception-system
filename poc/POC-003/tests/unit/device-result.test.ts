import { describe, expect, it } from "vitest";
import { validateDeviceResult, type DeviceResult } from "../../src/device-result";

const complete: DeviceResult = {
  deviceModel: "iPhone 17",
  osVersion: "iOS 26.6.1",
  browserVersion: "Safari 26.6",
  paperScans: 5,
  screenScans: 5,
  maximumScanMs: 1500,
  cameraPermission: true,
  continuousReadLock: true,
  offlineReception: true,
  notes: "架空データだけで確認",
  recordedAt: "2026-09-03T00:00:00.000Z"
};

describe("device result validation", () => {
  it("accepts a complete iPhone result", () => {
    expect(validateDeviceResult(complete)).toEqual([]);
  });

  it("requires both Fold8 screen modes and retained state", () => {
    const fold: DeviceResult = { ...complete, deviceModel: "Galaxy Z Fold8" };
    expect(validateDeviceResult(fold)).toHaveLength(3);
    expect(validateDeviceResult({ ...fold, foldOuter: true, foldInner: true, foldStateRetained: true })).toEqual([]);
  });

  it("rejects incomplete scans and an over-limit duration", () => {
    expect(validateDeviceResult({ ...complete, paperScans: 4, maximumScanMs: 10_001 })).toHaveLength(2);
  });
});
