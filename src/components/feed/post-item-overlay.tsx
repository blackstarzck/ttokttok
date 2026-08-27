import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CardCarousel } from "@/components/feed/card-carousel";
import { ActionBar } from "@/components/feed/action-bar";
import { BookCover } from "@/components/feed/book-cover";
import type { FeedPost } from "@/lib/feed";

/**
 * 게시물 — 오버레이 변형 (PRD §5.1 원안, 릴스/쇼츠 문법).
 *
 * 카드가 풀블리드로 화면을 채우고, 액션 바와 채널·도서 정보가 그 위에 뜬다.
 * 하단 스크림으로 겹친 텍스트의 가독성을 확보한다.
 *
 * 분할 변형은 post-item.tsx. 둘 중 하나를 고르면 나머지는 삭제한다.
 */
export function PostItemOverlay({ post }: { post: FeedPost }) {
  return (
    <article data-post-id={post.id} className="relative h-full overflow-hidden">
      <div className="absolute inset-0 pb-28">
        {post.type === "video" ? (
          <div className="flex h-full items-center justify-center px-6">
            <BookCover book={post.books} className="w-32" />
          </div>
        ) : (
          <CardCarousel cards={post.post_cards} book={post.books} />
        )}
      </div>

      {/* 겹친 UI 뒤를 어둡게 깔아 대비를 만든다. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 via-black/50 to-transparent"
      />

      <div className="absolute right-2 bottom-28 flex flex-col items-center gap-4">
        <Link
          href={`/channel/${post.channels.slug}`}
          aria-label={`${post.channels.name} 채널`}
          className="focus-visible:ring-ring flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
        >
          <Avatar className="border-border size-10 border">
            {post.channels.avatar_url ? (
              <AvatarImage src={post.channels.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="text-xs">
              {post.channels.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        </Link>

        <ActionBar post={post} />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 px-4 pt-4 pb-5 pr-20">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">
            {post.channels.name}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {post.books.title} · {post.books.author}
          </span>
        </div>

        <Button asChild size="lg" className="min-h-11 w-full px-4">
          <Link href={`/read/${post.books.id}`}>
            <BookOpen aria-hidden />
            바로 읽기
          </Link>
        </Button>
      </div>
    </article>
  );
}
