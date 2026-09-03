import { describe, expect, it } from "vitest";
import { groupNotifications, type NotificationRow } from "@/lib/notifications";

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n1",
    type: "comment_like",
    commentId: "c1",
    postId: "p1",
    readAt: null,
    createdAt: "2026-09-03T00:00:00Z",
    actorNickname: "가",
    commentExcerpt: "내 댓글",
    ...over,
  };
}

describe("groupNotifications", () => {
  it("같은 댓글의 좋아요를 하나로 묶는다", () => {
    const out = groupNotifications([
      row({ id: "n1", actorNickname: "가" }),
      row({ id: "n2", actorNickname: "나" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].ids).toEqual(["n1", "n2"]);
    expect(out[0].actorNames).toEqual(["가", "나"]);
  });

  it("다른 댓글의 좋아요는 따로 묶이고, 각 묶음이 자기 댓글에 대응한다", () => {
    const out = groupNotifications([
      row({ id: "n1", commentId: "c1" }),
      row({ id: "n2", commentId: "c2" }),
    ]);
    expect(out.map((g) => g.commentId)).toEqual(["c1", "c2"]);
    expect(out.map((g) => g.ids)).toEqual([["n1"], ["n2"]]);
  });

  it("답글은 묶지 않는다 — 내용도 목적지도 제각각이다", () => {
    const out = groupNotifications([
      row({ id: "n1", type: "reply", commentId: "c1" }),
      row({ id: "n2", type: "reply", commentId: "c1" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.ids.length === 1)).toBe(true);
  });

  it("묶음 안에 안 읽은 것이 하나라도 있으면 묶음이 안 읽음이다", () => {
    const out = groupNotifications([
      row({ id: "n1", readAt: "2026-09-03T01:00:00Z" }),
      row({ id: "n2", readAt: null }),
    ]);
    expect(out[0].unread).toBe(true);
  });

  it("최신(먼저 온 것)이 안 읽음이고 그다음이 읽음이어도 묶음은 안 읽음이다 — 마지막 값이 아니라 OR로 판단한다", () => {
    const out = groupNotifications([
      row({ id: "n1", readAt: null }),
      row({ id: "n2", readAt: "2026-09-03T01:00:00Z" }),
    ]);
    expect(out[0].unread).toBe(true);
  });

  it("전부 읽었으면 묶음도 읽음이다", () => {
    const out = groupNotifications([
      row({ id: "n1", readAt: "t" }),
      row({ id: "n2", readAt: "t" }),
    ]);
    expect(out[0].unread).toBe(false);
  });

  // 최신순(실제 입력 순서)으로 준다 — 뒤에 오는 것이 더 오래됐는데도 시각이
  // 최신으로 남아야 "가장 최근"이 성립한다. 오래된 것을 먼저 주면 "무조건
  // 마지막 값으로 덮기"라는 잘못된 구현도 통과해 테스트가 증거가 못 된다.
  it("묶음의 시각은 가장 최근 것이다 — 뒤에 더 오래된 것이 와도 덮이지 않는다", () => {
    const out = groupNotifications([
      row({ id: "n1", createdAt: "2026-09-03T05:00:00Z" }),
      row({ id: "n2", createdAt: "2026-09-03T00:00:00Z" }),
    ]);
    expect(out[0].createdAt).toBe("2026-09-03T05:00:00Z");
  });

  it("같은 사람이 두 번 눌러도 이름은 한 번만 나온다", () => {
    const out = groupNotifications([
      row({ id: "n1", actorNickname: "가" }),
      row({ id: "n2", actorNickname: "가" }),
    ]);
    expect(out[0].actorNames).toEqual(["가"]);
  });

  it("입력 순서(최신순)를 묶음 순서로 유지한다", () => {
    const out = groupNotifications([
      row({ id: "n1", type: "reply", commentId: "c9" }),
      row({ id: "n2", commentId: "c1" }),
    ]);
    expect(out.map((g) => g.type)).toEqual(["reply", "comment_like"]);
  });

  it("다른 묶음이 끼어든 뒤에도 이미 나온 묶음은 처음 등장한 자리를 지킨다 — 끝으로 밀리지 않는다", () => {
    const out = groupNotifications([
      row({ id: "n1", commentId: "c1" }),
      row({ id: "n2", type: "reply", commentId: "c2" }),
      row({ id: "n3", commentId: "c1" }),
    ]);
    expect(out.map((g) => g.key)).toEqual(["like:c1", "reply:n2"]);
    expect(out[0].ids).toEqual(["n1", "n3"]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(groupNotifications([])).toEqual([]);
  });
});
