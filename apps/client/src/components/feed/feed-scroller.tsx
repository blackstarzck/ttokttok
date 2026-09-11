"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Children } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSessionId } from "@/lib/session-id";
import { loadMoreFeed } from "@/app/(main)/feed-actions";
import type { MoreFeed } from "@/app/(main)/feed-actions";
import { dedupePages, shouldPrefetch } from "@ttokttok/shared/feed-pagination";
import type { FeedCursor, PostType } from "@ttokttok/shared/feed";
import { VideoSlot } from "@/components/feed/video-slot";
import { allowsVideoPreload, nextVideoToPreload } from "@/lib/video-preload";

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
  initialFailed = false,
  cacheKey,
  type = null,
  initialIndex = 0,
  children,
}: {
  postIds: string[];
  seed: string;
  initialCursor: FeedCursor | null;
  /**
   * 첫 페이지(서버 컴포넌트)가 실패했는가 — `getFeed`의 `failed` 그대로.
   *
   * 채널 스코프 뷰어는 넘기지 않는다: 그쪽은 조회 실패를 페이지에서 먼저
   * 가려내 `LoadFailed`를 그리므로(§11-61) 여기까지 오면 이미 성공이다.
   */
  initialFailed?: boolean;
  /**
   * 이 스크롤러의 캐시 범위. **호출부마다 달라야 한다.**
   *
   * 채널 스코프 뷰어는 랭킹을 타지 않아 `seed=""`를 넘긴다(결정 §11-58).
   * 그래서 키를 seed만으로 잡으면 **모든 채널 뷰어가 같은 캐시 항목을
   * 공유해**, 먼저 마운트된 채널의 게시물이 다른 채널 화면에 그대로
   * 나타난다(initialData가 그 키에 심기고 `refetchOnMount: false`라 다시
   * 받지도 않는다). 라우트를 구분하는 값을 넘길 것 — 릴스 탭은 `"reels"`,
   * 채널 뷰어는 `` `channel:${slug}` ``.
   */
  cacheKey: string;
  /** 이 스크롤러가 보여주는 게시물 유형. 다음 페이지도 같은 유형이어야
   * 하므로 요청마다 함께 보낸다. FeedScroller는 이제 릴스 전용이라 항상
   * "video"를 받는다 — null 허용은 홈도 이 컴포넌트를 쓰던 시절(전면
   * 피드였을 때)의 흔적이고, 홈이 CardFeed로 바뀐 지금은 null을 넘기는
   * 호출부가 없다. */
  type?: PostType | null;
  /**
   * 처음 보여줄 슬롯. 채널 스코프 뷰어가 "탭한 게시물에서 시작"에 쓴다.
   * active의 초기값이자 마운트 직후 스크롤 위치다 — 윈도우가 active 기준
   * ±2만 마운트하므로 둘 중 하나만 하면 빈 화면이나 엉뚱한 위치가 된다.
   */
  initialIndex?: number;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ index: initialIndex, direction: 1 });
  const { index: active, direction } = position;
  const [settled, setSettled] = useState<typeof position | null>(null);
  const [buffered, setBuffered] = useState<number | null>(null);
  const [preloadEnabled, setPreloadEnabled] = useState(false);

  useEffect(() => {
    // Identity matters: returning to the same index during rapid swipes starts a new dwell.
    const timer = window.setTimeout(() => setSettled(position), 250);
    return () => window.clearTimeout(timer);
  }, [position]);

  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: EventTarget & { saveData?: boolean; effectiveType?: string };
    }).connection;
    const update = () => setPreloadEnabled(
      !document.hidden && navigator.onLine && allowsVideoPreload(connection),
    );
    update();
    connection?.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      connection?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const reportBuffer = useCallback((index: number, ready: boolean) => {
    setBuffered((previous) => ready ? index : previous === index ? null : previous);
  }, []);

  // 이미 집계한 게시물 — 리렌더를 유발할 필요가 없으므로 ref로 둔다.
  const loggedRef = useRef(new Set<string>());

  const initialNodes = useMemo(() => Children.toArray(children), [children]);

  /**
   * 페이지네이션은 TanStack Query가 맡는다 (FRONTEND.md §4).
   *
   * 예전에는 useState + useEffect로 손코딩했고, 정확히 거기서 버그가
   * 나왔다: 진행 중 플래그를 가드이자 deps로 함께 써서 `setLoadingMore(true)`가
   * 곧바로 effect를 cleanup→재실행시켰고, 재실행된 쪽은 "이미 로딩 중"이라
   * 즉시 return하는 사이 원래 fetch의 결과는 cleanup이 세운 cancelled
   * 플래그에 버려졌다. 다음 페이지가 영영 안 붙고 스피너만 남았다.
   * 그 문제는 ref 가드로 막았지만, 요청 수명을 직접 들고 있는 한 같은
   * 부류가 또 나올 수 있다 — 여기서는 아예 소유권을 넘긴다.
   *
   * 그래서 아래 프리페치 effect에는 **cleanup이 없다.** 재실행돼도
   * 가드에 걸려 그냥 빠져나갈 뿐, 취소할 것이 없다.
   *
   * `refetchOnMount: false`는 CardFeed와 같은 이유다 — seed를 방문 단위로
   * 고정하는 전제(PRD §5.1)가 마운트마다 재요청하면 깨진다. 릴스는
   * 탭을 오갈 때 실제로 매번 다시 마운트된다.
   */
  const query = useInfiniteQuery<MoreFeed>({
    queryKey: ["feed-scroller", cacheKey, seed],
    queryFn: ({ pageParam }) =>
      loadMoreFeed(seed, getSessionId(), pageParam as FeedCursor | null, type),
    initialPageParam: initialCursor,
    getNextPageParam: (last) => last.nextCursor,
    initialData: {
      pages: [
        { nodes: initialNodes, postIds: initialIds, nextCursor: initialCursor },
      ],
      pageParams: [null],
    },
    refetchOnMount: false,
  });

  // query 객체를 통째로 deps에 넣지 말 것 — 매 렌더 새 객체다. 값만 꺼낸다
  // (fetchNextPage는 TanStack Query가 안정적으로 유지한다).
  const {
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isError,
    isFetching,
    refetch,
  } = query;

  // 페이지 경계 중복 제거 — CardFeed와 같은 규칙이라 lib으로 공유한다
  // (근거와 테스트는 feed-pagination.ts). 예전에는 "이미 붙인 것"을 ref로
  // 기억했지만, 이제 매 렌더 pages 전체가 오므로 앞에서부터 훑는다.
  const { nodes, postIds } = useMemo(
    () => dedupePages(query.data?.pages),
    [query.data],
  );

  // 아래 옵저버 effect의 deps 전용 — 배열 참조가 아니라 값(정체성)으로
  // 비교하려고 문자열로 편다. 개수만 보면 구성이 바뀌어도(중복 제거가
  // 다른 조합으로 걸러낼 때) 재실행되지 않아 새 슬롯을 관찰하지 못한다.
  // 게시물 id는 uuid라 쉼표가 올 수 없다.
  const postIdsKey = postIds.join(",");
  const preloadIndex = nextVideoToPreload({
    active, direction, count: postIds.length,
    settled: settled === position ? active : null, buffered, enabled: preloadEnabled,
  });

  const recordView = useCallback(async (postId: string) => {
    if (loggedRef.current.has(postId)) return;
    loggedRef.current.add(postId);

    const { error } = await createClient().rpc("record_view", {
      p_post_id: postId,
      p_session_id: getSessionId(),
    });
    if (error) loggedRef.current.delete(postId); // 다음 기회에 재시도
  }, []);

  // 시작 슬롯으로 한 번만 이동한다. 스냅 컨테이너라 scrollTop을 직접 준다 —
  // scrollIntoView는 부모 스크롤까지 건드릴 수 있다.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (jumpedRef.current || initialIndex === 0) return;
    const container = containerRef.current;
    const slot = container?.querySelector<HTMLElement>(
      `[data-index="${initialIndex}"]`,
    );
    if (!container || !slot) return;
    jumpedRef.current = true;
    // slot.offsetTop은 쓰지 않는다 — offsetTop은 가장 가까운 positioned
    // 조상(offsetParent) 기준인데, 이 컨테이너는 position: static이라
    // 실제 offsetParent는 <body>다. 지금은 컨테이너의
    // getBoundingClientRect().top이 우연히 0이라 두 값이 일치할 뿐,
    // 위에 positioned 조상이 생기거나 구조적 헤더가 컨테이너 앞에
    // 붙으면(홈에 §11-53로 붙은 것과 같은 방향) 조용히 엉뚱한 위치로
    // 스크롤한다. 슬롯은 하나같이 컨테이너 높이 그대로다(그래서 스냅이
    // 성립한다) — initialIndex × clientHeight가 그 사실을 그대로 옮긴
    // 식이라 레이아웃이 바뀌어도 깨지지 않는다.
    container.scrollTop = initialIndex * container.clientHeight;
  }, [initialIndex]);

  // ── 다음 페이지 프리페치 ──────────────────────────────────────
  // 판단 규칙은 feed-pagination.ts에 있다(테스트로 고정). 여기에는
  // "그래서 부른다"만 남긴다.
  useEffect(() => {
    if (
      !shouldPrefetch({
        active,
        count: postIds.length,
        gap: PREFETCH_GAP,
        hasNextPage,
        isFetching: isFetchingNextPage,
        isError,
      })
    ) {
      return;
    }
    void fetchNextPage();
  }, [
    active,
    postIds.length,
    hasNextPage,
    isFetchingNextPage,
    isError,
    fetchNextPage,
  ]);

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

          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setPosition((prev) => prev.index === index ? prev : {
              index, direction: index > prev.index ? 1 : -1,
            });
            const previousTimer = timers.get(postId);
            if (previousTimer) clearTimeout(previousTimer);
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
    // 게시물이 늘면 새 슬롯도 관찰해야 한다.
  }, [postIdsKey, recordView]);

  // 빈 상태 — 실패와 "정말 없음"을 가른다 (§11-61). 백지로 두면 사용자는
  // "영상이 아직 없나 보다"로 읽고 다시 시도하지 않는다.
  if (postIds.length === 0) {
    const failed = initialFailed || isError;

    // "다시 시도" 직후에도 같은 문구가 남아 있으면 눌린 건지 알 수 없다.
    if (isFetching) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
          <span className="sr-only">피드를 불러오는 중</span>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
        <p className="text-muted-foreground text-center text-sm break-keep">
          {failed
            ? "피드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
            : "아직 게시물이 없어요."}
        </p>
        {failed ? (
          // 페이지가 첫 장 하나뿐이라 refetch()가 정확히 그것만 다시 부른다
          // (nextCursor가 null이라 fetchNextPage는 가드에 막힌다).
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
          {Math.abs(i - active) <= WINDOW ? (
            <VideoSlot index={i} preload={i === preloadIndex} onBuffer={reportBuffer}>
              {nodes[i]}
            </VideoSlot>
          ) : null}
        </div>
      ))}

      {/*
        끝 슬롯 — 다음 페이지를 받는 중이거나 실패했을 때만 나온다.

        게시물 슬롯과 같은 **전체 높이 + snap-start**다. 예전에는 h-16
        블록이었는데, 스냅 컨테이너에서 슬롯이 하나같이 컨테이너 높이라
        64px짜리는 마지막 게시물에서 오버스크롤해야 잠깐 보인다 — 실패를
        거기 두면 사실상 안 보이는 것과 같아서, 사용자는 그냥 "영상이
        여기까지인가 보다"로 읽는다. 슬롯으로 두면 다른 게시물과 똑같이
        스크롤해서 닿는다.

        로딩과 실패가 **같은 슬롯**을 쓰는 것도 의도다: "다시 시도"를 누른
        순간 슬롯이 사라졌다가 다시 생기면 사용자 발밑에서 레이아웃이
        뛴다. 자리를 지키고 안쪽만 바꾼다.

        data-index·data-post-id를 주지 않는다 — 옵저버가 관찰하지 않아야
        active 판정과 조회 집계가 이 슬롯에 걸리지 않는다.
      */}
      {isFetchingNextPage || isError ? (
        <div className="flex h-full snap-start snap-always flex-col items-center justify-center gap-3 px-6">
          {isFetchingNextPage ? (
            <>
              <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
              <span className="sr-only">다음 게시물을 불러오는 중</span>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-center text-sm break-keep">
                더 불러오지 못했어요.
              </p>
              {/* 자동 재시도는 프리페치 가드가 isError에서 끊는다
                  (feed-pagination.ts) — 여기서만 다시 부른다. */}
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="text-foreground text-sm underline underline-offset-2"
              >
                다시 시도
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
