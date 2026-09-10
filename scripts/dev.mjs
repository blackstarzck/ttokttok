import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const cli = require.resolve("next/dist/bin/next");
const mode = process.argv.includes("--production") ? "start" : "dev";
const children = ["client", "admin"].map((app, index) =>
  spawn(process.execPath, [cli, mode, "-p", String(3000 + index)], {
    cwd: fileURLToPath(new URL(`../apps/${app}/`, import.meta.url)),
    stdio: "inherit",
  }),
);
function stop() {
  for (const child of children) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children)
  child.on("exit", (code) => {
    if (code) {
      stop();
      process.exitCode = code;
    }
  });
