import { cookies } from "next/headers";
import { FeedScroller } from "@/components/feed/feed-scroller";
import { PostItem } from "@/components/feed/post-item";
import { getFeed } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";

/** 피드 순서를 정하는 seed. 방문(세션)마다 새로 뽑되 그 안에서는 유지한다. */
const SEED_COOKIE = "ttokttok.feed-seed";

export default async function HomePage() {
  // 페이지네이션이 같은 순서를 이어가려면 seed가 요청 사이에서 살아 있어야
  // 한다. 매번 새로 뽑으면 다음 페이지가 첫 페이지와 겹친다.
  const jar = await cookies();
  const seed = jar.get(SEED_COOKIE)?.value ?? crypto.randomUUID();

  const { posts, nextCursor } = await getFeed(seed, null, 10);

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);
  const isGuest = user === null;

  return (
    <FeedScroller
      postIds={posts.map((p) => p.id)}
      seed={seed}
      initialCursor={nextCursor}
    >
      {posts.map((post) => (
        <PostItem
          key={post.id}
          post={post}
          liked={likedIds.has(post.id)}
          isGuest={isGuest}
          userId={user?.id ?? null}
        />
      ))}
    </FeedScroller>
  );
}
