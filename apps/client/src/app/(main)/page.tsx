import { cookies } from "next/headers";
import { CardFeed } from "@/components/feed/card-feed";
import { PostCard } from "@/components/feed/post-card";
import { TopBar } from "@/components/feed/top-bar";
import { getFeed } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";
import { FEED_SEED_COOKIE } from "@/lib/feed-seed";
import { SESSION_ID_COOKIE } from "@/lib/session-id";

export default async function HomePage() {
  // seed는 미들웨어가 쿠키로 심는다 — 서버 컴포넌트는 쿠키를 쓸 수 없다.
  // 폴백은 미들웨어를 타지 않는 경로를 위한 것이고, 그 경우 순서는 이 요청
  // 안에서만 유효하다.
  const jar = await cookies();
  const seed = jar.get(FEED_SEED_COOKIE)?.value ?? crypto.randomUUID();
  // 다음 페이지를 부르는 클라이언트와 **같은** 세션 id를 써야 한다 — 여기서
  // null을 넘기면 1페이지만 seen_penalty가 빠진 점수로 계산돼 같은 게시물이
  // 두 페이지에 모두 랭크된다(session-id.ts 주석의 실측).
  const sessionId = jar.get(SESSION_ID_COOKIE)?.value ?? null;

  // 홈은 카드 게시물만 (IA 개편 결정 1). 영상은 릴스 탭에 있다.
  const { posts, nextCursor, failed } = await getFeed(seed, sessionId, 10, null, "cards");

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
        initialFailed={failed}
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
