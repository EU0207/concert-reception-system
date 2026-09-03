import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 360_000 });

test("generates tickets, decodes QR, enforces rules, and remains usable offline", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "実機QR・電子チケット確認" })).toBeVisible();
  await page.evaluate(() => window.__poc003.prepare());

  const ticketCount = await page.evaluate(async () => (await window.__poc003.listTickets()).length);
  expect(ticketCount).toBe(500);

  const decoded = await page.evaluate(() => window.__poc003.decodeGeneratedQr(0));
  expect(decoded).toBe("FAKE-P003-QR-0001-V1");

  const firstDecision = await page.evaluate(() => window.__poc003.acceptDecoded("FAKE-P003-QR-0001-V1"));
  expect(firstDecision.status).toBe("accepted");
  const lockedDecision = await page.evaluate(() => window.__poc003.acceptDecoded("FAKE-P003-QR-0002-V1"));
  expect(lockedDecision.status).toBe("locked");
  await page.evaluate(() => window.__poc003.next());
  expect((await page.evaluate(() => window.__poc003.acceptDecoded("FAKE-P003-QR-0002-V1"))).status).toBe("accepted");

  const pdf = await page.evaluate(() => window.__poc003.generatePdf());
  expect(pdf.bytes.length).toBeGreaterThan(10_000);
  expect(pdf.inspection.pageCount).toBe(1);
  expect(pdf.inspection.width).toBeCloseTo(297.64, 1);
  expect(pdf.inspection.height).toBeCloseTo(419.53, 1);

  const original = (await page.evaluate(async () => (await window.__poc003.listTickets())[0]))!;
  const seatChanged = await page.evaluate(() => window.__poc003.changeFirstSeat());
  expect(seatChanged.qrToken).toBe(original.qrToken);
  expect(seatChanged.seat.number).toBe("12番");
  const reissued = await page.evaluate(() => window.__poc003.reissueFirst());
  expect(reissued.qrToken).not.toBe(original.qrToken);
  await page.evaluate(() => window.__poc003.next());
  expect((await page.evaluate((token) => window.__poc003.acceptDecoded(token), original.qrToken)).status).toBe("invalidated");
  await page.evaluate(() => window.__poc003.next());
  expect((await page.evaluate((token) => window.__poc003.acceptDecoded(token), reissued.qrToken)).status).toBe("accepted");

  const zip = await page.evaluate(() => window.__poc003.generateZip(500));
  expect(zip.fileCount).toBe(500);
  expect(new Set(zip.fileNames).size).toBe(500);
  expect(zip.fileNames[0]).toBe("FAKE-P003-0001.pdf");
  expect(zip.fileNames[499]).toBe("FAKE-P003-0500.pdf");
  expect(zip.size).toBeGreaterThan(1_000_000);
  expect(zip.size).toBeLessThan(250 * 1024 * 1024);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => setTimeout(resolve, 500));
  });
  await page.reload();
  await page.evaluate(() => window.__poc003.prepare());
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "実機QR・電子チケット確認" })).toBeVisible();
  const offlineDecision = await page.evaluate(() => window.__poc003.acceptDecoded("FAKE-P003-QR-0010-V1"));
  expect(offlineDecision.status).toBe("accepted");
  expect(await page.evaluate(() => window.__poc003.receptionCount())).toBeGreaterThan(0);
});
