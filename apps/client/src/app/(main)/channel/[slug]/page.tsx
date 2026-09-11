import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatCount } from "@ttokttok/shared/format";
import { ChannelActions } from "@/components/channel/channel-actions";
import { ChannelGrid } from "@/components/channel/channel-grid";
import { ChannelHero } from "@/components/channel/channel-hero";
import { LoadFailed } from "@/components/load-failed";
import { getChannel, getChannelCounts } from "@/lib/channel";
import { getChannelPosts } from "@/lib/feed";

export async function generateMetadata({
  params,
}: PageProps<"/channel/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { channel, failed } = await getChannel(slug);
  // 실패와 없음을 제목에서부터 가른다 — 탭 제목만 봐도 다른 상황이다.
  if (failed) return { title: "채널을 불러오지 못했어요" };
  if (!channel) return { title: "채널을 찾을 수 없어요" };
  return {
    title: channel.name,
    description: channel.description ?? undefined,
    ...(channel.cover_url
      ? { openGraph: { images: [{ url: channel.cover_url }] } }
      : {}),
  };
}

/**
 * 채널 홈 (PRD §5.9, 설계 2026-09-11-channel-home-redesign).
 *
 * 위에서 아래로 히어로(커버·이름·액션 바) → 정방형 타일 모자이크.
 * 타일의 목적지는 유형에 따라 갈린다 — 영상은 채널 스코프 릴스 뷰어
 * (`/channel/[slug]/reels`), 카드는 게시물 상세(`/p/[postId]`, 홈 카드를
 * 그린다)(§11-58·§11-68).
 *
 * 게시물 조회와 카운트는 서로 독립이라 실패도 따로 말한다 — 카운트가
 * 실패했다고 그리드를 지우지 않고, 그리드가 실패했다고 히어로를 지우지
 * 않는다(§11-61).
 */
export default async function ChannelPage({
  params,
}: PageProps<"/channel/[slug]">) {
  const { slug } = await params;
  const { channel, failed: channelFailed } = await getChannel(slug);
  // 조회 실패를 notFound()로 흘려보내면 멀쩡히 있는 채널을 "없는 채널"이라고
  // 거짓말한다 — 영상을 누르고 들어온 사용자가 막다른 길에 갇힌다.
  if (channelFailed) return <LoadFailed />;
  if (!channel) notFound();

  const [{ posts, failed: postsFailed }, counts] = await Promise.all([
    getChannelPosts(channel.id),
    getChannelCounts(channel.id),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <ChannelHero
        channel={channel}
        postCount={counts.failed ? "–" : formatCount(counts.total)}
        actions={
          <ChannelActions
            slug={channel.slug}
            name={channel.name}
            showVideos={!counts.failed && counts.videos > 0}
          />
        }
      />
      <ChannelGrid posts={posts} slug={channel.slug} failed={postsFailed} />
    </div>
  );
}
