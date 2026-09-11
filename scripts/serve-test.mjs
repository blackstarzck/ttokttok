import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadTestEnv } from "../tests/live-db/env.ts";

loadTestEnv();
const app = process.argv[2];
if (!["client", "admin"].includes(app))
  throw new Error("Expected client or admin");
// 포트는 .env.test의 CLIENT_URL/ADMIN_URL(scripts/test-db.mjs가 쓴 값)이 단일
// 출처다 — 여기 다시 적어두면 포트를 옮길 때 또 어긋난다.
const port = new URL(
  process.env[app === "client" ? "CLIENT_URL" : "ADMIN_URL"],
).port;
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "start", "-p", port],
  { cwd: `apps/${app}`, env: process.env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
