import { defineConfig } from "@playwright/test";
import { FIRST, PORT } from "./tests/helpers/env.js";

// Specs that peg a CPU core or measure main-thread stalls. They run after
// everything else, one at a time, so other tests can't skew them.
const CPU_SENSITIVE = /(heavy-ads-cpu|performance)\.spec\.js$/;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  // Each test starts its own Chromium; four at once keeps memory in check
  workers: 4,
  reporter: [["list"]],
  webServer: {
    command: "node tests/server.js",
    url: `${FIRST}/health`,
    reuseExistingServer: !process.env.CI,
    env: { FIXTURE_PORT: String(PORT) },
  },
  projects: [
    { name: "main", testIgnore: CPU_SENSITIVE },
    { name: "cpu", testMatch: CPU_SENSITIVE, workers: 1, dependencies: ["main"] },
  ],
});
