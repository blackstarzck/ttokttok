"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Heart, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCount } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";

function Action({
  label,
  count,
  onClick,
  children,
}: {
  label: string;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      {children}
      <span className="text-xs tabular-nums">{formatCount(count)}</span>
    </button>
  );
}

/**
 * 게시물 우측 세로 액션 바.
 *
 * "바로 읽기"가 이 그룹의 마지막(=엄지에 가장 가까운) 자리에 들어간다.
 * 나머지가 고스트 아이콘인 것과 달리 채워진 원형으로 두어, 그룹에 속하면서도
 * 핵심 전환 버튼이라는 위계를 잃지 않게 한다 (DESIGN.md Components).
 *
 * Phase 1에서는 공유만 실제로 기록된다 (비로그인 가능).
 * 좋아요·댓글은 로그인이 필요해 Phase 2로 미뤄져 있고, 지금은 안내만 한다
 * (PRD Phase 1 — "소셜 카운트 UI ... 탭 시 로그인 준비 중 처리").
 */
export function ActionBar({ post }: { post: FeedPost }) {
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

  return (
    <div className="flex flex-col items-center gap-4">
      <Action
        label="좋아요"
        count={post.like_count}
        onClick={() => toast("로그인하면 좋아요를 누를 수 있어요")}
      >
        <Heart className="size-6" aria-hidden />
      </Action>

      <Action
        label="댓글"
        count={post.comment_count}
        onClick={() => toast("댓글은 곧 열려요")}
      >
        <MessageCircle className="size-6" aria-hidden />
      </Action>

      <Action label="공유" count={shareCount} onClick={handleShare}>
        <Share2 className="size-6" aria-hidden />
      </Action>

      <Link
        href={`/read/${post.books.id}`}
        aria-label={`${post.books.title} 바로 읽기`}
        className="focus-visible:ring-ring flex flex-col items-center gap-1 rounded-md focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-full transition-opacity hover:opacity-90">
          <BookOpen className="size-5" aria-hidden />
        </span>
        <span className="text-xs">읽기</span>
      </Link>
    </div>
  );
}
