"use client";

import { useState } from "react";
import Link from "next/link";
import { Info, MessageCircle, Share2 } from "lucide-react";
import { BookFanIcon } from "@/components/book/book-fan-icon";
import { toast } from "sonner";
import { BookSheet } from "@/components/book/book-sheet";
import { LoginSheet } from "@/components/auth/login-sheet";
import { LikeButton } from "@/components/feed/like-button";
import { CommentSheet } from "@/components/feed/comment-sheet";
import { CARD_ACTION as ACTION, CARD_COUNT as COUNT } from "@/components/feed/card-chrome";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { formatCount } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";

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
}: {
  post: FeedPost;
  liked: boolean;
  isGuest: boolean;
  userId: string | null;
}) {
  const [shareCount, setShareCount] = useState(post.share_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);

  async function handleShare() {
    const url = `${window.location.origin}/p/${post.id}`;
    const title = `${post.books.title} · ${post.books.author}`;

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("링크를 복사했어요");
      }
    } catch {
      return; // 사용자가 공유 시트를 닫은 경우 — 집계하지 않는다.
    }

    setShareCount((n) => n + 1);
    void track("share", { postId: post.id, bookId: post.books.id });

    const { error } = await createClient().rpc("record_share", {
      p_post_id: post.id,
    });
    if (error) {
      setShareCount((n) => Math.max(n - 1, 0));
      toast.error("공유 집계에 실패했어요");
    }
  }

  const commentButton = (
    <button type="button" aria-label="댓글" className={ACTION}>
      <MessageCircle className="size-5" aria-hidden />
      <span className={COUNT}>{formatCount(commentCount)}</span>
    </button>
  );

  return (
    <div className="flex items-center gap-2 px-2">
      <LikeButton
        postId={post.id}
        count={post.like_count}
        liked={liked}
        isGuest={isGuest}
        surface
      />

      {isGuest ? (
        <LoginSheet reason="로그인하면 댓글을 남길 수 있어요.">
          {commentButton}
        </LoginSheet>
      ) : (
        <CommentSheet
          postId={post.id}
          currentUserId={userId!}
          onAdded={() => setCommentCount((n) => n + 1)}
        >
          {commentButton}
        </CommentSheet>
      )}

      <button
        type="button"
        onClick={handleShare}
        aria-label="공유"
        className={ACTION}
      >
        <Share2 className="size-5" aria-hidden />
        <span className={COUNT}>{formatCount(shareCount)}</span>
      </button>

      {/* 전문 도서는 뷰어로 직행, 링크형은 도서 상세 시트로 (PRD §11-31) */}
      {post.books.epub_path !== null ? (
        <Link
          href={`/read/${post.books.id}`}
          aria-label={`${post.books.title} 바로 읽기`}
          className="bg-foreground text-background focus-visible:ring-ring ml-auto flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
        >
          <BookFanIcon className="size-6 shrink-0" aria-hidden />
          읽기
        </Link>
      ) : (
        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            aria-label={`${post.books.title} 도서 정보 보기`}
            className="bg-foreground text-background focus-visible:ring-ring ml-auto flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Info className="size-4" aria-hidden />
            도서
          </button>
        </BookSheet>
      )}
    </div>
  );
}
