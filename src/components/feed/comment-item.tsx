"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Flag, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  REPORT_REASONS,
  fetchReplyPage,
  timeAgo,
  type Comment,
  type CommentCursor,
  type CommentPage,
  type ReportReason,
} from "@/lib/comments";

/** 컴포저가 "누구에게 다는 답글인지" 알기 위한 최소 정보. */
export type ReplyTarget = { parentId: string; nickname: string };

/**
 * 행 하나가 필요로 하는 동작 묶음. 최상위와 답글이 같은 행 컴포넌트를
 * 쓰므로 한 벌로 내려보낸다.
 *
 * 신고가 두 함수인 이유: 깃발 버튼은 사유 선택 UI를 열 뿐이고, 실제
 * 신고는 사유를 골라야 일어난다. 한 이름으로 합치면 사유가 전달되지 않는다.
 */
export type RowActions = {
  currentUserId: string;
  reporting: string | null;
  removePending: boolean;
  reportPending: boolean;
  onRemove: (id: string) => void;
  onOpenReport: (id: string) => void;
  onSubmitReport: (id: string, reason: ReportReason) => void;
  onCancelReport: () => void;
};

/**
 * 댓글 한 줄. 최상위와 답글이 같은 마크업을 쓴다 — 답글은 아바타가 한
 * 단계 작고(size-6) 부모가 들여쓰기를 준다. 마크업을 두 벌로 나누면
 * 신고·삭제 동작이 한쪽에서만 고쳐진다.
 */
function CommentRow({
  comment,
  actions,
  compact = false,
  onReply,
}: {
  comment: Comment;
  actions: RowActions;
  compact?: boolean;
  onReply: () => void;
}) {
  const mine = comment.user_id === actions.currentUserId;
  const nickname = comment.profiles?.nickname ?? "독자";

  return (
    <li className="flex gap-3">
      <Avatar className={compact ? "size-6 shrink-0" : "size-8 shrink-0"}>
        {comment.profiles?.avatar_url ? (
          <AvatarImage src={comment.profiles.avatar_url} alt="" />
        ) : null}
        <AvatarFallback className="text-xs">
          {nickname.slice(0, 1)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{nickname}</span>
          <span className="text-muted-foreground text-xs">
            {timeAgo(comment.created_at)}
          </span>
        </div>

        <p className="text-sm leading-relaxed break-keep whitespace-pre-wrap">
          {comment.content}
        </p>

        <button
          type="button"
          onClick={onReply}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring self-start rounded-sm text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          답글 달기
        </button>

        {actions.reporting === comment.id ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {REPORT_REASONS.map((r) => (
              <Button
                key={r.value}
                variant="secondary"
                size="sm"
                disabled={actions.reportPending}
                onClick={() => actions.onSubmitReport(comment.id, r.value)}
              >
                {r.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={actions.onCancelReport}
            >
              취소
            </Button>
          </div>
        ) : null}
      </div>

      {mine ? (
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-muted-foreground min-h-11 min-w-11 shrink-0"
          aria-label="댓글 삭제"
          disabled={actions.removePending}
          onClick={() => actions.onRemove(comment.id)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-muted-foreground min-h-11 min-w-11 shrink-0"
          aria-label="댓글 신고"
          onClick={() => actions.onOpenReport(comment.id)}
        >
          <Flag className="size-4" aria-hidden />
        </Button>
      )}
    </li>
  );
}

/**
 * 최상위 댓글 + 답글 서브트리 (설계 결정 1·3).
 *
 * 답글 쿼리는 `enabled: expanded` — 접혀 있는 동안에는 네트워크를 쓰지
 * 않는다. 시트를 닫으면 이 컴포넌트가 언마운트되므로 펼침 상태도 함께
 * 초기화된다 (두 레퍼런스와 동일).
 */
export function CommentItem({
  comment,
  actions,
  onReply,
}: {
  comment: Comment;
  actions: RowActions;
  onReply: (target: ReplyTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const nickname = comment.profiles?.nickname ?? "독자";

  const replies = useInfiniteQuery({
    queryKey: ["replies", comment.id],
    queryFn: ({ pageParam }) =>
      fetchReplyPage(comment.id, pageParam as CommentCursor | null),
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (last: CommentPage) => last.cursor,
    enabled: expanded,
  });

  const loaded = replies.data?.pages.flatMap((p) => p.items) ?? [];
  // 펼친 뒤에는 실제로 받은 개수를 신뢰한다 — 낙관적 추가가 반영된다.
  const count = expanded ? loaded.length : comment.reply_count;

  return (
    <li className="flex flex-col gap-3">
      <ul className="contents">
        <CommentRow
          comment={comment}
          actions={actions}
          onReply={() => onReply({ parentId: comment.id, nickname })}
        />
      </ul>

      {count > 0 || expanded ? (
        <div className="flex flex-col gap-3 pl-11">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-1 self-start rounded-sm text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {expanded ? (
              <ChevronUp className="size-3.5" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden />
            )}
            {expanded ? "답글 숨기기" : `답글 ${count}개 보기`}
          </button>

          {expanded ? (
            replies.isLoading ? (
              <div className="flex gap-3">
                <Skeleton className="size-6 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {loaded.map((r) => (
                    <CommentRow
                      key={r.id}
                      comment={r}
                      actions={actions}
                      compact
                      onReply={() =>
                        onReply({
                          // 1단 고정 — 답글의 답글도 부모는 최상위다.
                          parentId: comment.id,
                          nickname: r.profiles?.nickname ?? "독자",
                        })
                      }
                    />
                  ))}
                </ul>

                {replies.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    disabled={replies.isFetchingNextPage}
                    onClick={() => void replies.fetchNextPage()}
                  >
                    답글 더 보기
                  </Button>
                ) : null}
              </>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
