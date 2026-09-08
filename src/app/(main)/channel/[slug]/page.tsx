import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BookCover } from "@/components/feed/book-cover";
import { getChannel } from "@/lib/channel";
import { getChannelPosts } from "@/lib/feed";
import { LoadFailed } from "@/components/load-failed";
import { formatCount } from "@/lib/format";

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
  };
}

/**
 * 채널 페이지 (PRD §5.9).
 * 채널 정보 + 그 채널이 발행한 게시물 그리드. 항목을 누르면 유형에 따라
 * 갈린다 — 영상은 이 채널 안에서 이어 보는 채널 스코프 릴스 뷰어
 * (`/channel/[slug]/reels`)로, 카드는 게시물 상세(`/p/[postId]`)로
 * 딥링크된다(§11-58).
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

  const { posts, failed: postsFailed } = await getChannelPosts(channel.id);

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex flex-col gap-4 p-4">
        <Link
          href="/"
          aria-label="피드로 돌아가기"
          className="focus-visible:ring-ring text-muted-foreground hover:text-foreground -ml-2 flex size-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft aria-hidden />
        </Link>

        <div className="flex items-center gap-3">
          <Avatar className="size-14 shrink-0">
            {channel.avatar_url ? (
              <AvatarImage src={channel.avatar_url} alt="" />
            ) : null}
            <AvatarFallback>{channel.name.slice(0, 1)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-lg font-bold break-keep">{channel.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{channel.genre}</Badge>
              <span className="text-muted-foreground text-xs">
                게시물 {postsFailed ? "–" : formatCount(posts.length)}
              </span>
            </div>
          </div>
        </div>

        {channel.description ? (
          <p className="text-muted-foreground text-sm leading-relaxed break-keep">
            {channel.description}
          </p>
        ) : null}
      </header>

      {posts.length === 0 ? (
        // 실패와 빈 목록을 다른 문구로 가른다 (알림 화면 §5.5의 선례).
        // 채널 정보는 이미 떠 있으므로 화면을 통째로 지우지는 않는다.
        <p className="text-muted-foreground px-4 py-10 text-center text-sm">
          {postsFailed
            ? "게시물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
            : "아직 발행한 게시물이 없어요."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-1 p-1">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={
                  post.type === "video"
                    ? `/channel/${channel.slug}/reels?start=${post.id}`
                    : `/p/${post.id}`
                }
                // 영상은 이 채널 안에서 이어 보게 릴스 뷰어로 보낸다(결정 7).
                // 카드는 전면 뷰어가 없으므로 그대로 상세(/p/[postId])로 간다.
                className="focus-visible:ring-ring block rounded-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <BookCover book={post.books} className="w-full" />
                <span className="text-muted-foreground mt-1 block truncate px-0.5 text-xs">
                  조회 {formatCount(post.view_count)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
