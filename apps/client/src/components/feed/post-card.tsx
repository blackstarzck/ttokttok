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
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
  userId?: string | null;
  preview?: boolean;
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
