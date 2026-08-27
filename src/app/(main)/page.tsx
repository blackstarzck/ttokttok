import { FeedScroller } from "@/components/feed/feed-scroller";
import { PostItem } from "@/components/feed/post-item";
import { PostItemOverlay } from "@/components/feed/post-item-overlay";
import { getFeed } from "@/lib/feed";

/**
 * ?layout=overlay 로 게시물 레이아웃을 비교할 수 있다.
 * 분할(기본) vs 오버레이(PRD §5.1 원안) 중 하나를 확정하면
 * 이 분기와 탈락한 컴포넌트를 삭제한다.
 */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { layout } = await searchParams;
  const overlay = layout === "overlay";

  // 방문마다 순서를 섞는다. 페이지네이션이 붙으면 이 seed를 쿠키/URL로
  // 이어받아 다음 페이지가 어긋나지 않게 해야 한다.
  const posts = await getFeed(crypto.randomUUID(), 10);

  return (
    <FeedScroller postIds={posts.map((p) => p.id)}>
      {posts.map((post) =>
        overlay ? (
          <PostItemOverlay key={post.id} post={post} />
        ) : (
          <PostItem key={post.id} post={post} />
        ),
      )}
    </FeedScroller>
  );
}
