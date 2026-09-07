import { expect, test } from "@playwright/test";

test("事前取得後に完全オフラインで座席表と5画像を復元する", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "座席と画像を事前取得" }).click();
  await expect(page.getByText("事前取得が完了しました。機内モードの確認へ進めます。")).toBeVisible();
  await expect(page.locator("#image-gallery img")).toHaveCount(1);
  await expect(page.locator("#image-position")).toHaveText("1 / 5");
  await page.getByRole("button", { name: "次の画像" }).click();
  await expect(page.locator("#image-position")).toHaveText("2 / 5");
  await page.locator("#image-gallery").dispatchEvent("pointerdown", { clientX: 300, clientY: 120, pointerType: "touch" });
  await page.locator("#image-gallery").dispatchEvent("pointerup", { clientX: 100, clientY: 125, pointerType: "touch" });
  await expect(page.locator("#image-position")).toHaveText("3 / 5");
  await page.getByRole("button", { name: "画像を拡大" }).click();
  await expect(page.getByRole("button", { name: "125%" })).toBeVisible();
  await expect(page.locator("#seat-map .seat")).toHaveCount(300);
  await expect(page.locator("#seat-map .seat-divider")).toHaveCount(15);
  await page.reload();
  await expect(page.getByText("準備完了")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  const uncachedNetworkFailed = await page.evaluate(async () => {
    try {
      await fetch(`/not-cached-${Date.now()}.txt`);
      return false;
    } catch {
      return true;
    }
  });
  expect(uncachedNetworkFailed).toBe(true);
  await expect(page.locator("#image-gallery img")).toHaveCount(1);
  await expect(page.locator("#seat-map .seat.selected")).toContainText("現在席");
  await context.setOffline(false);
});

test("画像なし代替と小画面・Fold相当の幅変更で現在席を保持する", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "画像なしの代替一覧を確認" }).click();
  await expect(page.getByText("受付は下の座席一覧で継続できます。")).toBeVisible();
  await expect(page.locator("#fallback-list")).toContainText("現在席");
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator("#seat-map .seat.selected")).toBeVisible();
  await page.setViewportSize({ width: 884, height: 1104 });
  await expect(page.locator("#seat-map .seat.selected")).toContainText("現在席");
});
