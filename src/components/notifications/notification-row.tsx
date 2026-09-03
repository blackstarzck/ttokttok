"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle } from "lucide-react";
import { markRead } from "@/lib/notifications-client";
import { timeAgo } from "@/lib/comments";
import { cn } from "@/lib/utils";
import type { NotificationGroup } from "@/lib/notifications";

/** "가님 외 3명이" — 이름을 다 늘어놓으면 한 줄에 안 들어간다. */
function actorLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]}님이`;
  return `${names[0]}님 외 ${names.length - 1}명이`;
}

/**
 * 알림 한 줄 (설계 결정 15).
 *
 * 읽음은 **탭해야** 처리된다 — 목록에 들어온 것만으로 일괄 처리하면
 * 훑고 지나간 알림까지 사라져 무엇을 못 봤는지 알 수 없다.
 *
 * 낙관적으로 먼저 읽음 표시를 지우고 이동한다: 서버 왕복을 기다리면
 * 탭한 뒤에도 안 읽음 배경이 남아 눌리지 않은 것처럼 보인다.
 *
 * 안 읽음을 배경과 점 두 가지로 말하는 이유: 상태를 색으로만 말하지
 * 않는다 (DESIGN.md Colors).
 */
export function NotificationRow({ group }: { group: NotificationGroup }) {
  const [unread, setUnread] = useState(group.unread);
  const router = useRouter();
  const Icon = group.type === "reply" ? MessageCircle : Heart;

  const text =
    group.type === "reply"
      ? `${actorLabel(group.actorNames)} 회원님의 댓글에 답글을 남겼어요`
      : `${actorLabel(group.actorNames)} 회원님의 댓글을 좋아합니다`;

  function open() {
    if (unread) {
      setUnread(false);
      void markRead(group.ids).catch(() => setUnread(true));
    }
    router.push(`/p/${group.postId}?comment=${group.commentId}`);
  }

  return (
    <li>
      <button
        type="button"
        onClick={open}
        className={cn(
          "focus-visible:ring-ring flex min-h-11 w-full items-start gap-3 rounded-lg p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
          unread ? "bg-accent" : "hover:bg-accent",
        )}
      >
        <Icon
          className={cn("mt-0.5 size-4 shrink-0", unread && "fill-current")}
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm leading-relaxed break-keep">{text}</span>
          {group.excerpt ? (
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {group.excerpt}
            </span>
          ) : null}
          <span className="text-muted-foreground text-xs">
            {timeAgo(group.createdAt)}
          </span>
        </span>
        {unread ? (
          <span
            aria-label="읽지 않음"
            className="bg-foreground mt-2 size-2 shrink-0 rounded-full"
          />
        ) : null}
      </button>
    </li>
  );
}
