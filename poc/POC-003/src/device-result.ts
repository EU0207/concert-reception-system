export interface DeviceResult {
  deviceModel: "iPhone 17" | "iPhone 13 mini" | "Galaxy Z Fold8";
  osVersion: string;
  browserVersion: string;
  paperScans: number;
  screenScans: number;
  maximumScanMs: number;
  cameraPermission: boolean;
  continuousReadLock: boolean;
  offlineReception: boolean;
  foldOuter?: boolean;
  foldInner?: boolean;
  foldStateRetained?: boolean;
  notes: string;
  recordedAt: string;
}

export function validateDeviceResult(result: DeviceResult): string[] {
  const errors: string[] = [];
  if (!result.osVersion.trim()) errors.push("OS版を入力してください。");
  if (!result.browserVersion.trim()) errors.push("ブラウザー版を入力してください。");
  if (result.paperScans < 5) errors.push("紙からの読取りを5回以上実施してください。");
  if (result.screenScans < 5) errors.push("別端末画面からの読取りを5回以上実施してください。");
  if (result.maximumScanMs <= 0 || result.maximumScanMs > 10_000) {
    errors.push("最大読取り時間が10秒以内であることを確認してください。");
  }
  if (!result.cameraPermission) errors.push("カメラ許可後の起動を確認してください。");
  if (!result.continuousReadLock) errors.push("連続読取り防止を確認してください。");
  if (!result.offlineReception) errors.push("完全オフライン受付を確認してください。");
  if (result.deviceModel === "Galaxy Z Fold8") {
    if (!result.foldOuter) errors.push("Fold8外側画面を確認してください。");
    if (!result.foldInner) errors.push("Fold8内側画面を確認してください。");
    if (!result.foldStateRetained) errors.push("Fold8開閉後の状態保持を確認してください。");
  }
  return errors;
}
