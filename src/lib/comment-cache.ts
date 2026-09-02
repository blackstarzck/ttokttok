import type { InfiniteData } from "@tanstack/react-query";
import type { Comment, CommentPage } from "@/lib/comments";

/**
 * 낙관적 댓글의 id 접두사. 서버가 주는 uuid와 절대 겹치지 않는 모양이라
 * 렌더에서 "아직 확정 안 된 행"을 구분할 수 있다.
 */
const OPTIMISTIC_PREFIX = "optimistic-";

export function isOptimistic(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/** 서버가 만들 행을 흉내 낸다. 성공 시 무효화로 진짜 행에 자리를 내준다. */
export function makeOptimisticComment({
  content,
  userId,
  parentId,
}: {
  content: string;
  userId: string;
  parentId: string | null;
}): Comment {
  return {
    id: `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`,
    content,
    created_at: new Date().toISOString(),
    user_id: userId,
    parent_id: parentId,
    reply_count: 0,
    // 닉네임·아바타는 아직 모른다 — 렌더가 "독자"로 폴백한다.
    profiles: null,
  };
}

/**
 * 낙관적 댓글을 무한 쿼리 캐시에 끼워 넣는다.
 *
 * 붙는 자리가 정렬 방향을 따른다: 최상위 목록은 최신순이라 첫 페이지 앞,
 * 답글 목록은 오래된 순이라 마지막 페이지 끝이다 (설계 결정 4·9).
 *
 * 원본을 변형하지 않는다 — onError의 롤백이 스냅샷을 되돌리는 방식이라
 * 원본이 이미 바뀌어 있으면 되돌릴 것이 없다.
 */
export function insertOptimistic(
  data: InfiniteData<CommentPage> | undefined,
  comment: Comment,
): InfiniteData<CommentPage> | undefined {
  if (!data?.pages.length) return data;

  const pages = [...data.pages];
  if (comment.parent_id) {
    const i = pages.length - 1;
    pages[i] = { ...pages[i], items: [...pages[i].items, comment] };
  } else {
    pages[0] = { ...pages[0], items: [comment, ...pages[0].items] };
  }
  return { ...data, pages };
}
