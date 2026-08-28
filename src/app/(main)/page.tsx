import { FeedScroller } from "@/components/feed/feed-scroller";
import { PostItem } from "@/components/feed/post-item";
import { getFeed } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";

export default async function HomePage() {
  // 방문마다 순서를 섞는다. 페이지네이션이 붙으면 이 seed를 쿠키/URL로
  // 이어받아 다음 페이지가 어긋나지 않게 해야 한다.
  const posts = await getFeed(crypto.randomUUID(), 10);

  // 좋아요 여부는 게시물마다 묻지 않고 한 번에 받는다.
  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);
  const isGuest = user === null;

  return (
    <FeedScroller postIds={posts.map((p) => p.id)}>
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
