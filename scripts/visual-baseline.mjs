import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, writeFileSync } from "node:fs";
import { seedFixtures } from "../tests/live-db/fixtures.ts";

if (!existsSync(".tmp/monorepo-baseline/src/app/admin"))
  throw new Error(
    "Preserved original app is required; do not replace baselines with migrated screenshots.",
  );
const require = createRequire(import.meta.url);
await seedFixtures();
const result = spawnSync(
  process.execPath,
  [require.resolve("@playwright/test/cli"), "test", "--grep", "@visual"],
  { env: { ...process.env, CAPTURE_LEGACY_BASELINE: "1" }, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
writeFileSync(
  "e2e/baselines/README.md",
  "# Design regression baseline\n\nCaptured from the preserved pre-migration app on localhost:3100, based on commit 2e0c6b5 plus the user's uncommitted about-page work. Chromium, ko-KR, Asia/Seoul, reduced motion; client 375×812 and 1440×1000, admin 1440×1000. Data comes from the isolated local fixture database. Never update these images from the migrated app to suppress differences.\n",
);
