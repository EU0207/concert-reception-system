import { expect, test, type BrowserContext, type Page } from "@playwright/test";

interface ProjectionSnapshot {
  receptions: unknown[];
  conflicts: Array<{ receptions: unknown[] }>;
  messages: Array<{ title: string; acknowledgedActorIds: string[] }>;
  pendingCount: number;
}

interface SyncSnapshot {
  attempted: number;
  uploaded: number;
  acknowledgedExisting: number;
  downloaded: number;
  failedEventIds: string[];
  failureMessages: string[];
}

test("500件を6環境でオフライン受付し、復旧後に競合・連絡・既読を統合する", async ({ browser }) => {
  test.setTimeout(240_000);
  const runId = process.env.POC_RUN_ID ?? `POC-001-E2E-${Date.now()}`;
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];

  try {
    for (let index = 1; index <= 6; index += 1) {
      const context = await browser.newContext({ serviceWorkers: "allow" });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await page.goto(`/?run=${runId}&device=device-${index}&actor=actor-${index}`);
      await page.evaluate(() => window.pocTest.prepareLocal());
      await page.evaluate(() => window.pocTest.connect());
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    }

    await Promise.all(contexts.map((context) => context.setOffline(true)));
    await Promise.all(pages.map((page) => page.reload()));
    await Promise.all(pages.map((page) => expect(page.getByText("オフライン")).toBeVisible()));

    await Promise.all(
      pages.map((page, pageIndex) =>
        page.evaluate(async ({ pageIndex }) => {
          for (let qrNumber = pageIndex + 1; qrNumber <= 500; qrNumber += 6) {
            await window.pocTest.recordReception(`FAKE-QR-${String(qrNumber).padStart(3, "0")}`);
          }
        }, { pageIndex })
      )
    );

    await pages[1]?.evaluate(() => window.pocTest.recordReception("FAKE-QR-001"));
    await pages[2]?.evaluate(() =>
      window.pocTest.recordReread("FAKE-QR-002", "legitimate-reentry", "架空の再入場")
    );
    const importantMessageId = await pages[0]?.evaluate(() =>
      window.pocTest.postMessage("重要な架空連絡", "復旧後に全環境へ共有する", "important")
    );
    if (!importantMessageId) throw new Error("重要連絡を作成できませんでした。");
    await Promise.all(
      pages.slice(1).map((page) =>
        page.evaluate((messageId) => window.pocTest.acknowledgeMessage(messageId), importantMessageId)
      )
    );

    const offlineProjections = await Promise.all(
      pages.map((page) => page.evaluate(() => window.pocTest.projection()) as Promise<ProjectionSnapshot>)
    );
    expect(offlineProjections.every((projection) => projection.pendingCount > 0)).toBe(true);

    await Promise.all(contexts.map((context) => context.setOffline(false)));
    await Promise.all(
      pages.map((page) =>
        expect
          .poll(
            async () => {
              const result = await page.evaluate(() => window.pocTest.sync()) as SyncSnapshot;
              const projection = await page.evaluate(() => window.pocTest.projection()) as ProjectionSnapshot;
              return {
                error: result.failureMessages[0] ?? "",
                failed: result.failedEventIds.length,
                pending: projection.pendingCount
              };
            },
            { intervals: [500, 1_000, 2_000], timeout: 120_000 }
          )
          .toEqual({ error: "", failed: 0, pending: 0 })
      )
    );
    const confirmedSyncs = await Promise.all(
      pages.map((page) => page.evaluate(() => window.pocTest.sync()) as Promise<SyncSnapshot>)
    );
    expect(confirmedSyncs.flatMap((result) => result.failedEventIds)).toHaveLength(0);
    expect(confirmedSyncs.every((result) => result.downloaded === 508)).toBe(true);

    await Promise.all(
      pages.map((page) =>
        expect
          .poll(() => page.evaluate(() => window.pocTest.eventCount()), { timeout: 30_000 })
          .toBe(508)
      )
    );

    for (const page of pages) {
      const projection = await page.evaluate(() => window.pocTest.projection()) as ProjectionSnapshot;
      expect(projection.receptions).toHaveLength(500);
      expect(projection.conflicts).toHaveLength(1);
      expect(projection.conflicts[0]?.receptions).toHaveLength(2);
      expect(projection.pendingCount).toBe(0);
      expect(projection.messages).toHaveLength(1);
      expect(projection.messages[0]?.acknowledgedActorIds).toHaveLength(5);
      expect(await page.evaluate(() => window.pocTest.eventCount())).toBe(508);
    }

    await contexts[5]?.setOffline(true);
    await pages[5]?.evaluate(() =>
      window.pocTest.postMessage("停止環境だけの架空連絡", "回収不能を模擬する", "normal")
    );
    const stoppedPending = await pages[5]?.evaluate(() => window.pocTest.projection()) as ProjectionSnapshot;
    expect(stoppedPending.pendingCount).toBe(1);
    await contexts[5]?.close();

    await pages[0]?.evaluate(() =>
      window.pocTest.postMessage("継続中の架空連絡", "残りの環境で受付を継続する", "normal")
    );
    await Promise.all(pages.slice(0, 5).map((page) => page.evaluate(() => window.pocTest.sync())));
    await Promise.all(pages.slice(0, 5).map((page) => page.evaluate(() => window.pocTest.sync())));

    await Promise.all(
      pages.slice(0, 5).map((page) =>
        expect
          .poll(
            async () => {
              const projection = await page.evaluate(() => window.pocTest.projection()) as ProjectionSnapshot;
              return projection.messages.map((message) => message.title);
            },
            { timeout: 30_000 }
          )
          .toContain("継続中の架空連絡")
      )
    );

    for (const page of pages.slice(0, 5)) {
      const projection = await page.evaluate(() => window.pocTest.projection()) as ProjectionSnapshot;
      expect(projection.messages.map((message) => message.title)).toContain("継続中の架空連絡");
      expect(projection.messages.map((message) => message.title)).not.toContain("停止環境だけの架空連絡");
      expect(projection.pendingCount).toBe(0);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});
