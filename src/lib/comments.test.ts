import { describe, expect, it } from "vitest";
import { commentErrorMessage, timeAgo } from "@/lib/comments";

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
