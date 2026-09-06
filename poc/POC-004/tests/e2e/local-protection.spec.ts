import { expect, test } from "@playwright/test";

test("prepares, protects restricted values and clears local data", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "権限・暗号化・端末削除の検証" })).toBeVisible();
  await expect(page.getByText("期限切れ件数と削除ボタンを表示して削除を案内します", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "オフライン開始確認" }).click();
  await expect(page.locator("#offline-result")).toHaveText("開始不可");

  await page.getByRole("button", { name: "開催前準備" }).click();
  await expect(page.locator("#prepared")).toContainText("owner / 500件");
  await page.reload();
  await expect(page.locator("#prepared")).toContainText("owner / 500件");

  await context.setOffline(true);
  await page.getByRole("button", { name: "オフライン開始確認" }).click();
  await expect(page.locator("#offline-result")).toHaveText("開始可能");
  await context.setOffline(false);

  await page.locator("#role").selectOption("receptionist");
  await page.getByRole("button", { name: "任意項目を暗号化保存" }).click();
  await expect(page.locator("#message")).toContainText("配布しません");
  await expect(page.locator("#encrypted-count")).toHaveText("0件");

  await page.locator("#role").selectOption("owner");
  await page.getByRole("button", { name: "任意項目を暗号化保存" }).click();
  await expect(page.locator("#encrypted-count")).toHaveText("1件");
  await expect(page.locator("#plaintext-result")).toHaveText("混入なし");
  await page.getByRole("button", { name: "任意項目を復号" }).click();
  await expect(page.locator("#decrypted")).toContainText("架空の連絡メモ");

  await page.getByRole("button", { name: "期限切れ削除" }).click();
  await expect(page.locator("#encrypted-count")).toHaveText("0件");

  await page.getByRole("button", { name: "端末データ削除" }).click();
  await expect(page.locator("#cleanup-result")).toHaveText("対象保存領域を削除済み");
  await expect(page.locator("#prepared")).toHaveText("未実施");
});
