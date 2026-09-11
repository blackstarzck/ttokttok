import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function loadTestEnv() {
  Object.assign(process.env, parseEnv(readFileSync(".env.test", "utf8")));
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54421") {
    throw new Error(
      "Tests only run against the isolated local ttokttok-e2e database on port 54421",
    );
  }
  // CLIENT_URL/ADMIN_URL의 단일 출처는 이 .env.test다(scripts/test-db.mjs가 쓴다).
  // 브랜치를 옮기거나 예전에 만든 .env.test가 남아 있으면 여기 3000/3001(개발
  // 서버 포트)이 그대로 남을 수 있는데, 그 값으로 playwright.config.ts가 e2e를
  // 돌리면 reuseExistingServer가 운영 Supabase에 붙은 개발 서버를 조용히
  // 재사용한다 — 값이 없으면(undefined) 바로 터지지만 낡은 값은 그렇지 않다.
  if (process.env.CLIENT_URL !== "http://localhost:3003") {
    throw new Error(
      "CLIENT_URL must be http://localhost:3003, not the dev server on 3000 — " +
        "run `npm run test:db` again to regenerate .env.test.",
    );
  }
  if (process.env.ADMIN_URL !== "http://localhost:3004") {
    throw new Error(
      "ADMIN_URL must be http://localhost:3004, not the dev server on 3001 — " +
        "run `npm run test:db` again to regenerate .env.test.",
    );
  }
}
