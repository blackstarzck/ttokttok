import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CardCarousel } from "@/components/feed/card-carousel";
import { ActionBar } from "@/components/feed/action-bar";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { VideoPlayer } from "@/components/feed/video-player";
import type { FeedPost } from "@/lib/feed";

/**
 * 피드의 게시물 한 개. 뷰포트 높이를 꽉 채우고 스냅된다.
 *
 * 레이아웃은 오버레이가 아니라 분할이다 — 카드가 텍스트 위주라 UI를 겹치면
 * 읽기를 방해한다. "바로 읽기" CTA는 우측 액션 바 그룹 안에 있다.
 */
export function PostItem({
  post,
  liked = false,
  isGuest = true,
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
}) {
  return (
    <article
      data-post-id={post.id}
      className="relative flex h-full snap-start snap-always flex-col"
    >
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {post.type === "video" ? (
            post.post_videos ? (
              <VideoPlayer
                video={post.post_videos}
                poster={post.books.cover_url}
              />
            ) : (
              // 영상 레코드가 없는 영상 게시물 — 빈 화면 대신 도서를 보여준다.
              <div className="flex h-full items-center justify-center px-6">
                <BookCover book={post.books} className="w-32" />
              </div>
            )
          ) : (
            <CardCarousel cards={post.post_cards} book={post.books} />
          )}
        </div>

        <div className="flex shrink-0 items-end pr-2 pb-4">
          <ActionBar post={post} liked={liked} isGuest={isGuest} />
        </div>
      </div>

      {/* 아바타는 채널로, 도서 정보는 상세 시트로 — 목적지가 다르므로
          하나의 링크로 묶지 않는다 (PRD §5.1). */}
      <footer className="border-border flex shrink-0 items-center gap-2 border-t px-4 py-2">
        <Link
          href={`/channel/${post.channels.slug}`}
          aria-label={`${post.channels.name} 채널`}
          className="focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <Avatar className="size-8">
            {post.channels.avatar_url ? (
              <AvatarImage src={post.channels.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="text-xs">
              {post.channels.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        </Link>

        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            className="focus-visible:ring-ring flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-md text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="w-full truncate text-sm">
              {post.channels.name}
            </span>
            <span className="text-muted-foreground w-full truncate text-xs">
              {post.books.title} · {post.books.author}
            </span>
          </button>
        </BookSheet>
      </footer>
    </article>
  );
}
