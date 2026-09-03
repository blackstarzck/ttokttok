"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { toggleCommentLike } from "@/lib/comments";
import { nextLikeState } from "@/lib/comment-like";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 댓글·답글의 좋아요 하트 (설계 결정 11).
 *
 * 누른 즉시 반영하고 실패하면 되돌린다 — 왕복을 기다리면 연타했을 때
 * 화면이 뒤늦게 따라온다 (FRONTEND.md §4).
 *
 * 상태를 색이 아니라 **채움**으로 구분한다 (DESIGN.md Colors): 유채색은
 * 도서 표지의 몫이고, 색맹 사용자에게도 형태가 더 확실하다.
 *
 * 피드의 LikeButton과 합치지 않는 이유: 그쪽은 흰색 고정 크롬이고
 * 이쪽은 시트 안 테마 토큰이다. 한 컴포넌트가 두 색 체계를 boolean prop
 * 으로 오가면 그 경계가 무너진다.
 */
export function CommentLikeButton({
  commentId,
  count,
  liked,
  disabled = false,
}: {
  commentId: string;
  count: number;
  liked: boolean;
  disabled?: boolean;
}) {
  const [state, setState] = useState({ liked, count });
  const [, startTransition] = useTransition();

  function toggle() {
    const previous = state;
    const next = nextLikeState(state);
    setState(next);

    startTransition(async () => {
      try {
        await toggleCommentLike(commentId, next.liked);
      } catch {
        setState(previous);
        toast.error("좋아요를 반영하지 못했어요");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={state.liked}
      aria-label={state.liked ? "좋아요 취소" : "좋아요"}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-1 rounded-sm px-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <Heart
        className={cn("size-3.5", state.liked && "fill-current")}
        aria-hidden
      />
      {state.count > 0 ? (
        <span className="tabular-nums">{formatCount(state.count)}</span>
      ) : null}
    </button>
  );
}
