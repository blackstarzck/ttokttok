import { describe, expect, it } from "vitest";
import {
  commentErrorMessage,
  countRepliesByParent,
  likedIdSet,
  timeAgo,
  toCursor,
  type Comment,
} from "@/lib/comments";

describe("timeAgo", () => {
  it("1분 미만은 '방금'", () => {
    expect(timeAgo(new Date().toISOString())).toBe("방금");
  });

  it("분 단위", () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("5분 전");
  });

  it("시간 단위", () => {
    const iso = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(timeAgo(iso)).toBe("3시간 전");
  });

  it("일 단위", () => {
    const iso = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(timeAgo(iso)).toBe("2일 전");
  });

  it("30일 이상은 절대 날짜", () => {
    const iso = new Date(Date.now() - 40 * 86_400_000).toISOString();
    expect(timeAgo(iso)).toBe(new Date(iso).toLocaleDateString("ko-KR"));
  });

  it("59분과 60분의 경계에서 단위가 바뀐다", () => {
    expect(timeAgo(new Date(Date.now() - 59 * 60_000).toISOString())).toBe(
      "59분 전",
    );
    expect(timeAgo(new Date(Date.now() - 60 * 60_000).toISOString())).toBe(
      "1시간 전",
    );
  });
});

describe("commentErrorMessage", () => {
  it("금칙어 예외를 사람 말로 바꾼다", () => {
    expect(commentErrorMessage("BANNED_WORD")).toBe(
      "사용할 수 없는 표현이 포함되어 있어요.",
    );
  });

  it("길이 제약 위반을 사람 말로 바꾼다", () => {
    expect(
      commentErrorMessage('violates check constraint "comments_content_check"'),
    ).toBe("댓글은 1자 이상 1000자 이하로 써 주세요.");
  });

  it("모르는 오류는 일반 안내로 떨어진다", () => {
    expect(commentErrorMessage("some network failure")).toBe(
      "댓글을 남기지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  });
});

/** 테스트용 댓글 하나. 검증에 쓰이는 필드만 의미가 있다. */
function comment(id: string, createdAt: string): Comment {
  return {
    id,
    content: "c",
    created_at: createdAt,
    user_id: "u",
    parent_id: null,
    reply_count: 0,
    like_count: 0,
    liked: false,
    profiles: null,
  };
}

describe("toCursor", () => {
  it("페이지가 덜 찼으면 커서가 없다 — 마지막 페이지", () => {
    const items = [comment("a", "2026-09-02T00:00:00Z")];
    expect(toCursor(items, 20)).toBeNull();
  });

  it("빈 페이지도 커서가 없다", () => {
    expect(toCursor([], 20)).toBeNull();
  });

  it("페이지가 꽉 찼으면 마지막 항목이 커서가 된다", () => {
    const items = [
      comment("a", "2026-09-02T00:00:02Z"),
      comment("b", "2026-09-02T00:00:01Z"),
    ];
    expect(toCursor(items, 2)).toEqual({
      createdAt: "2026-09-02T00:00:01Z",
      id: "b",
    });
  });

  it("정확히 size일 때 커서를 만든다 — 경계", () => {
    const items = [comment("a", "2026-09-02T00:00:00Z")];
    expect(toCursor(items, 1)).not.toBeNull();
    expect(toCursor(items, 2)).toBeNull();
  });
});

describe("commentErrorMessage — 삭제된 부모", () => {
  it("PARENT_DELETED를 사람 말로 바꾼다", () => {
    expect(commentErrorMessage("PARENT_DELETED")).toBe(
      "삭제된 댓글에는 답글을 달 수 없어요.",
    );
  });
});

describe("countRepliesByParent", () => {
  it("부모별로 센다", () => {
    const counts = countRepliesByParent([
      { parent_id: "p1" },
      { parent_id: "p2" },
      { parent_id: "p1" },
    ]);
    expect(counts.get("p1")).toBe(2);
    expect(counts.get("p2")).toBe(1);
  });

  it("답글이 없는 부모는 맵에 없다 — 호출부가 0으로 폴백한다", () => {
    const counts = countRepliesByParent([{ parent_id: "p1" }]);
    expect(counts.has("p2")).toBe(false);
    expect(counts.get("p2") ?? 0).toBe(0);
  });

  it("빈 입력은 빈 맵", () => {
    expect(countRepliesByParent([]).size).toBe(0);
  });

  it("parent_id가 null인 행은 세지 않는다", () => {
    const counts = countRepliesByParent([
      { parent_id: null },
      { parent_id: "p1" },
    ]);
    expect(counts.size).toBe(1);
    expect(counts.get("p1")).toBe(1);
  });
});

describe("likedIdSet", () => {
  it("행들을 id 집합으로 접는다", () => {
    const s = likedIdSet([{ comment_id: "a" }, { comment_id: "b" }]);
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("빈 입력은 빈 집합", () => {
    expect(likedIdSet([]).size).toBe(0);
  });

  it("없는 id는 false — 호출부가 그대로 liked로 쓴다", () => {
    const s = likedIdSet([{ comment_id: "a" }]);
    expect(s.has("zzz")).toBe(false);
  });

  it("같은 id가 중복돼도 집합이라 한 번만 센다", () => {
    const s = likedIdSet([{ comment_id: "a" }, { comment_id: "a" }]);
    expect(s.size).toBe(1);
  });
});
