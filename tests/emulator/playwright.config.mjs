// Auth・RTDBエミュレーターが起動している間だけ、製品SDKをブラウザーで試験する。
import base from "../../playwright.config.mjs";
import { fileURLToPath } from "node:url";

export default {
  ...base,
  testDir: ".",
  testMatch: "*.spec.mjs",
  webServer: base.webServer.map((server) => ({
    ...server,
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
  })),
};
