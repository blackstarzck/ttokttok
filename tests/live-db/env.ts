import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function loadTestEnv() {
  Object.assign(process.env, parseEnv(readFileSync(".env.test", "utf8")));
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54421") {
    throw new Error(
      "Tests only run against the isolated local ttokttok-e2e database on port 54421",
    );
  }
}
