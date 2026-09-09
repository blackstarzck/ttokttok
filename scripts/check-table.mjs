/**
 * 표가 실제로 있는지, 몇 행인지 확인한다. 읽기만 한다.
 *
 *   node --env-file=.env scripts/check-table.mjs wikisource_works
 *   node --env-file=.env scripts/check-table.mjs wikisource_works --sample
 *
 * **`select('*', { count: 'exact', head: true })`를 확인에 쓰지 말 것.** 없는
 * 표에도 오류 없이 204와 `count: null`을 돌려준다 — 실제로 그렇게 쓴 확인
 * 명령이 "✓ 표 있음"을 출력했고, 표는 없었다. 대조군으로 존재하지 않는 이름을
 * 넣어 보면 있는 표와 응답이 구별되지 않는다. 그래서 행을 실제로 조회해
 * 판정한다.
 *
 * service role 키를 쓰므로 RLS를 우회한다 — 표가 있는지와 정책이 맞는지는
 * 다른 질문이고, 이 스크립트는 앞의 것만 답한다.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다.\n" +
      "실행: node --env-file=.env scripts/check-table.mjs <표이름>",
  );
  process.exit(1);
}

const table = process.argv[2];
if (!table) {
  console.error("표 이름이 필요하다. 예: scripts/check-table.mjs wikisource_works");
  process.exit(1);
}

const sample = process.argv.includes("--sample");

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error, count } = await db
  .from(table)
  .select("*", { count: "exact" })
  .limit(sample ? 5 : 1);

if (error) {
  console.log(`✗ ${table}: ${error.message}`);
  process.exit(1);
}

console.log(`✓ ${table} 있음 — 행 ${count}개`);

if (sample && data.length) {
  console.table(data);
}
