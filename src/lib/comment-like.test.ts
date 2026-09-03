import { describe, expect, it } from "vitest";
import { nextLikeState } from "@/lib/comment-like";

describe("nextLikeState", () => {
  it("안 누른 상태에서 누르면 켜지고 1 오른다", () => {
    expect(nextLikeState({ liked: false, count: 3 })).toEqual({
      liked: true,
      count: 4,
    });
  });

  it("누른 상태에서 다시 누르면 꺼지고 1 내린다", () => {
    expect(nextLikeState({ liked: true, count: 4 })).toEqual({
      liked: false,
      count: 3,
    });
  });

  it("두 번 누르면 제자리로 돌아온다", () => {
    const start = { liked: false, count: 7 };
    expect(nextLikeState(nextLikeState(start))).toEqual(start);
  });

  it("카운트가 0 아래로 내려가지 않는다", () => {
    // 서버 카운트가 0인데 liked가 true인 어긋난 상태에서도 -1을 그리지 않는다.
    expect(nextLikeState({ liked: true, count: 0 })).toEqual({
      liked: false,
      count: 0,
    });
  });

  it("입력을 변형하지 않는다 — 롤백이 스냅샷을 되돌린다", () => {
    const start = { liked: false, count: 1 };
    const snapshot = JSON.stringify(start);
    nextLikeState(start);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
