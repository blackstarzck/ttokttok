import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { loadTestEnv } from "../tests/live-db/env.ts";

loadTestEnv();
const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
for (const app of ["client", "admin"]) {
  const result = spawnSync(process.execPath, [next, "build"], {
    cwd: `apps/${app}`,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
