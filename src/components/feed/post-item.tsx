import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CardCarousel } from "@/components/feed/card-carousel";
import { ActionBar } from "@/components/feed/action-bar";
import { BookCover } from "@/components/feed/book-cover";
import type { FeedPost } from "@/lib/feed";

/**
 * 피드의 게시물 한 개. 뷰포트 높이를 꽉 채우고 스냅된다.
 *
 * 레이아웃은 오버레이가 아니라 분할이다 — 카드가 텍스트 위주라 UI를 겹치면
 * 읽기를 방해한다. "바로 읽기" CTA는 우측 액션 바 그룹 안에 있다.
 */
export function PostItem({ post }: { post: FeedPost }) {
  return (
    <article
      data-post-id={post.id}
      className="relative flex h-full snap-start snap-always flex-col"
    >
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {post.type === "video" ? (
            // 영상 게시물은 Phase 3. 그때까지 빈 화면 대신 도서만 보여준다.
            <div className="flex h-full items-center justify-center px-6">
              <BookCover book={post.books} className="w-32" />
            </div>
          ) : (
            <CardCarousel cards={post.post_cards} book={post.books} />
          )}
        </div>

        <div className="flex shrink-0 items-end pr-2 pb-4">
          <ActionBar post={post} />
        </div>
      </div>

      <footer className="border-border flex shrink-0 items-center gap-3 border-t px-4 py-3">
        <Link
          href={`/channel/${post.channels.slug}`}
          className="focus-visible:ring-ring flex min-h-11 min-w-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <Avatar className="size-8 shrink-0">
            {post.channels.avatar_url ? (
              <AvatarImage src={post.channels.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="text-xs">
              {post.channels.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{post.channels.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {post.books.title} · {post.books.author}
            </span>
          </span>
        </Link>
      </footer>
    </article>
  );
}
