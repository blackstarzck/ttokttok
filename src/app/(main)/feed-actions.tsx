"use server";

import { PostItem } from "@/components/feed/post-item";
import { getFeed, type FeedCursor } from "@/lib/feed";
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
): Promise<MoreFeed> {
  const { posts, nextCursor } = await getFeed(seed, sessionId, 10, cursor);

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
