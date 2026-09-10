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
  const access = await readAdminAccess();

  if (!access) redirect("/admin/login");
  if (!access.isAdmin) redirect("/admin/login?error=forbidden");

  return { userId: access.userId };
}

/**
 * 같은 판정을 리다이렉트 없이 돌려준다.
 *
 * 로그인 페이지가 필요로 한다 — 거기서는 "관리자면 /admin으로 보낸다"라
 * 목적지가 반대라서 requireAdmin의 리다이렉트를 재사용할 수 없다. 그리고
 * 이 판정을 role을 모르는 미들웨어에 맡기면 두 관문이 서로를 가리켜
 * 무한 리다이렉트가 된다(supabase/middleware.ts 주석).
 *
 * 로그인하지 않았으면 null. 로그인은 했지만 관리자가 아니면 isAdmin=false.
 */
export async function readAdminAccess(): Promise<{
  userId: string;
  isAdmin: boolean;
} | null> {
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // 조회 실패를 삼키면 profile이 null이 되어 호출부가 "권한 없음"으로
  // 흘러간다 — 진짜 관리자가 일시적 오류에 forbidden 화면을 보고 자기
  // 계정이 강등된 줄 안다. 던져도 **닫히는 쪽은 그대로다**: 접근이
  // 허용되지 않는다는 결과는 같고, 이유만 정직해진다. 실제 비관리자에
  // 대한 동작(로그인 화면으로 리다이렉트)은 바뀌지 않는다.
  if (error) throw new Error(error.message);

  return { userId: user.id, isAdmin: profile?.role === "admin" };
}
