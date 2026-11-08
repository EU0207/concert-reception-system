// Auth・RTDBエミュレーターが起動している間だけ、製品SDKをブラウザーで試験する。
import base from '../../playwright.config.mjs';
import { fileURLToPath } from 'node:url';

export default {
  ...base,
  testDir: '.',
  testMatch: '*.spec.mjs',
  // 架空資格でもAuthトークンを試験成果へ残さないため、通信トレースを保存しない。
  use: { ...base.use, trace: 'off' },
  webServer: base.webServer.map((server) => ({
    ...server,
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
  })),
};
