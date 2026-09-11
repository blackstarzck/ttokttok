"use client";
import {
  CardActionsView,
  CardBookAction,
  CardCommentButton,
} from "@ttokttok/ui/feed/card-actions-view";

import { useState } from "react";
import { ShareDialog } from "@/components/feed/share-dialog";

import { toast } from "sonner";
import { BookSheet } from "@/components/book/book-sheet";
import { LoginSheet } from "@/components/auth/login-sheet";
import { LikeButton } from "@/components/feed/like-button";
import { CommentSheet } from "@/components/feed/comment-sheet";

import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";

import type { FeedPost } from "@ttokttok/shared/feed";

/**
 * 카드 액션 줄 (IA 개편 결정 4).
 *
 * 전면 피드의 세로 레일(ActionBar)과 같은 동작을 가로로 편 것이다.
 * 레일을 재사용하지 않는 이유: 레일은 흰색 고정 크롬이고 그 예외는
 * 오버레이 전용이다(DESIGN.md Colors). 카드 표면 위에서는 시맨틱 토큰을
 * 써야 하므로 외피가 다르다.
 *
 * 읽기가 오른쪽 끝에서 유일하게 글자 붙은 채운 버튼이다 — 홈이 기본
 * 탭이 되면서 숏폼→뷰어 전환을 이 버튼이 짊어지기 때문이다(결정 2).
 * 전면 피드에서는 채운 원형 아이콘으로 위계를 잡았지만, 카드에는 주변
 * 요소가 많아 아이콘만으로는 묻힌다.
 *
 * gap-2 = 8px. DESIGN.md는 44×44와 함께 "인접 타깃 간 8px 이상"을 함께
 * 규정한다 — 이 저장소가 그 절을 두 번 놓쳤다.
 */
export function CardActions({
  post,
  liked,
  isGuest,
  userId,
  pinnedCommentId,
}: {
  post: FeedPost;
  liked: boolean;
  isGuest: boolean;
  userId: string | null;
  /** 알림의 댓글 딥링크(`/p/[postId]?comment=`). 있으면 시트를 열고 그 댓글로 간다. */
  pinnedCommentId?: string;
}) {
  const [shareCount, setShareCount] = useState(post.share_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);

  const [shareUrl, setShareUrl] = useState<string | null>(null);

  async function recordShare() {
    setShareCount((n) => n + 1);
    void track("share", { postId: post.id, bookId: post.books.id });

    try {
      const { error } = await createClient().rpc("record_share", {
        p_post_id: post.id,
      });
      if (error) throw error;
    } catch {
      setShareCount((n) => Math.max(n - 1, 0));
      toast.error("공유 집계에 실패했어요");
    }
  }

  const commentButton = <CardCommentButton count={commentCount} />;
  return (
    <>
      {shareUrl ? (
        <ShareDialog
          url={shareUrl}
          title={`${post.books.title} · ${post.books.author}`}
          onClose={() => setShareUrl(null)}
          onShared={recordShare}
        />
      ) : null}
      <CardActionsView
        post={post}
        shareCount={shareCount}
        onShare={() => setShareUrl(`${window.location.origin}/p/${post.id}`)}
        likeButton={
          <LikeButton
            postId={post.id}
            count={post.like_count}
            liked={liked}
            isGuest={isGuest}
            surface
          />
        }
        commentButton={
          isGuest ? (
            <LoginSheet reason="로그인하면 댓글을 남길 수 있어요.">
              {commentButton}
            </LoginSheet>
          ) : (
            <CommentSheet
              postId={post.id}
              currentUserId={userId!}
              pinnedCommentId={pinnedCommentId}
              onAdded={() => setCommentCount((n) => n + 1)}
            >
              {commentButton}
            </CommentSheet>
          )
        }
        bookAction={
          post.books.epub_path !== null ? (
            <CardBookAction post={post} />
          ) : (
            <BookSheet book={post.books} isGuest={isGuest}>
              <CardBookAction post={post} />
            </BookSheet>
          )
        }
      />
    </>
  );
}
