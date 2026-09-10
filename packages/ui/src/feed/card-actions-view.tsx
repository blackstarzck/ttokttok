import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { Heart, Info, MessageCircle, Share2 } from "lucide-react";
import { BookFanIcon } from "../book/book-fan-icon";
import { CARD_ACTION as ACTION, CARD_COUNT as COUNT } from "./card-chrome";
import { formatCount } from "@ttokttok/shared/format";
import type { FeedPost } from "@ttokttok/shared/feed";

export function CardBookAction({
  post,
  preview,
  ...props
}: { post: FeedPost; preview?: boolean } & ComponentProps<"button">) {
  return (
    <>
      {post.books.epub_path !== null ? (
        <Link
          href={`/read/${post.books.id}`}
          prefetch={preview ? false : undefined}
          aria-label={`${post.books.title} 바로 읽기`}
          className="bg-foreground text-background focus-visible:ring-ring ml-auto flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
        >
          <BookFanIcon className="size-6 shrink-0" aria-hidden />
          읽기
        </Link>
      ) : (
        <>
          <button
            {...props}
            type="button"
            aria-label={`${post.books.title} 도서 정보 보기`}
            className="bg-foreground text-background focus-visible:ring-ring ml-auto flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Info className="size-4" aria-hidden />
            도서
          </button>
        </>
      )}
    </>
  );
}

export function CardCommentButton({
  count,
  ...props
}: { count: number } & ComponentProps<"button">) {
  return (
    <button {...props} type="button" aria-label="댓글" className={ACTION}>
      <MessageCircle className="size-5" aria-hidden />
      <span className={COUNT}>{formatCount(count)}</span>
    </button>
  );
}

export function CardActionsView({
  post,
  preview,
  likeButton,
  commentButton,
  bookAction,
  shareCount = post.share_count,
  onShare,
}: {
  post: FeedPost;
  preview?: boolean;
  likeButton?: ReactNode;
  commentButton?: ReactNode;
  bookAction?: ReactNode;
  shareCount?: number;
  onShare?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2">
      {likeButton ?? (
        <button type="button" aria-label="좋아요" className={ACTION}>
          <Heart className="size-5" aria-hidden />
          <span className={COUNT}>{formatCount(post.like_count)}</span>
        </button>
      )}
      {commentButton ?? <CardCommentButton count={post.comment_count} />}
      <button
        type="button"
        onClick={onShare}
        aria-label="공유"
        className={ACTION}
      >
        <Share2 className="size-5" aria-hidden />
        <span className={COUNT}>{formatCount(shareCount)}</span>
      </button>
      {bookAction ?? <CardBookAction post={post} preview={preview} />}
    </div>
  );
}
