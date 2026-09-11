/**
 * 첫 관리자(owner) 생성 / 비밀번호 갱신.
 *
 *   node --env-file=.env scripts/create-admin.mjs [비밀번호]
 *
 * ADMIN_ID(기본값 ttokttok.admin)를 로그인 ID로 쓴다. 관리자 로그인 ID는
 * 이메일 형식이 아니므로 라우팅되지 않는 도메인을 붙여 auth.users에 담는다
 * (packages/shared/src/admin-id.ts).
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

const email = adminIdToEmail(adminId);

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 비밀번호는 저장소에 남기지 않는다 — 인자로 받거나 즉석에서 만들어 한 번만 출력한다.
const password = process.argv[2] ?? randomBytes(12).toString("base64url");
const generated = !process.argv[2];

async function run() {
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

  const { error: acctErr } = await db
    .from("admin_accounts")
    .upsert({ id: userId, name: "관리자", level: "owner", is_active: true });
  if (acctErr) throw new Error(`관리자 등록: ${acctErr.message}`);
  console.log("✓ admin_accounts 등록 (level = owner)");

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
