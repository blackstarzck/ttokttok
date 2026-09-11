import { defineConfig } from "@playwright/test";
import { loadTestEnv } from "./tests/live-db/env";
loadTestEnv();

// .env.test의 CLIENT_URL/ADMIN_URL(scripts/test-db.mjs가 쓴 값)이 단일 출처다 —
// 개발 서버(3000/3001)와 겹치면 reuseExistingServer가 그 서버를 재사용해
// 운영 Supabase에 쓰게 된다.
const clientUrl = process.env.CLIENT_URL!;
const adminUrl = process.env.ADMIN_URL!;

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
        baseURL: clientUrl,
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "admin",
      testMatch: "**/admin*.spec.ts",
      use: {
        baseURL: adminUrl,
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
            url: clientUrl,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
          {
            command: "node scripts/serve-test.mjs admin",
            url: `${adminUrl}/admin/login`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
});
