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

  const { data: profile, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // 조회 실패를 삼키면 profile이 null이 되어 아래 검사가 "권한 없음"으로
  // 흘러간다 — 진짜 관리자가 일시적 오류에 forbidden 화면을 보고 자기
  // 계정이 강등된 줄 안다. 던져도 **닫히는 쪽은 그대로다**: 접근이
  // 허용되지 않는다는 결과는 같고, 이유만 정직해진다. 실제 비관리자에
  // 대한 동작(로그인 화면으로 리다이렉트)은 바뀌지 않는다.
  if (error) throw new Error(error.message);

  if (profile?.role !== "admin") redirect("/admin/login?error=forbidden");

  return { userId: user.id };
}
