"use server";

import { PostCard } from "@/components/feed/post-card";
import { PostItem } from "@/components/feed/post-item";
import { getFeed, type FeedCursor, type PostType } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";

export type MoreFeed = {
  /** 이미 렌더된 게시물들 — 카드 트리를 클라이언트 번들에 넣지 않기 위함 */
  nodes: React.ReactNode[];
  postIds: string[];
  nextCursor: FeedCursor | null;
};

/**
 * 다음 피드 페이지 (PRD §5.1 — 커서 기반, 요청당 5~10개).
 *
 * JSX를 그대로 돌려준다. 클라이언트가 데이터를 받아 직접 그리면
 * PostItem → 카드 템플릿 → zod까지 전부 클라이언트 번들로 넘어간다
 * (FRONTEND.md §2·§6). 서버 액션이 렌더까지 마쳐 보내면 스크롤 로직만
 * 클라이언트에 남는다.
 */
export async function loadMoreFeed(
  seed: string,
  sessionId: string | null,
  cursor: FeedCursor | null,
  // 어느 탭이 더 달라고 했는지. 널이면 전 유형(현재 홈).
  type: PostType | null = null,
): Promise<MoreFeed> {
  const { posts, nextCursor } = await getFeed(seed, sessionId, 10, cursor, type);

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);

  return {
    nodes: posts.map((post) => (
      <PostItem
        key={post.id}
        post={post}
        liked={likedIds.has(post.id)}
        isGuest={user === null}
        userId={user?.id ?? null}
      />
    )),
    postIds: posts.map((p) => p.id),
    nextCursor,
  };
}

/**
 * 홈 카드 피드의 다음 페이지.
 *
 * loadMoreFeed와 나눠 둔 이유: 렌더하는 컴포넌트가 다르다(PostCard vs
 * PostItem). JSX를 그대로 돌려주는 규약은 같다 — 클라이언트가 데이터를
 * 받아 직접 그리면 카드 템플릿과 zod까지 클라이언트 번들로 넘어간다
 * (FRONTEND.md §2·§6).
 *
 * getFeed가 실패해도 {posts: [], nextCursor: null}을 돌려주므로, 그대로
 * 넘기면 CardFeed 쪽에서는 "다음 페이지가 없다"와 구분할 수 없다 — 여기서
 * 던져 TanStack Query의 isError를 세운다. 첫 페이지(page.tsx)는 이 서버
 * 액션을 거치지 않으므로 getFeed의 failed를 직접 받아 처리한다 —
 * loadMoreFeed(reels 공용)는 건드리지 않는다.
 */
export async function loadMoreCards(
  seed: string,
  sessionId: string | null,
  cursor: FeedCursor | null,
): Promise<MoreFeed> {
  const { posts, nextCursor, failed } = await getFeed(seed, sessionId, 10, cursor, "cards");
  if (failed) throw new Error("피드를 불러오지 못했습니다.");

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);

  return {
    nodes: posts.map((post) => (
      <PostCard
        key={post.id}
        post={post}
        liked={likedIds.has(post.id)}
        isGuest={user === null}
        userId={user?.id ?? null}
      />
    )),
    postIds: posts.map((p) => p.id),
    nextCursor,
  };
}
