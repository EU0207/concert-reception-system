import type { DeviceResult } from "./repository";

export function validateDeviceResult(result: DeviceResult): string[] {
  const errors: string[] = [];
  if (!result.osVersion.trim()) errors.push("OS版を入力してください。");
  if (!result.preparedImages) errors.push("5画像と座席一覧の事前取得を確認してください。");
  if (!result.offlineReload) errors.push("完全オフラインでのページ更新を確認してください。");
  if (!result.browserRestart) errors.push("完全オフラインでのブラウザー再起動を確認してください。");
  if (!result.currentSeatVisible) errors.push("現在席の強調表示を確認してください。");
  if (!result.fallbackListVisible) errors.push("画像なし代替一覧を確認してください。");
  if (result.deviceModel === "iPhone 13 mini" && !result.smallScreenUsable) errors.push("小画面での操作を確認してください。");
  if (result.deviceModel === "Galaxy Z Fold8") {
    if (!result.foldOuter) errors.push("Fold8外側画面を確認してください。");
    if (!result.foldInner) errors.push("Fold8内側画面を確認してください。");
    if (!result.foldStateRetained) errors.push("Fold8開閉後の状態保持を確認してください。");
  }
  return errors;
}

export function downloadDeviceResult(result: DeviceResult): void {
  const blob = new Blob([`${JSON.stringify(result, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `FAKE-P005-device-result-${result.deviceModel.replaceAll(" ", "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
