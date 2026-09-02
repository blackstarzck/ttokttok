import { describe, expect, it } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import {
  insertOptimistic,
  isOptimistic,
  makeOptimisticComment,
} from "@/lib/comment-cache";
import type { Comment, CommentPage } from "@/lib/comments";

function page(...ids: string[]): CommentPage {
  return {
    items: ids.map((id) => ({
      id,
      content: id,
      created_at: "2026-09-02T00:00:00Z",
      user_id: "u",
      parent_id: null,
      reply_count: 0,
      profiles: null,
    })),
    cursor: null,
  };
}

function data(...pages: CommentPage[]): InfiniteData<CommentPage> {
  return { pages, pageParams: pages.map(() => null) };
}

describe("makeOptimisticComment", () => {
  it("낙관적 id로 표시된 댓글을 만든다", () => {
    const c = makeOptimisticComment({
      content: "안녕",
      userId: "u1",
      parentId: null,
    });
    expect(isOptimistic(c.id)).toBe(true);
    expect(c.content).toBe("안녕");
    expect(c.user_id).toBe("u1");
    expect(c.parent_id).toBeNull();
    expect(c.reply_count).toBe(0);
  });

  it("부모가 있으면 답글로 만든다", () => {
    const c = makeOptimisticComment({
      content: "답",
      userId: "u1",
      parentId: "p1",
    });
    expect(c.parent_id).toBe("p1");
  });

  it("서버에서 온 id는 낙관적이 아니다", () => {
    expect(isOptimistic("3f0c1a4e-0000-4000-8000-000000000000")).toBe(false);
  });
});

describe("insertOptimistic", () => {
  it("최상위 댓글은 첫 페이지 맨 앞에 붙는다 — 최신순이라서", () => {
    const before = data(page("a", "b"), page("c"));
    const c = makeOptimisticComment({
      content: "new",
      userId: "u",
      parentId: null,
    });

    const after = insertOptimistic(before, c)!;

    expect(after.pages[0].items.map((i) => i.id)).toEqual([c.id, "a", "b"]);
    expect(after.pages[1].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("답글은 마지막 페이지 맨 끝에 붙는다 — 오래된 순이라서", () => {
    const before = data(page("a", "b"), page("c"));
    const c = makeOptimisticComment({
      content: "new",
      userId: "u",
      parentId: "p1",
    });

    const after = insertOptimistic(before, c)!;

    expect(after.pages[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(after.pages[1].items.map((i) => i.id)).toEqual(["c", c.id]);
  });

  it("캐시가 없으면 그대로 둔다 — 아직 안 열어본 목록", () => {
    const c = makeOptimisticComment({
      content: "new",
      userId: "u",
      parentId: null,
    });
    expect(insertOptimistic(undefined, c)).toBeUndefined();
  });

  it("페이지가 0개면 그대로 둔다", () => {
    const before = data();
    const c = makeOptimisticComment({
      content: "new",
      userId: "u",
      parentId: null,
    });
    expect(insertOptimistic(before, c)).toBe(before);
  });

  it("원본을 변형하지 않는다 — 롤백이 성립해야 한다", () => {
    const before = data(page("a"));
    const snapshot = JSON.stringify(before);
    const c = makeOptimisticComment({
      content: "new",
      userId: "u",
      parentId: null,
    });

    insertOptimistic(before, c);

    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("답글 경로도 원본을 변형하지 않는다 — 롤백이 성립해야 한다", () => {
    const before = data(page("a", "b"), page("c"));
    const snapshot = JSON.stringify(before);
    const c = makeOptimisticComment({
      content: "new",
      userId: "u",
      parentId: "p1",
    });

    insertOptimistic(before, c);

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
