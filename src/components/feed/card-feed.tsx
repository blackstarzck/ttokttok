"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSessionId } from "@/lib/session-id";
import { loadMoreCards } from "@/app/(main)/feed-actions";
import type { FeedCursor } from "@/lib/feed";
import type { MoreFeed } from "@/app/(main)/feed-actions";

/** 조회로 집계하기까지 뷰포트에 머물러야 하는 시간 (PRD §5.1). */
const VIEW_DWELL_MS = 1000;

/**
 * 홈 카드 목록 (IA 개편 결정 1·11).
 *
 * 전면 피드(FeedScroller)의 손코딩 페이지네이션을 복제하지 않고 TanStack
 * Query를 쓴다 — FRONTEND.md §4가 피드 페이지네이션을 그쪽 몫으로 지정하고
 * 있고, FeedScroller가 그 규칙을 어긴 자리에서 "가드가 자기 요청을
 * 취소해 다음 페이지가 영영 안 붙던" 버그가 나왔다.
 *
 * 서버가 렌더를 마친 JSX를 페이지 단위로 받는다. 첫 페이지는 서버
 * 컴포넌트가 넘겨준 것을 initialData로 쓴다.
 */
export function CardFeed({
  initialNodes,
  initialPostIds,
  seed,
  initialCursor,
}: {
  initialNodes: React.ReactNode[];
  initialPostIds: string[];
  seed: string;
  initialCursor: FeedCursor | null;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loggedRef = useRef(new Set<string>());

  const query = useInfiniteQuery<MoreFeed>({
    queryKey: ["home-cards", seed],
    queryFn: ({ pageParam }) =>
      loadMoreCards(seed, getSessionId(), pageParam as FeedCursor | null),
    initialPageParam: initialCursor,
    getNextPageParam: (last) => last.nextCursor,
    initialData: {
      pages: [
        { nodes: initialNodes, postIds: initialPostIds, nextCursor: initialCursor },
      ],
      pageParams: [null],
    },
  });

  // 바닥에 닿으면 다음 페이지. IntersectionObserver라 스크롤 이벤트를
  // 매 프레임 듣지 않는다.
  //
  // deps에 query 객체를 통째로 넣지 말 것 — 매 렌더 새 객체라 옵저버가
  // 렌더마다 해제·재생성된다. 값 셋만 넣는다(fetchNextPage는 TanStack
  // Query가 안정적으로 유지한다). FeedScroller가 상태를 가드이자
  // 의존성으로 함께 써서 자기 요청을 취소하던 버그와 같은 부류다.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const nodes = query.data?.pages.flatMap((p) => p.nodes) ?? [];
  const postIds = query.data?.pages.flatMap((p) => p.postIds) ?? [];

  // 조회 집계 — 1초 이상 보이면 게시물당 한 번. 세는 단위는 게시물이라
  // 카드 하나가 곧 한 번이다(설계 결정 11).
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>("[data-post-id]");
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.postId;
          if (!id) continue;

          if (entry.isIntersecting) {
            if (loggedRef.current.has(id) || timers.has(id)) continue;
            timers.set(
              id,
              setTimeout(() => {
                timers.delete(id);
                loggedRef.current.add(id);
                void createClient()
                  .rpc("record_view", { p_post_id: id, p_session_id: getSessionId() })
                  .then(({ error }) => {
                    if (error) loggedRef.current.delete(id); // 다음 기회에 재시도
                  });
              }, VIEW_DWELL_MS),
            );
          } else {
            const t = timers.get(id);
            if (t) {
              clearTimeout(t);
              timers.delete(id);
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    cards.forEach((c) => io.observe(c));
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [postIds.length]);

  return (
    // 풀블리드 — 좌우 패딩을 주지 말 것. 카드 폭이 곧 본문 폭이고,
    // 12px씩만 넣어도 본문이 4:5 상자를 21px 넘긴다(post-card.tsx 주석의
    // 실측). 카드 사이 구분은 PostCard의 아래 경계선이 맡으므로 gap도 없다.
    <div className="flex h-full flex-col overflow-y-auto">
      {nodes.map((node, i) => (
        <div key={postIds[i] ?? i} data-post-id={postIds[i]}>
          {node}
        </div>
      ))}

      <div ref={sentinelRef} className="h-1" aria-hidden />

      {isFetchingNextPage ? (
        <div className="flex justify-center py-4">
          <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
          <span className="sr-only">다음 게시물을 불러오는 중</span>
        </div>
      ) : null}
    </div>
  );
}
