import { describe, expect, it } from "vitest";
import { pathFromPublicUrl } from "@ttokttok/shared/storage-path";

/** 실측한 실제 저장값 모양 (운영 DB에서 확인). */
const COVER_URL =
  "https://jrabwetgciulczhnoxxi.supabase.co/storage/v1/object/public/covers/22222222-2222-4222-8222-000000000002.png";
const VIDEO_URL =
  "https://jrabwetgciulczhnoxxi.supabase.co/storage/v1/object/public/videos/33333333-3333-4333-8333-000000000101.mp4";

describe("pathFromPublicUrl", () => {
  it("covers 공개 URL에서 경로를 뽑는다", () => {
    expect(pathFromPublicUrl(COVER_URL, "covers")).toBe(
      "22222222-2222-4222-8222-000000000002.png",
    );
  });

  it("videos 공개 URL에서 경로를 뽑는다", () => {
    expect(pathFromPublicUrl(VIDEO_URL, "videos")).toBe(
      "33333333-3333-4333-8333-000000000101.mp4",
    );
  });

  /**
   * 삭제에 쓰이는 값이라 조용한 오해가 남의 파일을 지울 수 있다.
   * 버킷이 어긋나면 경로를 만들지 말고 null이어야 한다.
   */
  it("다른 버킷의 URL이면 null", () => {
    expect(pathFromPublicUrl(COVER_URL, "videos")).toBeNull();
    expect(pathFromPublicUrl(VIDEO_URL, "covers")).toBeNull();
  });

  it("공개 URL 형태가 아니면 null", () => {
    expect(pathFromPublicUrl("22222222.png", "covers")).toBeNull();
    expect(pathFromPublicUrl("https://example.com/covers/a.png", "covers")).toBeNull();
  });

  it("null·undefined·빈 문자열을 견딘다", () => {
    expect(pathFromPublicUrl(null, "covers")).toBeNull();
    expect(pathFromPublicUrl(undefined, "covers")).toBeNull();
    expect(pathFromPublicUrl("", "covers")).toBeNull();
  });

  it("버킷 뒤가 비어 있으면 null — 빈 경로로 remove를 부르지 않는다", () => {
    expect(
      pathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/public/covers/",
        "covers",
      ),
    ).toBeNull();
  });

  it("하위 경로가 있어도 그대로 돌려준다", () => {
    expect(
      pathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/public/covers/2026/09/a.png",
        "covers",
      ),
    ).toBe("2026/09/a.png");
  });

  /** 업로드가 넣은 문자열을 그대로 돌려줘야 스토리지가 같은 오브젝트를 찾는다. */
  it("퍼센트 인코딩을 디코드하지 않는다", () => {
    expect(
      pathFromPublicUrl(
        "https://x.supabase.co/storage/v1/object/public/covers/a%20b.png",
        "covers",
      ),
    ).toBe("a%20b.png");
  });
});
