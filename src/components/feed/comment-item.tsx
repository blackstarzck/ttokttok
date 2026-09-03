"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Flag, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentLikeButton } from "@/components/feed/comment-like-button";
import { isOptimistic } from "@/lib/comment-cache";
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
  // 낙관적으로 끼워 넣은 행은 id가 서버 uuid가 아니다 — 확정 전에 답글·삭제·
  // 신고를 보내면 그 가짜 id가 그대로 요청에 실려 실패한다. 확정될 때까지
  // 자리는 유지한 채 동작만 잠가서, 버튼이 깜빡이며 사라졌다 나타나지 않게 한다.
  const pending = isOptimistic(comment.id);

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

        {/* gap-2 = 8px. DESIGN.md는 44×44와 함께 "인접 타깃 간 8px 이상"을
            규정한다 — 두 44px 버튼이 붙어 있으면 크기를 지켜도 오터치가 난다. */}
        <div className="flex items-center gap-2">
          <CommentLikeButton
            commentId={comment.id}
            count={comment.like_count}
            liked={comment.liked}
            disabled={pending}
          />
          <button
            type="button"
            onClick={onReply}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center self-start rounded-sm px-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            답글 달기
          </button>
        </div>

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
          disabled={pending || actions.removePending}
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
          disabled={pending}
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
 * 않는다. 시트를 닫으면 이 컴포넌트는 언마운트되어 `expanded`는 항상
 * false로 다시 시작한다 — 그래서 펼침 여부를 계속 참으로 만드는 것은
 * `expandFor` 하나뿐인데, 그 값은 소비하자마자(`onExpanded`) 부모가
 * 비운다. 그 덕에 시트를 닫았다 다시 열어도 지난 요청이 남아 있지 않아
 * 이전에 펼쳤던 스레드가 저절로 다시 펼쳐지는 일이 없다.
 */
export function CommentItem({
  comment,
  actions,
  onReply,
  expandFor,
  onExpanded,
}: {
  comment: Comment;
  actions: RowActions;
  onReply: (target: ReplyTarget) => void;
  /** 방금 답글을 단 스레드의 부모 id. 이 댓글의 id와 같으면 자동으로 펼친다. */
  expandFor?: string | null;
  /** expandFor 요청을 실제로 소비했을 때(펼쳤을 때만) 호출 — 부모가 값을
   * 비워서 같은 요청이 재오픈 때 되풀이되지 않게 한다. */
  onExpanded?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const nickname = comment.profiles?.nickname ?? "독자";

  // 답글을 단 사람이 자기 글을 봐야 한다 — 접힌 채로 두면 등록 후에도
  // 화면이 그대로라 아무 일도 없었던 것처럼 보인다. 그렇다고 "매 렌더 무조건
  // 펼치기"를 할 수는 없다 — 그러면 사용자가 방금 직접 접은 것도 즉시 다시
  // 펼쳐진다. 그래서 expandFor를 "펼쳐라"라는 소비형 요청으로 다룬다: 이
  // 댓글이 대상이면 펼치고, 그 즉시 onExpanded로 부모에게 "다 썼다"고
  // 알려 값을 null로 되돌리게 한다. 이렇게 매번 비워두면 같은 스레드에
  // 다시 답글을 달아도 부모가 null → comment.id로 실제 값을 바꿔주므로
  // effect가 다시 실행된다 — 두 번째 답글에서 값이 안 바뀐 것처럼 보여
  // effect가 스킵되는 문제(이전 버그)가 재발하지 않는다. 그리고 값을 곧장
  // 비우기 때문에, 시트를 닫았다 열어 이 컴포넌트가 새로 마운트돼도 그때는
  // expandFor가 이미 null이라 자동으로 펼쳐지는 일이 없다.
  useEffect(() => {
    if (expandFor !== comment.id) return;
    setExpanded(true);
    onExpanded?.();
  }, [expandFor, comment.id, onExpanded]);

  const replies = useInfiniteQuery({
    queryKey: ["replies", comment.id],
    queryFn: ({ pageParam }) =>
      fetchReplyPage(comment.id, pageParam as CommentCursor | null),
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (last: CommentPage) => last.cursor,
    enabled: expanded,
  });

  const loaded = replies.data?.pages.flatMap((p) => p.items) ?? [];
  const count = comment.reply_count;

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
                    className="min-h-11 self-start"
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
