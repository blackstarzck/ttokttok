import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FeedScroller } from "@/components/feed/feed-scroller";
import { PostItem } from "@/components/feed/post-item";
import { getFeed } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";
import { FEED_SEED_COOKIE } from "@/lib/feed-seed";

export const metadata: Metadata = { title: "릴스" };

/**
 * 릴스 — 영상 게시물만 보는 전면 피드 (IA 개편 결정 1·6).
 *
 * 화면은 현재 홈과 같은 조합(FeedScroller + PostItem)을 그대로 쓰고
 * 유형만 좁힌다. 전면 스냅·오버레이 크롬·영상 컨트롤이 이미 여기 맞춰져
 * 있어 새로 만들 것이 없다.
 *
 * 상단 바를 두지 않는다 (결정 8) — 알림 진입은 홈 헤더 하나로 충분하다.
 *
 * seed 쿠키를 홈과 함께 쓴다. 점수는 게시물별로 계산되므로 유형을 좁혀도
 * 같은 seed면 상대 순서가 유지된다 — 탭을 오가며 순서가 흔들리지 않는다.
 */
export default async function ReelsPage() {
  const jar = await cookies();
  const seed = jar.get(FEED_SEED_COOKIE)?.value ?? crypto.randomUUID();

  const { posts, nextCursor } = await getFeed(seed, null, 10, null, "video");

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);

  return (
    <FeedScroller
      postIds={posts.map((p) => p.id)}
      seed={seed}
      initialCursor={nextCursor}
      type="video"
    >
      {posts.map((post) => (
        <PostItem
          key={post.id}
          post={post}
          liked={likedIds.has(post.id)}
          isGuest={user === null}
          userId={user?.id ?? null}
        />
      ))}
    </FeedScroller>
  );
}
