"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Children } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSessionId } from "@/lib/session-id";
import { loadMoreFeed } from "@/app/(main)/feed-actions";
import type { FeedCursor, PostType } from "@/lib/feed";

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
  type = null,
  children,
}: {
  postIds: string[];
  seed: string;
  initialCursor: FeedCursor | null;
  /** 이 스크롤러가 보여주는 게시물 유형. 다음 페이지도 같은 유형이어야
   * 하므로 요청마다 함께 보낸다. 널이면 전 유형(현재 홈). */
  type?: PostType | null;
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

  // 이미 붙인 게시물. setState 업데이터는 순수해야 하고 StrictMode에서 두 번
  // 돌기 때문에, 중복 판정은 그 밖에서 ref로 한다.
  const knownIdsRef = useRef(new Set(initialIds));

  const recordView = useCallback(async (postId: string) => {
    if (loggedRef.current.has(postId)) return;
    loggedRef.current.add(postId);

    const { error } = await createClient().rpc("record_view", {
      p_post_id: postId,
      p_session_id: getSessionId(),
    });
    if (error) loggedRef.current.delete(postId); // 다음 기회에 재시도
  }, []);

  // 진행 중인 요청이 있는지 추적하는 가드. state(loadingMore)가 아니라
  // ref인 이유: 이 값을 deps에 넣으면(예전처럼 loadingMore를 넣으면)
  // setLoadingMore(true)가 곧바로 deps를 바꿔 effect를 cleanup→재실행시킨다.
  // 재실행된 쪽은 "이미 로딩 중"이라 즉시 return하고, 원래 fetch가 나중에
  // 끝나도 클로저 속 cancelled 플래그 때문에 결과가 버려지며 loadingMore는
  // false로 되돌아갈 기회를 잃어 스피너가 영원히 남는다. ref는 값이 바뀌어도
  // deps로 잡히지 않으므로 이 문제가 없다. loadingMore(state)는 스피너
  // 렌더링 전용으로만 남긴다 — exhaustive-deps 경고를 지우려고 이 ref를
  // 다시 state로, 혹은 loadingMore를 deps로 되돌리지 말 것.
  const loadingRef = useRef(false);

  // ── 다음 페이지 프리페치 ──────────────────────────────────────
  useEffect(() => {
    if (cursor === null || loadingRef.current) return;
    if (active < postIds.length - PREFETCH_GAP) return;

    loadingRef.current = true;
    setLoadingMore(true);

    loadMoreFeed(seed, getSessionId(), cursor, type)
      .then((page) => {
        // 이미 붙어 있는 게시물은 거른다. 키가 겹치면 React가 렌더를
        // 뒤섞는다 — 커서가 정확해도 사이에 새 글이 발행되면 생길 수 있다.
        const fresh = page.postIds
          .map((pid, i) => ({ pid, node: page.nodes[i] }))
          .filter(({ pid }) => !knownIdsRef.current.has(pid));
        fresh.forEach(({ pid }) => knownIdsRef.current.add(pid));

        setItems((prev) => [...prev, ...fresh.map((f) => f.node)]);
        setPostIds((prev) => [...prev, ...fresh.map((f) => f.pid)]);
        setCursor(page.nextCursor);
      })
      .catch((err) => console.error("피드 추가 로드 실패:", err))
      .finally(() => {
        loadingRef.current = false;
        setLoadingMore(false);
      });
  }, [active, cursor, postIds.length, seed, type]);

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
