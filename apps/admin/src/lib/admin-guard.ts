import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminLevel = "owner" | "admin";

export type AdminAccess = {
  userId: string;
  isAdmin: boolean;
  level: AdminLevel | null;
};

/**
 * 어드민 화면·서버 액션의 공통 관문.
 *
 * 미들웨어는 "로그인했는가"만 본다. 여기서 관리자인지까지 확인한다.
 * 서버 액션은 미들웨어를 거치지 않을 수 있으므로, 쓰기 액션마다 이 함수를
 * 먼저 부른다 — 그리고 최종 방어선은 RLS다.
 */
export async function requireAdmin(): Promise<{
  userId: string;
  level: AdminLevel;
}> {
  const access = await readAdminAccess();

  if (!access) redirect("/admin/login");
  if (!access.isAdmin || !access.level) redirect("/admin/login?error=forbidden");

  return { userId: access.userId, level: access.level };
}

/** 관리자 계정 관리 전용 관문. RLS도 owner만 쓰기를 허용한다. */
export async function requireOwner(): Promise<{ userId: string }> {
  const { userId, level } = await requireAdmin();
  if (level !== "owner") redirect("/admin?error=owner_only");
  return { userId };
}

/**
 * 같은 판정을 리다이렉트 없이 돌려준다.
 *
 * 로그인 페이지가 필요로 한다 — 거기서는 "관리자면 /admin으로 보낸다"라
 * 목적지가 반대라서 requireAdmin의 리다이렉트를 재사용할 수 없다. 그리고
 * 이 판정을 관리자 여부를 모르는 미들웨어에 맡기면 두 관문이 서로를 가리켜
 * 무한 리다이렉트가 된다(supabase/middleware.ts 주석).
 *
 * 로그인하지 않았으면 null. 로그인은 했지만 관리자가 아니면 isAdmin=false.
 */
export async function readAdminAccess(): Promise<AdminAccess | null> {
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return null;

  const { data: account, error } = await db
    .from("admin_accounts")
    .select("level, is_active")
    .eq("id", user.id)
    .maybeSingle();

  // 조회 실패를 삼키면 account가 null이 되어 호출부가 "권한 없음"으로
  // 흘러간다 — 진짜 관리자가 일시적 오류에 forbidden 화면을 보고 자기
  // 계정이 강등된 줄 안다. 던져도 **닫히는 쪽은 그대로다**: 접근이
  // 허용되지 않는다는 결과는 같고, 이유만 정직해진다. (결정 기록 §11-61)
  if (error) throw new Error(error.message);

  // is_active=false는 "계정은 있지만 꺼져 있다"다. RLS의 is_admin()도 같은
  // 조건을 보므로 화면과 DB의 판정이 어긋나지 않는다.
  const isAdmin = Boolean(account?.is_active);

  return {
    userId: user.id,
    isAdmin,
    level: isAdmin ? (account!.level as AdminLevel) : null,
  };
}
