import { describe, expect, it } from "vitest";
import {
  blockedAuthorReason,
  isListable,
  normalizeAuthorKey,
} from "@/lib/book-rights";

describe("normalizeAuthorKey", () => {
  /**
   * `"정지용".normalize("NFD")`는 8개 코드 포인트다 — macOS Finder·클립보드
   * 경로가 한글을 자모 분해로 내놓는다. 정규화하지 않으면 금지 저작자가
   * 조용히 통과한다. 이건 우회를 막는 관문이 아니라 실수로 새는 걸 막는
   * 관문이라, 놓치는 쪽이 진짜 실패다.
   */
  it("NFD로 분해된 한글을 NFC로 모은다", () => {
    expect(normalizeAuthorKey("정지용".normalize("NFD"))).toBe("정지용");
  });

  it("폭 없는 문자를 걷어낸다", () => {
    // 눈에 보이지 않는 문자는 픽스처에서도 이스케이프로 쓴다.
    expect(normalizeAuthorKey("정지\u200B용")).toBe("정지용");
  });

  it("공백을 걷어낸다 — 「김 기림」이 「김기림」과 같은 키가 된다", () => {
    expect(normalizeAuthorKey("김 기림")).toBe("김기림");
    expect(normalizeAuthorKey("  백석  ")).toBe("백석");
  });
});

describe("blockedAuthorReason", () => {
  it("월북·납북 작가를 이유와 함께 돌려준다", () => {
    expect(blockedAuthorReason("정지용")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("이태준")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("박태원")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("홍명희")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("김기림")).toMatch(/월북·납북/);
  });

  it("저작권이 존속하는 작가를 이유와 함께 돌려준다", () => {
    expect(blockedAuthorReason("백석")).toMatch(/1996년/);
    expect(blockedAuthorReason("박경리")).toMatch(/2008년/);
  });

  it("정규화가 필요한 입력도 잡는다", () => {
    expect(blockedAuthorReason("정지용".normalize("NFD"))).not.toBeNull();
    expect(blockedAuthorReason(" 김 기림 ")).not.toBeNull();
  });

  it("금지 목록에 없으면 null", () => {
    expect(blockedAuthorReason("현진건")).toBeNull();
    expect(blockedAuthorReason("김유정")).toBeNull();
  });

  it("null·undefined·빈 문자열을 견딘다", () => {
    expect(blockedAuthorReason(null)).toBeNull();
    expect(blockedAuthorReason(undefined)).toBeNull();
    expect(blockedAuthorReason("")).toBeNull();
  });

  /**
   * 객체 리터럴로 명단을 두면 `BLOCKED["constructor"]`가 함수를 반환해
   * "차단됨"으로 오판된다. Map이어야 하는 이유다.
   */
  it("프로토타입 키를 차단으로 오판하지 않는다", () => {
    expect(blockedAuthorReason("constructor")).toBeNull();
    expect(blockedAuthorReason("__proto__")).toBeNull();
    expect(blockedAuthorReason("toString")).toBeNull();
  });

  /** 실측한 저자 이름에 괄호형이 있다 — 「김소월(김정식)」·「이정호(李定鎬)」. */
  it("괄호 붙은 이름도 잡는다", () => {
    expect(blockedAuthorReason("정지용(鄭芝溶)")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("백석（白石）")).toMatch(/1996년/);
  });

  it("괄호 앞이 금지 명단에 없으면 통과한다", () => {
    expect(blockedAuthorReason("김소월(김정식)")).toBeNull();
  });
});

describe("isListable", () => {
  it("금지 목록에 없고 번역물이 아니면 목록에 보인다", () => {
    expect(isListable({ author: "현진건", translator: null })).toEqual({ ok: true });
  });

  it("저자가 비어 있어도 목록에 보인다 — 가져올 때 입력받는다", () => {
    expect(isListable({ author: null, translator: null })).toEqual({ ok: true });
  });

  it("금지 저작자는 이유와 함께 가린다", () => {
    const r = isListable({ author: "박경리", translator: null });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/2008년/);
  });

  /** PRD §5.11: 원작이 만료여도 번역본은 별개다. */
  it("번역물은 이유와 함께 가린다", () => {
    const r = isListable({ author: "윌리엄 데이비스", translator: "pk0001" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/번역/);
  });

  it("금지 저작자이면서 번역물이면 저작자 사유를 먼저 보고한다", () => {
    const r = isListable({ author: "백석", translator: "누군가" });
    expect(r.ok === false && r.reason).toMatch(/1996년/);
  });
});
