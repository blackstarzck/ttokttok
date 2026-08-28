import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  role: "user" | "admin";
};

/**
 * 지금 로그인한 사용자. 게스트면 null.
 *
 * 서버 컴포넌트에서 부른다. 화면 분기용이지 보안 경계가 아니다 —
 * 접근 제어는 RLS가 한다 (FRONTEND.md §5).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("nickname, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    nickname: profile?.nickname ?? "독자",
    avatarUrl: profile?.avatar_url ?? null,
    role: (profile?.role as "user" | "admin") ?? "user",
  };
}

/**
 * 주어진 게시물들 중 내가 좋아요한 것의 id 집합.
 * 게시물마다 따로 묻지 않으려고 한 번에 받는다.
 */
export async function getLikedPostIds(
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Set();

  // RLS가 본인 행만 주므로 user_id 조건은 생략해도 되지만,
  // 의도를 드러내려고 명시한다.
  const { data } = await db
    .from("likes")
    .select("post_id")
    .eq("user_id", user.id)
    .in("post_id", postIds);

  return new Set((data ?? []).map((r) => r.post_id));
}
