import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadTestEnv } from "../tests/live-db/env.ts";

loadTestEnv();
const app = process.argv[2];
if (!["client", "admin"].includes(app))
  throw new Error("Expected client or admin");
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "-p",
    app === "client" ? "3000" : "3001",
  ],
  { cwd: `apps/${app}`, env: process.env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
