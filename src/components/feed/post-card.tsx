import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TemplateCard } from "@/components/cards/template-card";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { CardActions } from "@/components/feed/card-actions";
import { formatByline } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";

/**
 * 홈 피드의 카드 한 장 (IA 개편 결정 3).
 *
 * 위에서 아래로 채널 헤더 → 본문 → 액션 줄 → 도서 바. 전면 피드가
 * 오버레이인 것과 달리 여기는 **쌓기**다 — 크롬이 컨텐츠를 가리지 않으므로
 * 스크림도 세이프존도 필요 없다.
 *
 * 본문 비율은 4:5다. 근거와 실측은 template-card.tsx의 카드 모드 주석.
 */
export function PostCard({
  post,
  liked = false,
  isGuest = true,
  userId = null,
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
  userId?: string | null;
}) {
  const byline = formatByline(post.books);

  return (
    <article className="border-border bg-card overflow-hidden rounded-xl border">
      <Link
        href={`/channel/${post.channels.slug}`}
        className="focus-visible:ring-ring flex min-h-11 items-center gap-2 px-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Avatar className="size-7">
          {post.channels.avatar_url ? (
            <AvatarImage src={post.channels.avatar_url} alt="" />
          ) : null}
          <AvatarFallback className="text-xs">
            {post.channels.name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">
          {post.channels.name}
        </span>
      </Link>

      <div data-card-body className="bg-background aspect-4/5 overflow-hidden">
        <TemplateCard layout={post.post_cards} book={post.books} variant="card" />
      </div>

      <div className="py-1">
        <CardActions
          post={post}
          liked={liked}
          isGuest={isGuest}
          userId={userId}
        />
      </div>

      <BookSheet book={post.books} isGuest={isGuest}>
        <button
          type="button"
          aria-label={`${post.books.title} 도서 정보`}
          className="focus-visible:ring-ring flex w-full items-center gap-3 px-3 pb-3 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <BookCover book={post.books} className="w-9 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium break-keep">
              {post.books.title}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {byline}
            </span>
          </span>
        </button>
      </BookSheet>
    </article>
  );
}
