"use client";

import { useRef, useState } from "react";
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
  // 세 번 연타해도 PATCH가 한 번만 나가게 막는 재진입 가드.
  // state가 아니면 안 되는 이유: 동기 클릭 3번이 리렌더 사이 없이 연달아
  // 들어오면 `unread`는 첫 렌더의 클로저 값 그대로라 매번 true로 읽혀
  // 가드가 안 걸린다. ref는 그 자리에서 바로 갱신되어 두 번째 클릭부터 막는다.
  const openingRef = useRef(false);
  const Icon = group.type === "reply" ? MessageCircle : Heart;
  // 안읽음 설명을 버튼 밖 요소에 매달 id. 묶음마다 고유한 group.key로 만든다.
  const unreadDescriptionId = `notification-unread-${group.key}`;

  const text =
    group.type === "reply"
      ? `${actorLabel(group.actorNames)} 회원님의 댓글에 답글을 남겼어요`
      : `${actorLabel(group.actorNames)} 회원님의 댓글을 좋아합니다`;

  function open() {
    if (openingRef.current) return;
    openingRef.current = true;

    if (unread) {
      setUnread(false);
      // 롤백하지 않는다: 바로 아래 router.push가 동기로 이어져 이 행은
      // 실패 응답이 오기 한참 전에 이미 언마운트된다. 실패해도 서버가
      // 다음 로드의 진실이라 /notifications로 돌아오면 다시 안읽음으로
      // 정확히 뜬다 — 낙관적 갱신을 되돌릴 화면 자체가 이미 없다.
      // 실패는 콘솔에만 남겨 디버깅 단서로 쓴다.
      void markRead(group.ids).catch((err) => {
        console.error("markRead 실패:", err);
      });
    }
    router.push(`/p/${group.postId}?comment=${group.commentId}`);
  }

  return (
    <li>
      {unread ? (
        // 버튼 "밖"에 두고 aria-describedby로만 연결한다. 버튼 안에
        // sr-only로 넣으면(이전 구현의 점처럼) 텍스트가 접근 가능한 이름에
        // 합쳐져 읽음/안읽음마다 이름이 달라진다 — 토글 버튼 이름이 상태에
        // 따라 바뀌면 안 된다는 규칙을 이 화면에도 그대로 적용한다
        // (comment-like-button.tsx, 2단계에서 실제로 겪은 사고).
        // description은 name과 별개 채널로 announce되어 이름을 건드리지 않는다.
        <span id={unreadDescriptionId} className="sr-only">
          읽지 않음
        </span>
      ) : null}
      <button
        type="button"
        onClick={open}
        aria-describedby={unread ? unreadDescriptionId : undefined}
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
          // 채워진 아이콘 + 배경과 정보가 겹치는 순수 시각 신호라 장식으로
          // 둔다 — 스크린리더 몫은 위 aria-describedby가 이미 전달한다.
          <span
            aria-hidden
            className="bg-foreground mt-2 size-2 shrink-0 rounded-full"
          />
        ) : null}
      </button>
    </li>
  );
}
