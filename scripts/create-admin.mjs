/**
 * 관리자 계정 생성/갱신.
 *
 *   node --env-file=.env scripts/create-admin.mjs [비밀번호]
 *
 * 왜 이메일+비밀번호인가: 서비스 사용자 인증은 소셜로그인만이고 이메일
 * 가입은 없다(PRD §5.8). 하지만 그건 **공개 가입** 얘기고, 어드민은
 * 내부 도구다. 소셜로그인은 Supabase 대시보드에 구글/카카오 앱을 등록해야
 * 동작하는데, 그 설정 없이도 관리자가 콘텐츠를 넣을 수 있어야 한다.
 *
 * 공개 가입 경로는 열지 않는다 — 계정은 이 스크립트(service role)로만
 * 만들어진다. 결정 기록 §11-33 참조.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;

if (!url || !serviceKey || !email) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_EMAIL 이 필요하다.",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 비밀번호는 저장소에 남기지 않는다 — 인자로 받거나 즉석에서 만들어 한 번만 출력한다.
const password =
  process.argv[2] ?? randomBytes(12).toString("base64url");
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
    });
    if (error) throw new Error(`비밀번호 갱신: ${error.message}`);
    userId = existing.id;
    console.log(`✓ 기존 계정 비밀번호 갱신: ${email}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 메일 발송 없이 바로 사용 가능하게
    });
    if (error) throw new Error(`계정 생성: ${error.message}`);
    userId = data.user.id;
    console.log(`✓ 계정 생성: ${email}`);
  }

  // 프로필은 트리거가 만들지만, 생성 직후라면 아직 없을 수 있다.
  const { error: roleErr } = await db
    .from("profiles")
    .upsert({ id: userId, nickname: "관리자", role: "admin" });
  if (roleErr) throw new Error(`role 부여: ${roleErr.message}`);
  console.log("✓ role = admin");

  if (generated) {
    console.log(`\n비밀번호(이번에만 표시): ${password}`);
    console.log("안전한 곳에 보관할 것. 저장소에는 남지 않는다.");
  }
  console.log(`\n로그인: ${process.env.NEXT_PUBLIC_SITE_URL}/admin/login`);
}

run().catch((err) => {
  console.error("\n✗ 실패:", err.message);
  process.exit(1);
});
