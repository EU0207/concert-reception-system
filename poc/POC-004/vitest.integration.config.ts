import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/firebase-emulator.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false
  }
});
