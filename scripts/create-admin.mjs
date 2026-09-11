/**
 * 첫 관리자(owner) 생성 / 비밀번호 갱신.
 *
 *   node --env-file=.env scripts/create-admin.mjs [비밀번호] [--reactivate]
 *
 * ADMIN_ID(기본값 ttokttok.admin)를 로그인 ID로 쓴다. 관리자 로그인 ID는
 * 이메일 형식이 아니므로 라우팅되지 않는 도메인을 붙여 auth.users에 담는다
 * (packages/shared/src/admin-id.ts).
 *
 * admin_accounts 행이 이미 있으면 level·is_active·name은 건드리지 않는다 —
 * 이 스크립트가 하는 일은 auth.users 비밀번호 갱신뿐이다. 그 행이
 * is_active = false(의도적으로 차단한 계정)이면 비밀번호를 갱신해도 차단은
 * 그대로 두고 그 사실을 출력한다. 다시 켜려면 --reactivate 를 붙여야 한다 —
 * 그러지 않으면 차단 해제 의도가 전혀 없는 비밀번호 갱신이 조용히 계정을
 * 되살리는 사고를 막는다.
 *
 * **`/admin/accounts` 화면이 생겨도 이 스크립트는 남는다** — 첫 owner를 만들
 * 경로가 달리 없다. 화면은 owner로 로그인해야 열리고, 그러려면 owner가 이미
 * 있어야 한다.
 *
 * 공개 가입 경로는 열지 않는다. 결정 기록 §11-33 참조.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminIdToEmail } from "../packages/shared/src/admin-id.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminId = process.env.ADMIN_ID ?? "ttokttok.admin";

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다.",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const reactivate = process.argv.includes("--reactivate");

// 비밀번호는 저장소에 남기지 않는다 — 인자로 받거나 즉석에서 만들어 한 번만
// 출력한다. --reactivate 가 그 자리를 차지할 수 있으니 플래그가 아닌 첫
// 인자만 비밀번호로 읽는다.
const passwordArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const password = passwordArg ?? randomBytes(12).toString("base64url");
const generated = !passwordArg;

async function run() {
  // 형식이 안 맞는 ADMIN_ID는 여기서 던져야 run().catch()의 "✗ 실패:" 처리를
  // 타서 스택 트레이스 대신 정리된 메시지가 나온다.
  const email = adminIdToEmail(adminId);

  const { data: list, error: listErr } = await db.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);

  const existing = list.users.find((u) => u.email === email);
  let userId;

  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { ttokttok_admin: true },
    });
    if (error) throw new Error(`비밀번호 갱신: ${error.message}`);
    userId = existing.id;
    console.log(`✓ 기존 계정 비밀번호 갱신: ${adminId}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 메일 발송 없이 바로 사용 가능하게
      app_metadata: { ttokttok_admin: true },
    });
    if (error) throw new Error(`계정 생성: ${error.message}`);
    userId = data.user.id;
    console.log(`✓ 계정 생성: ${adminId}`);
  }

  // 트리거의 표식 건너뛰기는 이 경로에서 먹지 않는다. GoTrue의 admin API는
  // app_metadata를 INSERT 이후에 붙여, 트리거가 도는 시점에는 표식이 없다
  // (2026-09-11 로컬 실측 — 프로필이 실제로 생겼다). 지우는 쪽이 본 방어다.
  const { error: profErr } = await db
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profErr) throw new Error(`프로필 정리: ${profErr.message}`);

  // upsert로 덮으면 기존 행의 is_active를 항상 true로 되돌린다 — 의도적으로
  // 비활성화한 계정에 비밀번호만 갱신해도 조용히 살아 있는 owner가 된다.
  // 그래서 기존 행이 있으면 level·is_active·name은 절대 건드리지 않고,
  // 비활성 상태를 되돌리는 것은 --reactivate 를 명시했을 때만 허용한다.
  const { data: existingAccount, error: readErr } = await db
    .from("admin_accounts")
    .select("level, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) throw new Error(`관리자 조회: ${readErr.message}`);

  if (!existingAccount) {
    const { error } = await db
      .from("admin_accounts")
      .insert({ id: userId, name: "관리자", level: "owner", is_active: true });
    if (error) throw new Error(`관리자 등록: ${error.message}`);
    console.log("✓ admin_accounts 등록 (level = owner)");
  } else if (existingAccount.is_active) {
    console.log(`· admin_accounts 행 유지 (level = ${existingAccount.level})`);
  } else if (reactivate) {
    const { error } = await db
      .from("admin_accounts")
      .update({ is_active: true })
      .eq("id", userId);
    if (error) throw new Error(`재활성화: ${error.message}`);
    console.log("✓ 비활성 상태였던 계정을 다시 활성화했다");
  } else {
    console.log(
      "\n⚠ 이 계정은 비활성 상태다 — 비밀번호는 갱신했지만 차단은 그대로다.",
    );
    console.log("  다시 켜려면 --reactivate 를 붙여 실행할 것.");
  }

  if (generated) {
    console.log(`\n비밀번호(이번에만 표시): ${password}`);
    console.log("안전한 곳에 보관할 것. 저장소에는 남지 않는다.");
  }
  console.log(`\n로그인 ID: ${adminId}`);
  console.log(`로그인: ${process.env.NEXT_PUBLIC_SITE_URL}/admin/login`);
}

run().catch((err) => {
  console.error("\n✗ 실패:", err.message);
  process.exit(1);
});
