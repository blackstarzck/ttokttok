import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workdir = path.join(root, ".tmp", "supabase-e2e");
const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
mkdirSync(path.join(workdir, "supabase"), { recursive: true });
cpSync(
  path.join(root, "supabase", "migrations"),
  path.join(workdir, "supabase", "migrations"),
  { recursive: true },
);
const config = readFileSync(path.join(root, "supabase", "config.toml"), "utf8")
  .replace('project_id = "ttokttok"', 'project_id = "ttokttok-e2e"')
  .replaceAll("5432", "5442")
  .replace("# auto_expose_new_tables = false", "auto_expose_new_tables = true")
  .replace('sql_paths = ["./seed.sql"]', "sql_paths = []");
writeFileSync(path.join(workdir, "supabase", "config.toml"), config);
function run(args) {
  return execFileSync(process.execPath, [cli, "--workdir", workdir, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}
// A separate project/ports/volumes preserve the developer's existing local DB.
if (process.argv.includes("--stop")) {
  run(["stop"]);
  console.log("Test database stopped; its data is retained.");
} else {
  console.log("Starting isolated Supabase ttokttok-e2e on port 54421…");
  run(["start", "--exclude", "studio,logflare,vector,edge-runtime,supavisor"]);
  const status = JSON.parse(run(["status", "-o", "json"]));
  if (status.API_URL !== "http://127.0.0.1:54421")
    throw new Error("Unexpected test database URL");
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    CLIENT_URL: "http://localhost:3000",
    ADMIN_URL: "http://localhost:3001",
    TEST_ADMIN_ID: "test.admin",
    // owner가 아닌 관리자 픽스처. owner 전용 경계(admin_accounts 쓰기 등)를
    // 검증하려면 owner가 아닌 관리자 신원이 필요하다 (tests/live-db/fixtures.ts).
    TEST_STAFF_ADMIN_ID: "test.staffadmin",
    TEST_USER_EMAIL: "reader@ttokttok.test",
    TEST_PASSWORD: "Local-test-only-2026!",
  };
  if (Object.values(env).some((value) => !value))
    throw new Error("Missing local test credentials");
  writeFileSync(
    path.join(root, ".env.test"),
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
  console.log(
    "Local test environment written to ignored .env.test (credentials omitted).",
  );
  if (process.argv.includes("--types")) {
    const types = run(["gen", "types", "typescript", "--local"]);
    writeFileSync(
      path.join(root, "packages", "database", "src", "types.ts"),
      types,
    );
    console.log("Database types regenerated from repository migrations.");
  }
}
