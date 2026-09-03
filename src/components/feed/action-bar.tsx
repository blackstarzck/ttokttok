"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Info, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { BookSheet } from "@/components/book/book-sheet";
import { LoginSheet } from "@/components/auth/login-sheet";
import { LikeButton } from "@/components/feed/like-button";
import { CommentSheet } from "@/components/feed/comment-sheet";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { formatCount } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";
import {
  CHROME_ACTION,
  CHROME_COUNT,
  CHROME_CTA,
  CHROME_CTA_ICON,
  CHROME_ICON,
} from "@/components/feed/chrome";

/**
 * 게시물 우측 세로 액션 바.
 *
 * "읽기"가 이 그룹의 마지막(=엄지에 가장 가까운) 자리에 들어간다.
 * 나머지가 고스트 아이콘인 것과 달리 채워진 원형으로 두어, 그룹에 속하면서도
 * 핵심 전환 버튼이라는 위계를 잃지 않게 한다 (DESIGN.md Components).
 */
export function ActionBar({
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
  /** 알림에서 들어온 대상 댓글. 댓글 시트로 그대로 흘려보낸다. */
  pinnedCommentId?: string;
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
    <button type="button" aria-label="댓글" className={CHROME_ACTION}>
      <MessageCircle className={CHROME_ICON} aria-hidden />
      <span className={CHROME_COUNT}>{formatCount(commentCount)}</span>
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <LikeButton
        postId={post.id}
        count={post.like_count}
        liked={liked}
        isGuest={isGuest}
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
          pinnedCommentId={pinnedCommentId}
        >
          {commentButton}
        </CommentSheet>
      )}

      <button
        type="button"
        onClick={handleShare}
        aria-label="공유"
        className={CHROME_ACTION}
      >
        <Share2 className={CHROME_ICON} aria-hidden />
        <span className={CHROME_COUNT}>{formatCount(shareCount)}</span>
      </button>

      {/* 전문 도서는 뷰어로 직행, 링크형은 도서 상세 시트로 (PRD §11-31) */}
      {post.books.epub_path !== null ? (
        <Link
          href={`/read/${post.books.id}`}
          aria-label={`${post.books.title} 바로 읽기`}
          className={CHROME_CTA}
        >
          <span className={CHROME_CTA_ICON}>
            <BookOpen className="size-5" aria-hidden />
          </span>
          <span className={CHROME_COUNT}>읽기</span>
        </Link>
      ) : (
        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            aria-label={`${post.books.title} 도서 정보 보기`}
            className={CHROME_CTA}
          >
            <span className={CHROME_CTA_ICON}>
              <Info className="size-5" aria-hidden />
            </span>
            <span className={CHROME_COUNT}>도서</span>
          </button>
        </BookSheet>
      )}
    </div>
  );
}
