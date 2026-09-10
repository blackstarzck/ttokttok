import { describe, expect, it } from "vitest";
import { flattenLikedPosts, flattenMyComments } from "@/lib/activity";

describe("flattenLikedPosts", () => {
  it("게시물과 도서가 있는 행만 남긴다", () => {
    const out = flattenLikedPosts([
      { posts: { id: "p1", books: { id: "b1", title: "책1" } } },
      { posts: { id: "p2", books: { id: "b2", title: "책2" } } },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      postId: "p1",
      book: { id: "b1", title: "책1" },
    });
  });

  it("게시물이 null인 행을 버린다 — 미발행이면 RLS가 null로 준다", () => {
    const out = flattenLikedPosts([
      { posts: null },
      { posts: { id: "p1", books: { id: "b1", title: "책1" } } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].postId).toBe("p1");
  });

  it("도서가 null인 행도 버린다 — 커버를 그릴 수 없다", () => {
    expect(flattenLikedPosts([{ posts: { id: "p1", books: null } }])).toEqual(
      [],
    );
  });

  it("빈 입력은 빈 배열", () => {
    expect(flattenLikedPosts([])).toEqual([]);
  });

  it("같은 도서의 게시물이 여럿이면 둘 다 남긴다 — 게시물 단위 목록이다", () => {
    const out = flattenLikedPosts([
      { posts: { id: "p1", books: { id: "b1", title: "책1" } } },
      { posts: { id: "p2", books: { id: "b1", title: "책1" } } },
    ]);
    expect(out.map((l) => l.postId)).toEqual(["p1", "p2"]);
  });
});

describe("flattenMyComments", () => {
  it("게시물·도서가 있는 행을 평평하게 만든다", () => {
    const out = flattenMyComments([
      {
        id: "c1",
        content: "좋네요",
        created_at: "2026-09-03T00:00:00Z",
        posts: { id: "p1", books: { title: "책1" } },
      },
    ]);
    expect(out).toEqual([
      {
        id: "c1",
        content: "좋네요",
        createdAt: "2026-09-03T00:00:00Z",
        postId: "p1",
        bookTitle: "책1",
      },
    ]);
  });

  it("게시물이 null인 행을 버린다 — 갈 곳이 없는 댓글이다", () => {
    expect(
      flattenMyComments([
        { id: "c1", content: "x", created_at: "t", posts: null },
      ]),
    ).toEqual([]);
  });

  it("도서 제목이 없으면 빈 문자열로 채운다 — 목록이 깨지지 않게", () => {
    const out = flattenMyComments([
      {
        id: "c1",
        content: "x",
        created_at: "t",
        posts: { id: "p1", books: null },
      },
    ]);
    expect(out[0].bookTitle).toBe("");
    expect(out[0].postId).toBe("p1");
  });

  it("빈 입력은 빈 배열", () => {
    expect(flattenMyComments([])).toEqual([]);
  });
});
