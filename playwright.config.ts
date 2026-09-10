import { defineConfig } from "@playwright/test";
import { loadTestEnv } from "./tests/live-db/env";
loadTestEnv();

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/baselines/{projectName}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: {
    timeout: 12_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" },
  },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    browserName: "chromium",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    colorScheme: "light",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "client",
      testMatch: "**/client*.spec.ts",
      use: {
        baseURL: "http://localhost:3000",
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "admin",
      testMatch: "**/admin*.spec.ts",
      use: {
        baseURL: "http://localhost:3001",
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer:
    process.env.CAPTURE_LEGACY_BASELINE === "1"
      ? undefined
      : [
          {
            command: "node scripts/serve-test.mjs client",
            url: "http://localhost:3000",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
          {
            command: "node scripts/serve-test.mjs admin",
            url: "http://localhost:3001/admin/login",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
});
