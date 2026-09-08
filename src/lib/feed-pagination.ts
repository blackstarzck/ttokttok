/**
 * 피드 페이지네이션의 순수 규칙 — `CardFeed`(홈)와 `FeedScroller`(릴스)가
 * 함께 쓴다.
 *
 * 왜 뽑아냈나: 두 컴포넌트가 같은 TanStack Query 구조를 쓰게 되면서
 * 중복 제거 훑기가 두 벌이 됐다. 이 저장소는 문자열·로직 복제로 이미 두 번
 * 갈라진 전례가 있고(`chrome.ts`/`card-chrome.ts`), 무엇보다 여기 규칙들은
 * **화면 없이 검증할 수 있는 종류**다 — 브라우저로만 확인하면 다음 사람이
 * 고칠 때 근거가 남지 않는다.
 */

/** 서버 액션이 돌려주는 한 페이지의 최소 모양 (`MoreFeed`와 호환). */
export type FeedPageLike<TNode> = {
  postIds: string[];
  nodes: TNode[];
};

/**
 * 페이지들을 하나로 이으면서 **먼저 나온 게시물만** 남긴다.
 *
 * 왜 필요한가: 키가 겹치면 React가 렌더를 뒤섞는다. 커서가 정확해도 두
 * 페이지 사이에 새 글이 발행되면 같은 게시물이 이번 페이지와 다음 페이지
 * 양쪽의 정렬 결과에 걸릴 수 있다. 뒤에 온 쪽을 버리는 이유는 화면에 이미
 * 그려진 자리를 옮기지 않기 위해서다 — 사용자가 보고 있는 항목이 스크롤
 * 도중에 뛰면 그게 더 나쁘다.
 *
 * 노드 타입을 열어 둔 것은 테스트에서 React 엘리먼트 없이 문자열로 검증하기
 * 위해서다 — vitest는 environment=node라 렌더링이 없다 (FRONTEND.md).
 */
export function dedupePages<TNode>(
  pages: readonly FeedPageLike<TNode>[] | undefined,
): { postIds: string[]; nodes: TNode[] } {
  const seen = new Set<string>();
  const postIds: string[] = [];
  const nodes: TNode[] = [];

  for (const page of pages ?? []) {
    page.postIds.forEach((pid, i) => {
      if (seen.has(pid)) return;
      seen.add(pid);
      postIds.push(pid);
      nodes.push(page.nodes[i]);
    });
  }
  return { postIds, nodes };
}

/**
 * 릴스에서 다음 페이지를 지금 받아야 하는가.
 *
 * 바닥 센티널이 아니라 인덱스로 판단한다 — 슬롯이 하나같이 컨테이너
 * 높이(스냅)라 바닥 센티널은 마지막 게시물에 닿아야만 보인다. "끝에서
 * `gap`개 남으면"이 PRD §5.1의 프리페치 규약이다.
 *
 * `isError`에서 멈추는 이유: 전역 retry는 1회이고(providers.tsx), 그마저
 * 실패한 뒤에도 계속 부르면 사용자가 위아래로 움직일 때마다 같은 요청을
 * 다시 쏜다.
 */
export function shouldPrefetch({
  active,
  count,
  gap,
  hasNextPage,
  isFetching,
  isError,
}: {
  /** 지금 보고 있는 슬롯 인덱스. */
  active: number;
  /** 붙어 있는 게시물 수. */
  count: number;
  /** 끝에서 몇 개 남았을 때 받을 것인가. */
  gap: number;
  hasNextPage: boolean;
  isFetching: boolean;
  isError: boolean;
}): boolean {
  if (!hasNextPage || isFetching || isError) return false;
  return active >= count - gap;
}
