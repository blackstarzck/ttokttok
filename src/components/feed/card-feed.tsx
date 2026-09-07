"use client";

import { useEffect, useMemo, useRef } from "react";
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

  // 페이지 경계 중복 제거 — feed-scroller.tsx의 knownIdsRef와 같은 이유다:
  // 키가 겹치면 React가 렌더를 뒤섞는다. 커서가 정확해도 두 페이지 사이에
  // 새 글이 발행되면 같은 게시물이 이번 페이지와 다음 페이지 양쪽의 정렬
  // 결과에 걸릴 수 있다. FeedScroller는 페이지를 하나씩 수동으로 붙이므로
  // ref로 "이미 붙인 것"을 기억하지만, 여기는 TanStack Query가 매 렌더
  // pages 전체를 새로 준다 — 그래서 ref 대신 전체 페이지를 앞에서부터
  // 훑어 먼저 나온 것만 남긴다(뒤에 또 나오면 버린다). pages 배열 자체가
  // 매번 참조가 바뀌므로 useMemo 캐시는 재계산을 막는 용도일 뿐, 정합성은
  // 이 훑기 자체가 보장한다.
  const { nodes, postIds } = useMemo(() => {
    const seen = new Set<string>();
    const outNodes: React.ReactNode[] = [];
    const outIds: string[] = [];
    for (const page of query.data?.pages ?? []) {
      page.postIds.forEach((pid, i) => {
        if (seen.has(pid)) return;
        seen.add(pid);
        outNodes.push(page.nodes[i]);
        outIds.push(pid);
      });
    }
    return { nodes: outNodes, postIds: outIds };
  }, [query.data]);

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
    // 풀블리드 — 좌우 패딩을 주지 말 것. 카드 폭이 곧 본문 폭이라, 패딩을
    // 주면 폭이 줄어 글이 더 여러 줄로 늘어나고 본문(가변 높이, post-card.tsx
    // 참고)이 그만큼 더 길어진다. 카드 사이 구분은 PostCard의 아래 경계선이
    // 맡으므로 gap도 없다.
    //
    // h-full이 아니라 min-h-0 flex-1이다 — TopBar가 오버레이가 아니라
    // page.tsx에서 이 목록의 flex 형제가 됐다(설계 결정 8). h-full을
    // 쓰면 부모(h-full 컬럼) 안에서 TopBar 몫까지 포함해 자기 높이로
    // 요구해 목록이 넘친다 — flex-1이 TopBar가 쓰고 남은 높이만 받고,
    // min-h-0이 그 안에서 자기 콘텐츠(카드 전부) 때문에 늘어나 셸을
    // 넘기지 않고 여기서 스스로 스크롤하게 한다.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
