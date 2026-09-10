import { describe, expect, it } from "vitest";
import { DEFAULT_CARD_BACKGROUND, parseCardBackground, resolveCardBackground } from "./card-background";
import { POST_TEMPLATES, isRenderableCard } from "./cards";

describe("게시글 배경 입력", () => {
  it("배경이 없는 기존 게시물은 기본 단색이며 기존 문구는 계속 렌더한다", () => {
    expect(resolveCardBackground(null)).toEqual(DEFAULT_CARD_BACKGROUND);
    expect(isRenderableCard({ template: "a", regions: { hook: { text: "기존 문장" } } })).toBe(true);
    for (const template of Object.values(POST_TEMPLATES)) {
      expect(template.regions).not.toContain("cover");
      expect(template.regions).not.toContain("biblio");
    }
  });
  it.each(["url(https://example.com)", "red", "#fff", "#000000; color:red"])("임의 CSS %s를 거부한다", color => {
    expect(() => parseCardBackground({ ...DEFAULT_CARD_BACKGROUND, color })).toThrow();
  });
  it.each([-1, 101, NaN, Infinity, "50", null])("위치/어둡기의 잘못된 값 %s를 거부한다", value => {
    for (const key of ["dim", "x", "y"])
      expect(() => parseCardBackground({ ...DEFAULT_CARD_BACKGROUND, [key]: value })).toThrow();
  });
  it("폼의 이미지 주소는 무시하고 서버가 확정하게 한다", () => {
    expect(parseCardBackground({ ...DEFAULT_CARD_BACKGROUND, type: "image", imageUrl: "https://attacker.example/a.png" }).imageUrl).toBeNull();
  });
  it("저장된 이미지 위치·글자색은 유지한다", () => {
    const value = { ...DEFAULT_CARD_BACKGROUND, type: "image", imageUrl: "https://example.com/a.webp", text: "light", x: 0, y: 100, dim: 65 };
    expect(resolveCardBackground(value)).toEqual(value);
  });
});
