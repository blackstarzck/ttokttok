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
 * seed 쿠키를 홈과 함께 쓴다. 같은 seed면 게시물별 난수가 같아 순서가
 * 재현된다.
 *
 * 다만 **탭 사이의 상대 순서까지 같다고 보장하지는 않는다.** 조회 50회
 * 미만인 게시물은 인기 가중 대신 그 코호트의 **중앙값**을 받는데(랭킹 플로어,
 * 20260828000002), 그 중앙값이 유형 필터 안쪽에서 계산되기 때문이다
 * (20260904000001 — 영상은 영상들 사이에서 평가돼야 하므로 의도한 것이다).
 * 그래서 갓 발행된 영상은 전체 기준일 때와 영상 기준일 때 배수가 달라져
 * 홈과 릴스에서 앞뒤가 뒤집힐 수 있다(측정: 저조회 영상 2개를 넣고 seed
 * 300개로 재니 8%에서 뒤집힘). 조회가 쌓이면 사라지는 차이다.
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
