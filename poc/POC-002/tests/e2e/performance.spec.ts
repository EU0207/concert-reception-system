import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { summarizeDurations } from "../../src/metrics";
import { summarizeNetLogFile, type NetworkByteSummary } from "../support/netlog";

interface ProjectionSnapshot {
  receptions: unknown[];
  pendingCount: number;
  messages: Array<{ title: string }>;
}

interface SyncSnapshot {
  downloaded: number;
  failedEventIds: string[];
  failureMessages: string[];
}

interface MeasurementResult {
  runId: string;
  reception: ReturnType<typeof summarizeDurations>;
  totalReceptionMs: number;
  recoveryMs: number;
  sharing: ReturnType<typeof summarizeDurations>;
  networkByEnvironment: NetworkByteSummary[];
  maximumEnvironmentBytes: number;
  remoteChangeDeltas: number[];
  assertions: {
    receptionFailures: number;
    receptionMaximumWithinTenSeconds: boolean;
    receptionP95WithinTwoSeconds: boolean;
    totalWithinThirtyMinutes: boolean;
    sharingMaximumWithinTenSeconds: boolean;
    sharingP95WithinFiveSeconds: boolean;
    eachEnvironmentWithinTwentyMb: boolean;
    deltaOnlyAfterInitialSync: boolean;
  };
}

test("500件の判定・復旧・30変更の共有時間と環境別通信量を測定する", async () => {
  test.setTimeout(600_000);
  const runId = process.env.POC_RUN_ID ?? `POC-002-LOCAL-${Date.now()}`;
  const sessionRoot = path.resolve("artifacts", "raw", `session-${runId}`);
  const profiles = Array.from({ length: 6 }, (_, index) => path.join(sessionRoot, `profile-${index + 1}`));
  const netLogs = Array.from({ length: 6 }, (_, index) => path.join(sessionRoot, `device-${index + 1}.netlog.json`));
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  await mkdir(sessionRoot, { recursive: true });

  try {
    // The immutable run parent is initialized once before parallel measurement activity.
    // This keeps the security rule update prohibition while avoiding a create race.
    for (let index = 0; index < profiles.length; index += 1) {
      const context = await chromium.launchPersistentContext(profiles[index] ?? "", { headless: true });
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(urlFor(runId, index));
      await page.evaluate(() => window.pocTest.prepareLocal());
      await page.evaluate(() => window.pocTest.connect());
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      await context.close();
    }

    for (let index = 0; index < 6; index += 1) {
      const context = await chromium.launchPersistentContext(profiles[index] ?? "", {
        headless: true,
        args: [
          `--log-net-log=${netLogs[index]}`,
          "--net-log-max-size-mb=50"
        ]
      });
      contexts.push(context);
      const page = context.pages()[0] ?? (await context.newPage());
      pages.push(page);
      await page.goto(urlFor(runId, index));
      await page.evaluate(() => window.pocTest.prepareLocal());
      await page.evaluate(() => window.pocTest.connect());
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    }

    const authUids = await Promise.all(pages.map((page) => page.evaluate(() => window.pocTest.authIdentity())));
    if (process.env.VITE_USE_FIREBASE_EMULATOR === "false") {
      await writeFile(
        path.resolve("artifacts", "raw", `auth-uids-${runId}.json`),
        JSON.stringify({ runId, authUids }),
        "utf8"
      );
    }

    await Promise.all(contexts.map((context) => context.setOffline(true)));
    await Promise.all(
      pages.map((page) => expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false))
    );
    await Promise.all(pages.map((page) => expect(page.getByText("オフライン")).toBeVisible()));

    const receptionStartedAt = performance.now();
    const receptionResults = await Promise.all(
      pages.map((page, pageIndex) =>
        page.evaluate(async ({ pageIndex }) => {
          const durations: number[] = [];
          const failures: string[] = [];
          for (let qrNumber = pageIndex + 1; qrNumber <= 500; qrNumber += 6) {
            const qrId = `FAKE-P002-QR-${String(qrNumber).padStart(4, "0")}`;
            try {
              const result = await window.pocTest.recordReceptionTimed(qrId);
              durations.push(result.durationMs);
            } catch (error) {
              failures.push(error instanceof Error ? error.message : String(error));
            }
          }
          return { durations, failures };
        }, { pageIndex })
      )
    );
    const totalReceptionMs = performance.now() - receptionStartedAt;
    const receptionDurations = receptionResults.flatMap((result) => result.durations);
    const receptionFailures = receptionResults.flatMap((result) => result.failures);
    expect(receptionFailures).toEqual([]);
    expect(receptionDurations).toHaveLength(500);

    const recoveryStartedAt = performance.now();
    await Promise.all(contexts.map((context) => context.setOffline(false)));
    await Promise.all(
      pages.map((page) =>
        expect.poll(async () => {
          const result = await page.evaluate(() => window.pocTest.sync()) as SyncSnapshot;
          const projection = await page.evaluate(() => window.pocTest.projection()) as ProjectionSnapshot;
          return {
            failed: result.failedEventIds.length,
            message: result.failureMessages[0] ?? "",
            pending: projection.pendingCount,
            events: await page.evaluate(() => window.pocTest.eventCount())
          };
        }, { intervals: [100, 250, 500, 1_000], timeout: 180_000 }).toEqual({
          failed: 0,
          message: "",
          pending: 0,
          events: 500
        })
      )
    );
    const recoveryMs = performance.now() - recoveryStartedAt;
    const remoteChangeBaselines = await Promise.all(
      pages.map((page) => page.evaluate(() => window.pocTest.remoteChangeCount()))
    );

    const sharingDurations: number[] = [];
    for (let changeIndex = 0; changeIndex < 30; changeIndex += 1) {
      const senderIndex = changeIndex % 6;
      const sender = pages[senderIndex];
      if (!sender) throw new Error(`送信元環境${senderIndex + 1}がありません。`);
      const expectedCount = 501 + changeIndex;
      const title = `POC-002架空変更-${String(changeIndex + 1).padStart(2, "0")}`;
      const startedAt = performance.now();
      await sender.evaluate((messageTitle) =>
        window.pocTest.postMessage(messageTitle, "共有時間測定用の架空本文", "normal"), title
      );
      const push = await sender.evaluate(() => window.pocTest.pushPending()) as SyncSnapshot;
      expect(push.failedEventIds).toEqual([]);
      const receiverDurations = await Promise.all(
        pages.map(async (page, pageIndex) => {
          if (pageIndex === senderIndex) return undefined;
          await expect.poll(() => page.evaluate(() => window.pocTest.eventCount()), {
            intervals: [10, 25, 50, 100],
            timeout: 10_000
          }).toBe(expectedCount);
          return performance.now() - startedAt;
        })
      );
      sharingDurations.push(...receiverDurations.filter((value): value is number => value !== undefined));
    }
    expect(sharingDurations).toHaveLength(150);

    const remoteChangeTotals = await Promise.all(
      pages.map((page) => page.evaluate(() => window.pocTest.remoteChangeCount()))
    );
    const remoteChangeDeltas = remoteChangeTotals.map(
      (total, index) => total - (remoteChangeBaselines[index] ?? 0)
    );
    expect(remoteChangeDeltas).toEqual([30, 30, 30, 30, 30, 30]);

    await Promise.all(contexts.splice(0).map((context) => context.close()));
    const networkByEnvironment = await Promise.all(netLogs.map(summarizeNetLogFile));
    const reception = summarizeDurations(receptionDurations);
    const sharing = summarizeDurations(sharingDurations);
    const maximumEnvironmentBytes = Math.max(...networkByEnvironment.map((summary) => summary.totalBytes));
    const result: MeasurementResult = {
      runId,
      reception,
      totalReceptionMs: round(totalReceptionMs),
      recoveryMs: round(recoveryMs),
      sharing,
      networkByEnvironment,
      maximumEnvironmentBytes,
      remoteChangeDeltas,
      assertions: {
        receptionFailures: receptionFailures.length,
        receptionMaximumWithinTenSeconds: reception.maximumMs <= 10_000,
        receptionP95WithinTwoSeconds: reception.p95Ms <= 2_000,
        totalWithinThirtyMinutes: totalReceptionMs <= 30 * 60 * 1_000,
        sharingMaximumWithinTenSeconds: sharing.maximumMs <= 10_000,
        sharingP95WithinFiveSeconds: sharing.p95Ms <= 5_000,
        eachEnvironmentWithinTwentyMb: networkByEnvironment.every(
          (summary) => summary.totalBytes <= 20 * 1024 * 1024
        ),
        deltaOnlyAfterInitialSync: remoteChangeDeltas.every((count) => count === 30)
      }
    };
    await writeFile(
      path.resolve("artifacts", "raw", "latest-measurement.json"),
      JSON.stringify(result, null, 2),
      "utf8"
    );
    console.log(`POC002_RESULT ${JSON.stringify(result)}`);

    expect(result.assertions.receptionMaximumWithinTenSeconds).toBe(true);
    expect(result.assertions.totalWithinThirtyMinutes).toBe(true);
    expect(result.assertions.sharingMaximumWithinTenSeconds).toBe(true);
    expect(result.assertions.eachEnvironmentWithinTwentyMb).toBe(true);
    expect(result.assertions.deltaOnlyAfterInitialSync).toBe(true);

    await rm(sessionRoot, { recursive: true, force: true });
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

function urlFor(runId: string, index: number): string {
  const query = new URLSearchParams({
    run: runId,
    device: `poc-002-device-${index + 1}`,
    actor: `poc-002-actor-${index + 1}`
  });
  return `http://127.0.0.1:4173/?${query}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
