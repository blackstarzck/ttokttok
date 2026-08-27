import { FeedScroller } from "@/components/feed/feed-scroller";
import { getFeed } from "@/lib/feed";

export default async function HomePage() {
  // 방문마다 순서를 섞는다. 페이지네이션이 붙으면 이 seed를 쿠키/URL로
  // 이어받아 다음 페이지가 어긋나지 않게 해야 한다.
  const posts = await getFeed(crypto.randomUUID(), 10);

  return <FeedScroller posts={posts} />;
}
