"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSessionId } from "@/lib/session-id";

/** 활성 게시물 기준 앞뒤로 마운트할 개수 (FRONTEND.md §6 가상화). */
const WINDOW = 2;

/** 조회로 집계하기까지 뷰포트에 머물러야 하는 시간 (PRD §5.1). */
const VIEW_DWELL_MS = 1000;

/**
 * 세로 스냅 스크롤 + 가상화 + 조회 집계.
 *
 * 게시물은 children으로 받는다 — 스크롤 동작만 클라이언트에 두고
 * 카드 트리(PostItem → 카드 템플릿 → zod 스키마)는 서버 컴포넌트로
 * 남겨 클라이언트 번들에서 뺀다 (FRONTEND.md §2, §6).
 */
export function FeedScroller({
  postIds,
  children,
}: {
  postIds: string[];
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = Children.toArray(children);

  // 이미 집계한 게시물 — 리렌더를 유발할 필요가 없으므로 ref로 둔다.
  const loggedRef = useRef(new Set<string>());

  const recordView = useCallback(async (postId: string) => {
    if (loggedRef.current.has(postId)) return;
    loggedRef.current.add(postId);

    const { error } = await createClient().rpc("record_view", {
      p_post_id: postId,
      p_session_id: getSessionId(),
    });
    if (error) loggedRef.current.delete(postId); // 다음 기회에 재시도
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const postId = el.dataset.postId;
          const index = Number(el.dataset.index);
          if (!postId) continue;

          if (entry.isIntersecting) {
            setActive((prev) => (prev === index ? prev : index));
            timers.set(
              postId,
              setTimeout(() => recordView(postId), VIEW_DWELL_MS),
            );
          } else {
            const timer = timers.get(postId);
            if (timer) {
              clearTimeout(timer);
              timers.delete(postId);
            }
          }
        }
      },
      { root: container, threshold: 0.6 },
    );

    const slots = container.querySelectorAll("[data-index]");
    slots.forEach((slot) => observer.observe(slot));

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [postIds, recordView]);

  if (postIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-muted-foreground text-sm">아직 게시물이 없어요.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {postIds.map((id, i) => (
        // 슬롯은 항상 자리를 지키고(스크롤 길이 유지), 내용만 창 밖에서 비운다.
        <div
          key={id}
          data-index={i}
          data-post-id={id}
          className="h-full snap-start snap-always"
        >
          {Math.abs(i - active) <= WINDOW ? items[i] : null}
        </div>
      ))}
    </div>
  );
}
