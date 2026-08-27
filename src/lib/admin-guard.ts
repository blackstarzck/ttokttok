import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * 어드민 화면·서버 액션의 공통 관문.
 *
 * 미들웨어는 "로그인했는가"만 본다. 여기서 role=admin까지 확인한다.
 * 서버 액션은 미들웨어를 거치지 않을 수 있으므로, 쓰기 액션마다
 * 이 함수를 먼저 부른다 — 그리고 최종 방어선은 RLS다.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/admin/login?error=forbidden");

  return { userId: user.id };
}
