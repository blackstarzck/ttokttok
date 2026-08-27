import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BookCover } from "@/components/feed/book-cover";
import { createClient } from "@/lib/supabase/server";
import { getChannelPosts } from "@/lib/feed";
import { formatCount } from "@/lib/format";

/**
 * 채널 페이지 (PRD §5.9).
 * 채널 정보 + 그 채널이 발행한 게시물 그리드. 항목을 누르면 딥링크로 간다.
 */
async function getChannel(slug: string) {
  const db = await createClient();
  const { data } = await db
    .from("channels")
    .select("id, name, slug, genre, description, avatar_url")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: PageProps<"/channel/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const channel = await getChannel(slug);
  if (!channel) return { title: "채널을 찾을 수 없어요" };
  return {
    title: channel.name,
    description: channel.description ?? undefined,
  };
}

export default async function ChannelPage({
  params,
}: PageProps<"/channel/[slug]">) {
  const { slug } = await params;
  const channel = await getChannel(slug);
  if (!channel) notFound();

  const posts = await getChannelPosts(channel.id);

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
                게시물 {formatCount(posts.length)}
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
        <p className="text-muted-foreground px-4 py-10 text-center text-sm">
          아직 발행한 게시물이 없어요.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-1 p-1">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/p/${post.id}`}
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
