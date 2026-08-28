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
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FeedPost } from "@/lib/feed";

const ACTION_CLASS =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none";

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
}: {
  post: FeedPost;
  liked: boolean;
  isGuest: boolean;
  userId: string | null;
}) {
  const [shareCount, setShareCount] = useState(post.share_count);

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
    const { error } = await createClient().rpc("record_share", {
      p_post_id: post.id,
    });
    if (error) {
      setShareCount((n) => Math.max(n - 1, 0));
      toast.error("공유 집계에 실패했어요");
    }
  }

  const commentButton = (
    <button type="button" aria-label="댓글" className={ACTION_CLASS}>
      <MessageCircle className="size-6" aria-hidden />
      <span className="text-xs tabular-nums">
        {formatCount(post.comment_count)}
      </span>
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
        <CommentSheet postId={post.id} currentUserId={userId!}>
          {commentButton}
        </CommentSheet>
      )}

      <button
        type="button"
        onClick={handleShare}
        aria-label="공유"
        className={ACTION_CLASS}
      >
        <Share2 className="size-6" aria-hidden />
        <span className="text-xs tabular-nums">{formatCount(shareCount)}</span>
      </button>

      {/* 전문 도서는 뷰어로 직행, 링크형은 도서 상세 시트로 (PRD §11-31) */}
      {post.books.epub_path !== null ? (
        <Link
          href={`/read/${post.books.id}`}
          aria-label={`${post.books.title} 바로 읽기`}
          className={CTA_CLASS}
        >
          <span className={CTA_ICON_CLASS}>
            <BookOpen className="size-5" aria-hidden />
          </span>
          <span className="text-xs">읽기</span>
        </Link>
      ) : (
        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            aria-label={`${post.books.title} 도서 정보 보기`}
            className={CTA_CLASS}
          >
            <span className={CTA_ICON_CLASS}>
              <Info className="size-5" aria-hidden />
            </span>
            <span className="text-xs">도서</span>
          </button>
        </BookSheet>
      )}
    </div>
  );
}

/**
 * 두 CTA는 생김새가 같아야 한다 — 도서 유형이 달라도 그룹 안에서
 * 같은 위계로 읽혀야 하기 때문. 채워진 원형이 곧 "이 게시물의 목적지"다.
 */
const CTA_CLASS = cn(
  "focus-visible:ring-ring flex flex-col items-center gap-1 rounded-md",
  "focus-visible:ring-2 focus-visible:outline-none",
);

const CTA_ICON_CLASS = cn(
  "bg-primary text-primary-foreground flex size-11 items-center",
  "justify-center rounded-full transition-opacity hover:opacity-90",
);
