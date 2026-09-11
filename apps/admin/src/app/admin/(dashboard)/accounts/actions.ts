"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdToEmail, isValidAdminId } from "@ttokttok/shared/admin-id";
import { requireOwner } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 관리자 계정 관리 (설계 §7).
 *
 * 모든 액션이 requireOwner로 시작한다 — 서버 액션은 미들웨어를 거치지 않을
 * 수 있다. RLS도 owner만 쓰기를 허용하므로 이중이다.
 *
 * 계정 **생성**만 service role 클라이언트를 쓴다: auth.users에 행을 만드는
 * 것은 anon 키로 할 수 없다. 등급 변경·활성 토글은 일반 클라이언트로 하며
 * RLS가 판정한다 — 그래야 "자기 행은 못 바꾼다"가 DB에서 강제된다.
 */

export async function createAdminAccount(formData: FormData) {
  const { userId } = await requireOwner();

  const adminId = String(formData.get("adminId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const level = String(formData.get("level") ?? "admin");

  if (!isValidAdminId(adminId)) {
    redirect("/admin/accounts?error=invalid_id");
  }
  if (!name || password.length < 6) {
    redirect("/admin/accounts?error=required");
  }
  if (level !== "owner" && level !== "admin") {
    redirect("/admin/accounts?error=invalid_level");
  }

  const service = createAdminClient();
  const { data, error } = await service.auth.admin.createUser({
    email: adminIdToEmail(adminId),
    password,
    email_confirm: true,
    app_metadata: { ttokttok_admin: true },
  });

  if (error) {
    redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
  }

  // 트리거의 app_metadata 건너뛰기는 이 경로에서 먹지 않는다 — GoTrue의 admin
  // API가 app_metadata를 auth.users INSERT 이후에 붙여, 트리거가 도는 시점에는
  // 표식이 없다(2026-09-11 로컬 실측 — 프로필이 실제로 생겼다. 결정 기록
  // §11-69). 여기서 지우는 것이 관리자에게 프로필이 생기지 않게 하는 본 방어다.
  const { error: profErr } = await service
    .from("profiles")
    .delete()
    .eq("id", data.user.id);
  if (profErr) {
    // 여기서 멈추면 admin_accounts 행 없는 auth 계정만 남는다 — 아래
    // acctErr와 같은 유령이다. 같은 롤백으로 없앤다: 합성 이메일이 남으면
    // 이 관리자 ID는 이 화면에서 영영 못 쓴다(재시도 시 이메일 중복 오류).
    await service.auth.admin.deleteUser(data.user.id);
    redirect(`/admin/accounts?error=${encodeURIComponent(profErr.message)}`);
  }

  const { error: acctErr } = await service.from("admin_accounts").insert({
    id: data.user.id,
    name,
    level,
    created_by: userId,
  });

  if (acctErr) {
    // auth 계정만 남고 admin_accounts 행이 없으면 로그인은 되는데 아무 권한이
    // 없는 유령이 된다. 되돌린다.
    await service.auth.admin.deleteUser(data.user.id);
    redirect(`/admin/accounts?error=${encodeURIComponent(acctErr.message)}`);
  }

  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?saved=1");
}

export async function setAdminActive(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  // 일반 클라이언트 — RLS가 "owner이고 자기 행이 아님"을 판정한다.
  const db = await createClient();
  const { error } = await db
    .from("admin_accounts")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/accounts");
  redirect(`/admin/accounts?${isActive ? "enabled" : "disabled"}=1`);
}

export async function setAdminLevel(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  const level = String(formData.get("level") ?? "");

  if (level !== "owner" && level !== "admin") {
    redirect("/admin/accounts?error=invalid_level");
  }

  const db = await createClient();
  const { error } = await db
    .from("admin_accounts")
    .update({ level })
    .eq("id", id);

  if (error) {
    redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?saved=1");
}
