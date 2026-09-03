"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
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
  fetchCommentContext,
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
  pinnedCommentId,
  children,
}: {
  postId: string;
  currentUserId: string;
  /** 등록이 성공했을 때. 레일 배지의 로컬 델타에 쓴다. */
  onAdded?: () => void;
  /** 알림에서 들어온 대상 댓글. 있으면 시트를 열고 최상단에 고정한다. */
  pinnedCommentId?: string;
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
  // 소비형 신호다 — CommentItem은 펼치자마자 onExpanded로 이 값을 다시
  // null로 비운다(아래 clearExpandFor). 그래서 값이 남아 있는 구간은
  // "답글 등록 ~ 해당 CommentItem이 펼치는 순간"뿐이고, 그 다음엔 항상
  // null로 돌아가 있다. 같은 스레드에 다시 답글을 달아도 매번 null →
  // parentId라는 실제 값 변화가 생기므로 문자열 그대로 써도 effect가 매번
  // 다시 실행된다 — 매번 새 객체를 만드는 우회가 필요 없다. 값을 곧장
  // 비워두는 덕에 시트를 닫았다 다시 열어도 지난 스레드가 저절로 펼쳐지지
  // 않는다.
  const [expandFor, setExpandFor] = useState<string | null>(null);
  // effect의 deps에 그대로 들어가므로 매 렌더 새 함수면 참조가 계속
  // 바뀌어 불필요하게 effect를 다시 태운다 — useCallback으로 고정한다.
  const clearExpandFor = useCallback(() => setExpandFor(null), []);
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

  // 알림에서 들어오면 시트가 이미 열려 있어야 한다 — 한 번 더 누르게
  // 하면 알림을 탭한 의미가 없다.
  useEffect(() => {
    if (pinnedCommentId) setOpen(true);
  }, [pinnedCommentId]);

  const pinned = useQuery({
    queryKey: ["comment-context", pinnedCommentId],
    queryFn: () => fetchCommentContext(pinnedCommentId!),
    enabled: open && !!pinnedCommentId,
  });

  // 고정 블록에 이미 그려지는 루트를 일반 목록에서 한 번 더 그리면(딥링크
  // 대상이 1페이지 안에 있을 때 실제로 벌어짐) 같은 댓글이 화면에 두 번
  // 나온다. 두 사본은 서로 다른 CommentItem/CommentLikeButton 인스턴스라
  // 공유 캐시 없이 각자 useState로 좋아요 상태를 들고 있어서(설계상 결정은
  // 아니고 리뷰에서 지적된 결함), 한쪽만 눌러도 하트·카운트가 서로
  // 어긋난다. 페이지네이션 커서는 원본 comments 배열 기준으로 이미
  // 계산되어 있으므로(list.data.pages), 렌더링 직전에만 걸러내면
  // "더 보기"나 커서 계산에는 영향이 없다.
  const pinnedRootId = pinned.data?.root.id;
  const visibleComments = pinnedRootId
    ? comments.filter((c) => c.id !== pinnedRootId)
    : comments;

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
      // 캐시 조작 전용 — addComment(서버 INSERT)에는 필요 없다. rootId는
      // mutationFn 밖(onMutate/onSettled)에서만 쓰인다.
      rootId: string | null;
    }) => addComment(postId, content, parentId),

    onMutate: async ({ content, parentId, rootId }) => {
      // 캐시 조작은 전부 "서버가 평탄화한 뒤 실제로 놓일 자리" 기준이라
      // rootId를 쓴다 — parentId(진짜 답글 대상)로 하면 답글의 답글일 때
      // 엉뚱한 캐시 키(["replies", 그 답글 id])를 건드리게 된다.
      const target = rootId ? ["replies", rootId] : key;
      await qc.cancelQueries({ queryKey: target });
      const previous = qc.getQueryData<InfiniteData<CommentPage>>(target);

      const optimistic = makeOptimisticComment({
        content,
        userId: currentUserId,
        // 낙관적 행의 parent_id도 서버가 실제로 놓을 자리(rootId)를
        // 흉내 내야 한다 — 진짜 부모(parentId)를 넣으면 무효화 전까지
        // 답글이 엉뚱한 부모 밑(또는 존재하지 않는 목록)에 나타난다.
        parentId: rootId,
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
      if (rootId) setExpandFor(rootId);
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

    // 성공이든 실패든 서버 상태로 정렬을 맞춘다 — onMutate와 마찬가지로
    // rootId 기준이다.
    onSettled: (_data, _e, { rootId }) => {
      void qc.invalidateQueries({
        queryKey: rootId ? ["replies", rootId] : key,
      });
      if (rootId) void qc.invalidateQueries({ queryKey: key });
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
            <>
              {pinned.data ? (
                <div className="border-border mb-4 rounded-lg border p-2">
                  <p className="text-muted-foreground mb-2 text-xs">
                    알림에서 온 댓글
                  </p>
                  <ul className="flex flex-col gap-4">
                    <CommentItem
                      comment={pinned.data.root}
                      actions={actions}
                      onReply={setReplyTo}
                      expandFor={
                        pinned.data.target.id !== pinned.data.root.id
                          ? pinned.data.root.id
                          : null
                      }
                      highlightId={pinned.data.target.id}
                    />
                  </ul>
                </div>
              ) : null}

              <ul className="flex flex-col gap-4 pb-4">
                {visibleComments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    actions={actions}
                    onReply={setReplyTo}
                    expandFor={expandFor}
                    onExpanded={clearExpandFor}
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
            </>
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
              add.mutate({
                content: text,
                parentId: replyTo?.parentId ?? null,
                rootId: replyTo?.rootId ?? null,
              });
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
