import { describe, expect, it } from "vitest";
import { dedupePages, shouldPrefetch } from "./feed-pagination";

/** 노드 자리에 문자열을 넣는다 — 규칙 자체는 노드 타입과 무관하다. */
const page = (...ids: string[]) => ({
  postIds: ids,
  nodes: ids.map((id) => `node:${id}`),
});

describe("dedupePages", () => {
  it("페이지들을 순서대로 잇는다", () => {
    const { postIds, nodes } = dedupePages([page("a", "b"), page("c")]);
    expect(postIds).toEqual(["a", "b", "c"]);
    expect(nodes).toEqual(["node:a", "node:b", "node:c"]);
  });

  it("페이지 경계에서 겹친 게시물은 먼저 나온 것만 남긴다", () => {
    // 커서가 정확해도 사이에 새 글이 발행되면 실제로 생기는 상황이다.
    const { postIds } = dedupePages([page("a", "b", "c"), page("c", "d")]);
    expect(postIds).toEqual(["a", "b", "c", "d"]);
  });

  it("남는 것은 뒤가 아니라 **앞** 페이지의 노드다", () => {
    // 화면에 이미 그려진 자리를 옮기지 않으려는 것이므로, 어느 쪽을
    // 남기는지가 실제로 중요하다. 같은 id에 다른 노드를 줘서 구분한다.
    const first = { postIds: ["x"], nodes: ["처음"] };
    const second = { postIds: ["x"], nodes: ["나중"] };
    expect(dedupePages([first, second]).nodes).toEqual(["처음"]);
  });

  it("한 페이지 안의 중복도 거른다", () => {
    expect(dedupePages([page("a", "a", "b")]).postIds).toEqual(["a", "b"]);
  });

  it("id와 노드의 짝이 유지된다", () => {
    const { postIds, nodes } = dedupePages([page("a", "b"), page("b", "c")]);
    expect(nodes).toEqual(postIds.map((id) => `node:${id}`));
  });

  it("빈 입력과 undefined를 견딘다", () => {
    expect(dedupePages([])).toEqual({ postIds: [], nodes: [] });
    expect(dedupePages(undefined)).toEqual({ postIds: [], nodes: [] });
    expect(dedupePages([page()])).toEqual({ postIds: [], nodes: [] });
  });
});

describe("shouldPrefetch", () => {
  const base = {
    active: 7,
    count: 10,
    gap: 3,
    hasNextPage: true,
    isFetching: false,
    isError: false,
  };

  it("끝에서 gap개 남으면 받는다", () => {
    // count 10, gap 3 → 인덱스 7부터가 "3개 남음"이다.
    expect(shouldPrefetch({ ...base, active: 7 })).toBe(true);
  });

  it("그 직전 슬롯에서는 아직 받지 않는다", () => {
    expect(shouldPrefetch({ ...base, active: 6 })).toBe(false);
  });

  it("마지막 슬롯에서도 받는다", () => {
    expect(shouldPrefetch({ ...base, active: 9 })).toBe(true);
  });

  it("다음 페이지가 없으면 받지 않는다", () => {
    expect(shouldPrefetch({ ...base, hasNextPage: false })).toBe(false);
  });

  it("이미 받는 중이면 또 부르지 않는다", () => {
    // 손코딩 시절 이 가드를 deps로 함께 쓰다가 자기 요청을 취소했다.
    expect(shouldPrefetch({ ...base, isFetching: true })).toBe(false);
  });

  it("실패한 뒤에는 멈춘다 — 스크롤할 때마다 다시 쏘지 않는다", () => {
    expect(shouldPrefetch({ ...base, isError: true })).toBe(false);
  });

  it("게시물이 gap보다 적으면 첫 슬롯부터 받는다", () => {
    // count 2, gap 3 → 2 - 3 = -1이라 active 0도 조건을 넘는다.
    expect(shouldPrefetch({ ...base, active: 0, count: 2 })).toBe(true);
  });
});
