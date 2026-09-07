import { cookies } from "next/headers";
import { CardFeed } from "@/components/feed/card-feed";
import { PostCard } from "@/components/feed/post-card";
import { TopBar } from "@/components/feed/top-bar";
import { getFeed } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";
import { FEED_SEED_COOKIE } from "@/lib/feed-seed";

export default async function HomePage() {
  // seed는 미들웨어가 쿠키로 심는다 — 서버 컴포넌트는 쿠키를 쓸 수 없다.
  // 폴백은 미들웨어를 타지 않는 경로를 위한 것이고, 그 경우 순서는 이 요청
  // 안에서만 유효하다.
  const jar = await cookies();
  const seed = jar.get(FEED_SEED_COOKIE)?.value ?? crypto.randomUUID();

  // 홈은 카드 게시물만 (IA 개편 결정 1). 영상은 릴스 탭에 있다.
  const { posts, nextCursor } = await getFeed(seed, null, 10, null, "cards");

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);
  const isGuest = user === null;

  return (
    // TopBar는 오버레이가 아니라 목록의 구조적 형제다(설계 결정 8) —
    // CardFeed가 나머지 높이를 차지하고 스스로 스크롤한다.
    <div className="flex h-full flex-col">
      <TopBar isGuest={isGuest} />
      <CardFeed
        seed={seed}
        initialCursor={nextCursor}
        initialPostIds={posts.map((p) => p.id)}
        initialNodes={posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            liked={likedIds.has(post.id)}
            isGuest={isGuest}
            userId={user?.id ?? null}
          />
        ))}
      />
    </div>
  );
}
