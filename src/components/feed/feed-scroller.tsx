"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Children } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSessionId } from "@/lib/session-id";
import { loadMoreFeed } from "@/app/(main)/feed-actions";

/** 활성 게시물 기준 앞뒤로 마운트할 개수 (FRONTEND.md §6 가상화). */
const WINDOW = 2;

/** 조회로 집계하기까지 뷰포트에 머물러야 하는 시간 (PRD §5.1). */
const VIEW_DWELL_MS = 1000;

/** 끝에서 이만큼 남으면 다음 페이지를 미리 받는다 (PRD §5.1 프리페치). */
const PREFETCH_GAP = 3;

export function FeedScroller({
  postIds: initialIds,
  seed,
  initialCursor,
  children,
}: {
  postIds: string[];
  seed: string;
  initialCursor: number | null;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const [postIds, setPostIds] = useState(initialIds);
  const [items, setItems] = useState<React.ReactNode[]>(() =>
    Children.toArray(children),
  );
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);

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

  // ── 다음 페이지 프리페치 ──────────────────────────────────────
  useEffect(() => {
    if (cursor === null || loadingMore) return;
    if (active < postIds.length - PREFETCH_GAP) return;

    let cancelled = false;
    setLoadingMore(true);

    loadMoreFeed(seed, getSessionId(), cursor)
      .then((page) => {
        if (cancelled) return;
        // 서버가 이미 렌더한 노드를 뒤에 붙인다.
        setItems((prev) => [...prev, ...page.nodes]);
        setPostIds((prev) => [...prev, ...page.postIds]);
        setCursor(page.nextCursor);
      })
      .catch((err) => console.error("피드 추가 로드 실패:", err))
      .finally(() => {
        if (!cancelled) setLoadingMore(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, cursor, loadingMore, postIds.length, seed]);

  // ── 활성 게시물 판정 + 조회 집계 ──────────────────────────────
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
    // postIds가 늘면 새 슬롯도 관찰해야 한다.
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

      {loadingMore ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
          <span className="sr-only">다음 게시물을 불러오는 중</span>
        </div>
      ) : null}
    </div>
  );
}
