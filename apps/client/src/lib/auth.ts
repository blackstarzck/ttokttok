import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// 같은 화면의 사용자 정보·좋아요 조회에서 인증 요청을 반복하지 않는다.
// cache는 서버 렌더 요청 안에서만 공유되며 다른 사용자의 세션은 섞이지 않는다.
const getAuthenticatedUser = cache(async () => {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  return user;
});

export type CurrentUser = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
};

/**
 * 지금 로그인한 사용자. 게스트면 null.
 *
 * 서버 컴포넌트에서 부른다. 화면 분기용이지 보안 경계가 아니다 —
 * 접근 제어는 RLS가 한다 (FRONTEND.md §5).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const db = await createClient();

  const user = await getAuthenticatedUser();
  if (!user) return null;

  const { data: profile, error } = await db
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // maybeSingle()은 "행 없음"과 "조회 실패"를 똑같이 data: null로 돌려준다
  // (§11-61). 여기서 error를 무시하고 null을 반환하면, 멀쩡히 로그인한
  // 사용자가 게스트로 강등된다 — notifications는 /login으로 밀어내고
  // profile은 로그아웃 상태를 보여준다. 화면이 거짓말하지 않도록 던져서
  // Next의 에러 경계로 흘려보낸다. "게스트"가 아니라 "못 불러옴"이 보여야
  // 한다.
  if (error) throw error;

  // 조회는 성공했는데 행이 없는 경우: 서비스 사용자가 아니다 — 관리자
  // 계정이거나, 삭제된 사용자의 잔여 세션이다. 게스트로 취급해 쓰기 경로에
  // 닿지 않게 한다.
  //
  // 정상 사용자가 여기 걸리는 창은 없다: handle_new_user는 auth.users
  // INSERT의 after 트리거라 같은 트랜잭션 안에서 프로필을 만든다. 세션이
  // 존재하는 시점에는 프로필이 이미 있다. (이 전제가 깨지면 — 트리거를
  // 비동기로 바꾸는 등 — 이 처리도 같이 바뀌어야 한다.)
  if (!profile) return null;

  return {
    id: user.id,
    nickname: profile.nickname,
    avatarUrl: profile.avatar_url,
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
  const user = await getAuthenticatedUser();
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
