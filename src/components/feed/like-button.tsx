"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { LoginSheet } from "@/components/auth/login-sheet";
import { createClient } from "@/lib/supabase/client";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

const BUTTON_CLASS =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none";

/**
 * 좋아요 토글 (PRD §5.5).
 *
 * 낙관적으로 먼저 반영하고 실패하면 되돌린다 — 누른 즉시 반응해야
 * 하는 동작이라 왕복을 기다리지 않는다 (FRONTEND.md §4).
 *
 * 게스트는 로그인 시트를 띄운다. 카운트 자체는 게스트에게도 보인다.
 */
export function LikeButton({
  postId,
  count,
  liked,
  isGuest,
}: {
  postId: string;
  count: number;
  liked: boolean;
  isGuest: boolean;
}) {
  const [optimistic, setOptimistic] = useState({ liked, count });
  const [, startTransition] = useTransition();

  if (isGuest) {
    return (
      <LoginSheet reason="로그인하면 좋아요를 누를 수 있어요.">
        <button type="button" aria-label="좋아요" className={BUTTON_CLASS}>
          <Heart className="size-6" aria-hidden />
          <span className="text-xs tabular-nums">{formatCount(count)}</span>
        </button>
      </LoginSheet>
    );
  }

  function toggle() {
    const next = {
      liked: !optimistic.liked,
      count: optimistic.count + (optimistic.liked ? -1 : 1),
    };
    const previous = optimistic;
    setOptimistic(next);

    startTransition(async () => {
      const db = createClient();
      const { error } = next.liked
        ? await db.from("likes").insert({ post_id: postId })
        : await db.from("likes").delete().eq("post_id", postId);

      if (error) {
        setOptimistic(previous);
        toast.error("잠시 후 다시 시도해 주세요");
        console.error("like:", error.message);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="좋아요"
      aria-pressed={optimistic.liked}
      className={BUTTON_CLASS}
    >
      {/* 채움만으로 상태를 말한다 — 빨간 하트는 관례지만 이 디자인
          시스템에서 유채색은 도서 표지의 몫이다 (DESIGN.md Colors). */}
      <Heart
        className={cn("size-6", optimistic.liked && "fill-current text-foreground")}
        aria-hidden
      />
      <span className="text-xs tabular-nums">
        {formatCount(optimistic.count)}
      </span>
    </button>
  );
}
