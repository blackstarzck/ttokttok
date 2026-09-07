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
  initialFailed,
}: {
  initialNodes: React.ReactNode[];
  initialPostIds: string[];
  seed: string;
  initialCursor: FeedCursor | null;
  /** 첫 페이지(서버 컴포넌트)가 실패했는가 — getFeed의 failed 그대로. */
  initialFailed: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
    // 전역 기본값(providers.tsx: staleTime 30s, refetchOnWindowFocus
    // false)을 그대로 두면 마운트 시 재요청(refetchOnMount 기본 true)이
    // 남는다 — seed를 방문(브라우징 세션) 단위로 고정하는 이유가 정확히
    // "그 안에서는 순서가 재현된다"는 것인데(PRD §5.1, feed-seed.ts),
    // 이미 받아 둔 페이지를 마운트마다 다시 불러오면 그 전제가 깨진다.
    // 실측: 홈 → 릴스 → 30초+ 대기 → 홈으로 돌아오면 이미 그려 둔 카드
    // 순서가 [8,3,1,7,6,5,2,4] → [1,7,5,8,2,3,6,4]로 바뀐다 — 재요청이
    // page 1을 실제 session_id로 다시 채점하기 때문(세션 id 불일치는
    // RPC 쪽 이월 과제, 여기서 고치는 건 "왜 애초에 다시 부르는가"다).
    // 다음 페이지(스크롤 더 불러오기)는 fetchNextPage가 그대로 담당하므로
    // 영향받지 않는다.
    refetchOnMount: false,
  });

  // 바닥에 닿으면 다음 페이지. IntersectionObserver라 스크롤 이벤트를
  // 매 프레임 듣지 않는다.
  //
  // deps에 query 객체를 통째로 넣지 말 것 — 매 렌더 새 객체라 옵저버가
  // 렌더마다 해제·재생성된다. 값 셋만 넣는다(fetchNextPage는 TanStack
  // Query가 안정적으로 유지한다). FeedScroller가 상태를 가드이자
  // 의존성으로 함께 써서 자기 요청을 취소하던 버그와 같은 부류다.
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError, refetch, isFetching } = query;

  useEffect(() => {
    const el = sentinelRef.current;
    const root = containerRef.current;
    if (!el || !root) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        // isError면 자동 재시도하지 않는다 — loadMoreCards는 getFeed가
        // 실패하면 던지는데(feed-actions.tsx), 그대로 두면 실패한 페이지의
        // 커서가 그대로 남아 센티널이 계속 화면에 걸쳐 있는 동안 매
        // 교차마다 같은 요청을 다시 쏜다. 재시도는 아래 "다시 시도" 버튼
        // (수동)으로만 한다.
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage && !isError) {
          void fetchNextPage();
        }
      },
      // root를 반드시 지정해야 한다 — 스크롤 컨테이너는 뷰포트가 아니라
      // 이 컴포넌트의 overflow-y-auto div다. 스펙은 rootMargin을 적용하기
      // 전에 대상을 조상 스크롤 컨테이너 기준으로 먼저 클리핑하므로,
      // root를 안 주면(기본값 = 뷰포트) 센티널이 뷰포트 안에 있어도
      // 실제 스크롤 컨테이너 밖(아직 안 그려진 먼 아래)이면 교차가 아예
      // 안 잡힌다 — rootMargin: "600px"가 프리페치를 앞당기지 못하고
      // 바닥에 완전히 닿아야만 다음 페이지를 받는 상태로 조용히 퇴화한다.
      { root, rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

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

  // 아래 조회 집계 effect의 deps 전용 — postIds 배열 자체(참조)가 아니라
  // 값(정체성)으로 비교하려고 문자열로 편다. 게시물 id에 쉼표가 올 수
  // 없으므로(uuid) 구분자 충돌 걱정이 없다.
  const postIdsKey = postIds.join(",");

  // 조회 집계 — 1초 이상 보이면 게시물당 한 번. 세는 단위는 게시물이라
  // 카드 하나가 곧 한 번이다(설계 결정 11).
  //
  // deps는 postIdsKey(id들을 이어붙인 문자열)다 — postIds.length였을 때는
  // 개수는 그대로인데 구성이 바뀌면(예: 페이지 경계 중복 제거가 다른
  // 조합으로 걸러낼 때) 이 effect가 재실행되지 않아 새로 들어온 노드를
  // 한 번도 관찰하지 못했다. 문자열로 바꿔 값(정체성)을 직접 비교한다.
  // querySelectorAll도 document 전역이 아니라 이 컴포넌트의 컨테이너로
  // 좁힌다 — 문서 전체를 훑으면 다른 CardFeed 인스턴스나 화면 밖 마크업의
  // [data-post-id]까지 걸릴 수 있다.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const cards = root.querySelectorAll<HTMLElement>("[data-post-id]");
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
  }, [postIdsKey]);

  // 빈 상태·에러 상태 — FeedScroller와 같은 문구를 쓰되(notifications
  // 페이지 §5.5의 선례), 실패와 "정말 없음"을 구분한다. 카드가 하나도
  // 없는데 이 화면이 백지면, 배지나 알림 없이 들어온 사용자는 "원래
  // 게시물이 없나 보다"와 "불러오다 실패했나 보다"를 구분할 수 없다 —
  // getFeed가 RPC 오류 때도 빈 배열을 돌려주므로 구분하지 않으면 실패가
  // 곧 빈 화면이 된다(사전 병합 리뷰 Important 6). type='cards'로
  // 좁혀지며 빈 경우 자체도 더 잦아졌다.
  if (postIds.length === 0) {
    // initialFailed는 마운트 시점의 서버 실패만 안다 — "다시 시도"로
    // refetch()가 다시 실패하면 그 이후의 실패는 isError가 잡는다. 이
    // 실패 화면은 nextCursor가 애초에 null(getFeed 실패 시 항상 null)이라
    // hasNextPage도 늘 false다 — 아래(더 불러오기 실패) 쪽의 fetchNextPage
    // 버튼과 같은 걸 여기 놓으면 그 가드에 막혀 아무 일도 안 일어난다.
    // 페이지가 이거 하나뿐이라(첫 페이지) refetch()가 정확히 이 페이지만
    // 다시 부른다.
    const failed = initialFailed || isError;

    // "다시 시도" 클릭 직후에도 실패 문구+버튼이 그대로 남아 있으면 눌린
    // 건지 알 수 없다 — 더 불러오기 실패(아래) 쪽은 isFetchingNextPage가
    // 이 피드백을 주므로 여기도 맞춘다.
    if (isFetching) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
          <span className="sr-only">피드를 불러오는 중</span>
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6">
        <p className="text-muted-foreground text-center text-sm">
          {failed
            ? "피드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
            : "아직 게시물이 없어요."}
        </p>
        {failed ? (
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-foreground text-sm underline underline-offset-2"
          >
            다시 시도
          </button>
        ) : null}
      </div>
    );
  }

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
    //
    // 스크롤바 숨김(FeedScroller와 동일 유틸) — 없으면 데스크톱 브라우저의
    // 고전 스크롤바(15px)가 이 컨테이너의 콘텐츠 폭을 그만큼 줄인다.
    // 실측(1200px 뷰포트): article이 480이 아니라 465px로 그려졌다 —
    // post-preview.tsx·PRD §5.10·§11-52가 "홈 카드가 실제로 받는 폭"이라고
    // 적어 둔 480px과 어긋난다(미리보기 프레임은 스크롤이 없어 480 그대로다).
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {nodes.map((node, i) => (
        <div key={postIds[i] ?? i} data-post-id={postIds[i]}>
          {node}
        </div>
      ))}

      {/* shrink-0 없이 h-1만 두면 flex-col 안에서 flex-shrink:1(기본값)이
          이 항목을 0px로 눌러 버린다 — 지금은 rootMargin: "600px"가 면적
          0인 대상도 교차로 잡아 주는 덕에 우연히 동작할 뿐이다. 높이를
          지키게 해 그 여유값에 기대지 않게 한다. */}
      <div ref={sentinelRef} className="h-1 shrink-0" aria-hidden />

      {isFetchingNextPage ? (
        <div className="flex justify-center py-4">
          <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
          <span className="sr-only">다음 게시물을 불러오는 중</span>
        </div>
      ) : isError ? (
        // 이미 보여준 카드는 그대로 두고 다음 페이지만 실패로 표시한다 —
        // 첫 페이지 실패(위의 빈 상태)와 달리 여기는 이미 콘텐츠가 있으니
        // 화면을 통째로 지울 이유가 없다. 자동 재시도는 위 옵저버가
        // isError일 때 끄므로, 다시 시도는 이 버튼으로만 한다.
        <div className="flex flex-col items-center gap-2 py-4">
          <p className="text-muted-foreground text-sm">더 불러오지 못했어요.</p>
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            className="text-foreground text-sm underline underline-offset-2"
          >
            다시 시도
          </button>
        </div>
      ) : null}
    </div>
  );
}
