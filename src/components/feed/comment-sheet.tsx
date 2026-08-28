"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { track } from "@/lib/analytics";
import {
  REPORT_REASONS,
  addComment,
  commentErrorMessage,
  fetchComments,
  removeComment,
  reportComment,
  timeAgo,
  type ReportReason,
} from "@/lib/comments";

/**
 * 댓글 바텀시트 (PRD §5.5).
 *
 * 목록은 시트를 열 때 받는다 — 피드의 모든 게시물 댓글을 미리 받을
 * 이유가 없다. 서버 상태라 TanStack Query가 맡는다 (FRONTEND.md §4).
 */
export function CommentSheet({
  postId,
  currentUserId,
  children,
}: {
  postId: string;
  currentUserId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const qc = useQueryClient();

  const key = ["comments", postId];

  const { data: comments, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchComments(postId),
    enabled: open, // 열기 전에는 받지 않는다
  });

  const add = useMutation({
    mutationFn: (content: string) => addComment(postId, content),
    onSuccess: () => {
      setDraft("");
      void track("comment", { postId });
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(commentErrorMessage(e.message)),
  });

  const remove = useMutation({
    mutationFn: removeComment,
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
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

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>

      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left">
          <DrawerTitle>
            댓글{comments ? ` ${comments.length}` : ""}
          </DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="max-h-[45vh] px-4">
          {isLoading ? (
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
          ) : !comments?.length ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              첫 댓글을 남겨보세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-4 pb-4">
              {comments.map((c) => {
                const mine = c.user_id === currentUserId;
                return (
                  <li key={c.id} className="flex gap-3">
                    <Avatar className="size-8 shrink-0">
                      {c.profiles?.avatar_url ? (
                        <AvatarImage src={c.profiles.avatar_url} alt="" />
                      ) : null}
                      <AvatarFallback className="text-xs">
                        {c.profiles?.nickname?.slice(0, 1) ?? "?"}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.profiles?.nickname ?? "독자"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {timeAgo(c.created_at)}
                        </span>
                      </div>

                      <p className="text-sm leading-relaxed break-keep whitespace-pre-wrap">
                        {c.content}
                      </p>

                      {reporting === c.id ? (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {REPORT_REASONS.map((r) => (
                            <Button
                              key={r.value}
                              variant="secondary"
                              size="sm"
                              disabled={report.isPending}
                              onClick={() =>
                                report.mutate({ id: c.id, reason: r.value })
                              }
                            >
                              {r.label}
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReporting(null)}
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
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(c.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="text-muted-foreground min-h-11 min-w-11 shrink-0"
                        aria-label="댓글 신고"
                        onClick={() => setReporting(c.id)}
                      >
                        <Flag className="size-4" aria-hidden />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <form
          className="flex items-end gap-2 border-t p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (text) add.mutate(text);
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="댓글을 남겨보세요"
            aria-label="댓글 입력"
            rows={1}
            maxLength={1000}
            className="max-h-32 min-h-11 flex-1 resize-none"
          />
          <Button
            type="submit"
            size="icon-lg"
            className="min-h-11 min-w-11 shrink-0"
            aria-label="댓글 등록"
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
