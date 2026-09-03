"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CommentItem,
  type ReplyTarget,
  type RowActions,
} from "@/components/feed/comment-item";
import { track } from "@/lib/analytics";
import {
  insertOptimistic,
  makeOptimisticComment,
} from "@/lib/comment-cache";
import {
  addComment,
  commentErrorMessage,
  fetchCommentPage,
  removeComment,
  reportComment,
  type CommentCursor,
  type CommentPage,
  type ReportReason,
} from "@/lib/comments";

/**
 * 댓글 바텀시트 (PRD §5.5).
 *
 * 목록은 시트를 열 때 받는다 — 피드의 모든 게시물 댓글을 미리 받을
 * 이유가 없다. 서버 상태라 TanStack Query가 맡는다 (FRONTEND.md §4).
 *
 * 답글은 인라인 확장이다 — 시트 안에 네비게이션 스택을 만들지 않는다
 * (설계 결정 1). 그래서 이 컴포넌트에는 화면 전환 상태가 없고,
 * 펼침 여부는 각 CommentItem이 스스로 들고 있다.
 */
export function CommentSheet({
  postId,
  currentUserId,
  onAdded,
  children,
}: {
  postId: string;
  currentUserId: string;
  /** 등록이 성공했을 때. 레일 배지의 로컬 델타에 쓴다. */
  onAdded?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // 방금 답글을 등록한 스레드의 부모 id. 해당 CommentItem이 이 값을 보고
  // 스스로 펼친다 — 접힌 스레드에 답글을 달면 등록해도 화면에 아무 변화가
  // 없어 보이는 문제(발견 1)를 막는다.
  //
  // 문자열이 아니라 매번 새 객체로 담는다 — 같은 스레드에 두 번째 답글을
  // 달면 parentId 문자열 자체는 똑같아서 참조가 바뀌지 않고, CommentItem의
  // effect는 참조 동일성으로 재실행 여부를 판단하므로 두 번째 답글에서는
  // 아예 실행되지 않는다(사용자가 이미 한 번 접어 둔 스레드가 계속 접힌
  // 채로 남는 버그). 매번 `{ parentId }`로 새로 만들면 값이 같아도 항상
  // 새 참조라 effect가 매번 실행된다.
  const [expandFor, setExpandFor] = useState<{ parentId: string } | null>(
    null,
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const key = ["comments", postId];

  const list = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      fetchCommentPage(postId, pageParam as CommentCursor | null),
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (last: CommentPage) => last.cursor,
    enabled: open, // 열기 전에는 받지 않는다
  });

  const comments = list.data?.pages.flatMap((p) => p.items) ?? [];

  // 답글 대상이 정해지면 입력창으로 포커스를 옮긴다 —
  // 멘션이 없으므로(결정 7) 배너가 유일한 대상 표시다.
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  const add = useMutation({
    mutationFn: ({
      content,
      parentId,
    }: {
      content: string;
      parentId: string | null;
    }) => addComment(postId, content, parentId),

    onMutate: async ({ content, parentId }) => {
      const target = parentId ? ["replies", parentId] : key;
      await qc.cancelQueries({ queryKey: target });
      const previous = qc.getQueryData<InfiniteData<CommentPage>>(target);

      const optimistic = makeOptimisticComment({
        content,
        userId: currentUserId,
        parentId,
      });
      qc.setQueryData<InfiniteData<CommentPage>>(target, (old) =>
        insertOptimistic(old, optimistic),
      );

      // 비우기 전에 원래 값을 챙겨둔다 — 실패하면 onError가 그대로 되돌려서
      // 입력창을 즉시 비우는 낙관적 UX는 유지하면서도 쓴 글을 잃지 않게 한다.
      const previousDraft = draft;
      const previousReplyTo = replyTo;
      setDraft("");
      setReplyTo(null);
      if (parentId) setExpandFor({ parentId });
      return { target, previous, previousDraft, previousReplyTo };
    },

    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.target, ctx.previous);
      if (ctx) {
        // 사용자가 대기 중에 새로 입력한 내용을 덮어쓰지 않기 위해,
        // 현재 상태가 onMutate가 남긴 상태(draft="", replyTo=null)일 때만 복구한다.
        setDraft((d) => (d === "" ? ctx.previousDraft : d));
        setReplyTo((r) => (r === null ? ctx.previousReplyTo : r));
      }
      toast.error(commentErrorMessage(e.message));
    },

    onSuccess: () => {
      void track("comment", { postId });
      onAdded?.();
    },

    // 성공이든 실패든 서버 상태로 정렬을 맞춘다.
    onSettled: (_data, _e, { parentId }) => {
      void qc.invalidateQueries({
        queryKey: parentId ? ["replies", parentId] : key,
      });
      if (parentId) void qc.invalidateQueries({ queryKey: key });
    },
  });

  const remove = useMutation({
    mutationFn: removeComment,
    onSuccess: () => {
      // 연쇄 숨김(결정 6)으로 답글도 사라지므로 답글 캐시까지 무효화한다.
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["replies"] });
    },
    onError: () => toast.error("삭제하지 못했어요"),
  });

  const report = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: ReportReason }) =>
      reportComment(id, reason),
    onSuccess: () => {
      setReporting(null);
      toast.success("신고를 접수했어요");
    },
    onError: (e: Error) => {
      setReporting(null);
      toast(
        e.message === "ALREADY_REPORTED"
          ? "이미 신고한 댓글이에요"
          : "신고하지 못했어요",
      );
    },
  });

  const actions: RowActions = {
    currentUserId,
    reporting,
    removePending: remove.isPending,
    reportPending: report.isPending,
    onRemove: (id) => remove.mutate(id),
    onOpenReport: (id) => setReporting(id),
    onSubmitReport: (id, reason) => report.mutate({ id, reason }),
    onCancelReport: () => setReporting(null),
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>

      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left">
          <DrawerTitle>댓글</DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="max-h-[45vh] px-4">
          {list.isLoading ? (
            <div className="flex flex-col gap-4 pb-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !comments.length ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              첫 댓글을 남겨보세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-4 pb-4">
              {comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  actions={actions}
                  onReply={setReplyTo}
                  expandFor={expandFor}
                />
              ))}

              {list.hasNextPage ? (
                <li>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 w-full"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage ? "불러오는 중…" : "댓글 더 보기"}
                  </Button>
                </li>
              ) : null}
            </ul>
          )}
        </ScrollArea>

        {replyTo ? (
          <div className="text-muted-foreground flex items-center gap-2 border-t px-4 pt-3 text-xs">
            <span className="truncate">
              {replyTo.nickname}님에게 답글 남기는 중
            </span>
            <Button
              variant="ghost"
              size="icon-lg"
              className="ml-auto min-h-11 min-w-11 shrink-0"
              aria-label="답글 대상 해제"
              onClick={() => setReplyTo(null)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}

        <form
          className={
            replyTo
              ? "flex items-end gap-2 px-4 pt-1 pb-4"
              : "flex items-end gap-2 border-t p-4"
          }
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (text) {
              add.mutate({ content: text, parentId: replyTo?.parentId ?? null });
            }
          }}
        >
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={replyTo ? "답글을 남겨보세요" : "댓글을 남겨보세요"}
            aria-label={replyTo ? "답글 입력" : "댓글 입력"}
            rows={1}
            maxLength={1000}
            className="max-h-32 min-h-11 flex-1 resize-none"
          />
          <Button
            type="submit"
            size="icon-lg"
            className="min-h-11 min-w-11 shrink-0"
            aria-label={replyTo ? "답글 등록" : "댓글 등록"}
            disabled={!draft.trim() || add.isPending}
          >
            {add.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
