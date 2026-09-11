import { PostCardView } from "@ttokttok/ui/feed/post-card-view";
import { PostBookInfo } from "@ttokttok/ui/feed/post-book-info";
import { BookSheet } from "@/components/book/book-sheet";
import { CardActions } from "@/components/feed/card-actions";
import type { FeedPost } from "@ttokttok/shared/feed";

export function PostCard({
  post,
  liked = false,
  isGuest = true,
  userId = null,
  preview,
  pinnedCommentId,
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
  userId?: string | null;
  preview?: boolean;
  /** 게시물 상세(`/p/[postId]?comment=`)만 넘긴다. 홈은 undefined. */
  pinnedCommentId?: string;
}) {
  return (
    <PostCardView
      post={post}
      preview={preview}
      actions={
        <CardActions
          post={post}
          liked={liked}
          isGuest={isGuest}
          userId={userId}
          pinnedCommentId={pinnedCommentId}
        />
      }
      bookInfo={
        <BookSheet book={post.books} isGuest={isGuest}>
          <PostBookInfo book={post.books} />
        </BookSheet>
      }
    />
  );
}
