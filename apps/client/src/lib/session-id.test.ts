import { describe, expect, it } from "vitest";
import { SESSION_ID_COOKIE, readSessionId } from "@/lib/session-id";

describe("readSessionId", () => {
  const ID = "3f2b7c1e-0a44-4d9b-9c2e-51a7e9f0b123";

  it("쿠키가 하나뿐일 때 값을 뽑는다", () => {
    expect(readSessionId(`${SESSION_ID_COOKIE}=${ID}`)).toBe(ID);
  });

  it("여러 쿠키 사이에서 뽑는다", () => {
    const header = `ttokttok.feed-seed=abc; ${SESSION_ID_COOKIE}=${ID}; other=x`;
    expect(readSessionId(header)).toBe(ID);
  });

  it("첫 번째 쿠키여도 뽑는다 — 앞에 세미콜론이 없다", () => {
    expect(readSessionId(`${SESSION_ID_COOKIE}=${ID}; other=x`)).toBe(ID);
  });

  it("이름이 접미사로 겹치는 쿠키를 잘못 집지 않는다", () => {
    // "x-ttokttok.session-id"가 먼저 와도 진짜 쿠키를 찾아야 한다.
    const header = `x-${SESSION_ID_COOKIE}=WRONG; ${SESSION_ID_COOKIE}=${ID}`;
    expect(readSessionId(header)).toBe(ID);
  });

  it("이름이 접두사로 겹치는 쿠키를 잘못 집지 않는다", () => {
    expect(readSessionId(`${SESSION_ID_COOKIE}-extra=WRONG`)).toBeNull();
  });

  it("없으면 null", () => {
    expect(readSessionId("ttokttok.feed-seed=abc; other=x")).toBeNull();
  });

  it("빈 문자열이면 null", () => {
    expect(readSessionId("")).toBeNull();
  });

  it("퍼센트 인코딩을 되돌린다", () => {
    expect(readSessionId(`${SESSION_ID_COOKIE}=a%20b`)).toBe("a b");
  });
});
