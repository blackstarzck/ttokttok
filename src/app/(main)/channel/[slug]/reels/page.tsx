import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedScroller } from "@/components/feed/feed-scroller";
import { PostItem } from "@/components/feed/post-item";
import { getChannel } from "@/lib/channel";
import { getChannelVideos } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";

/**
 * 채널 스코프 릴스 뷰어 (IA 개편 결정 7).
 *
 * 릴스 탭(`/reels`)이 전체 영상을 랭킹 순으로 보여준다면 여기는 **한 채널의
 * 영상만** 발행 역순으로 보여준다 — 채널 그리드에서 본 순서 그대로다.
 * 화면은 릴스와 같은 조합(FeedScroller + PostItem)을 재사용하고 데이터
 * 소스와 시작 위치만 다르다.
 *
 * seed를 받지 않는 이유: 랭킹이 없다. 정렬이 published_at desc로 고정이라
 * 재현할 난수가 없고, 그래서 커서도 프리페치도 없다(initialCursor=null).
 */
export async function generateMetadata({
  params,
}: PageProps<"/channel/[slug]/reels">): Promise<Metadata> {
  const { slug } = await params;
  const channel = await getChannel(slug);
  if (!channel) return { title: "채널을 찾을 수 없어요" };
  return { title: channel.name };
}

export default async function ChannelReelsPage({
  params,
  searchParams,
}: PageProps<"/channel/[slug]/reels">) {
  const { slug } = await params;
  const { start } = await searchParams;

  const channel = await getChannel(slug);
  if (!channel) notFound();

  const posts = await getChannelVideos(channel.id);
  if (posts.length === 0) notFound();

  const startId = typeof start === "string" ? start : undefined;
  const startIndex = Math.max(
    0,
    posts.findIndex((p) => p.id === startId),
  );

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);

  return (
    <FeedScroller
      postIds={posts.map((p) => p.id)}
      seed=""
      initialCursor={null}
      // 채널마다 달라야 한다 — seed가 ""라 이걸 안 나누면 모든 채널 뷰어가
      // 같은 캐시 항목을 공유해, 먼저 연 채널의 영상이 다른 채널 화면에
      // 그대로 남는다(feed-scroller.tsx의 cacheKey 주석).
      cacheKey={`channel:${channel.slug}`}
      type="video"
      initialIndex={startIndex}
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
