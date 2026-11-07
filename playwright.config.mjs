// ブラウザー自動試験の設定。スマホ幅のChromium確認は実機試験と区別する。

import { defineConfig, devices } from '@playwright/test';

// # 本文：ブラウザー試験と起動サーバーの設定

export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'phone-layout',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'node scripts/serve-app.mjs',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      // 製品の保存モジュールを、実際のブラウザー内で直接試験する。
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4181 --strictPort',
      url: 'http://127.0.0.1:4181',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
