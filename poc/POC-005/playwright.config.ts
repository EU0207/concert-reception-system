import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "artifacts/raw/playwright-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js preview`,
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
