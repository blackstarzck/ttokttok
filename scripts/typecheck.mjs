import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const app of ["client", "admin"]) {
  const result = spawnSync(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "typegen"],
    { cwd: `apps/${app}`, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const project of [
  "packages/shared",
  "packages/database",
  "packages/ui",
  "packages/content",
  "apps/client",
  "apps/admin",
]) {
  const result = spawnSync(
    process.execPath,
    [require.resolve("typescript/bin/tsc"), "--noEmit", "-p", project],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
