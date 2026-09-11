import { describe, expect, it } from "vitest";
import { resolvePostThumbnail, type ThumbnailSource } from "./post-thumbnail";

const book = { title: "테스트 산책", cover_url: null };
const HOOK = "한 문장이 하루를 바꿀 때";

function card(background: unknown, hook: string | null = HOOK): ThumbnailSource {
  return {
    type: "cards",
    books: book,
    post_videos: null,
    post_cards: {
      template: "a",
      regions: { hook: { variant: "a", text: hook } },
      background: background as never,
    },
  };
}

function video(
  v: Partial<NonNullable<ThumbnailSource["post_videos"]>>,
  cover: string | null = null,
): ThumbnailSource {
  return {
    type: "video",
    books: { ...book, cover_url: cover },
    post_cards: null,
    post_videos: {
      source_type: "upload",
      video_path: "https://cdn.test/v/fallback.mp4",
      youtube_id: null,
      duration_sec: 3,
      hls_path: null,
      poster_path: null,
      ...v,
    },
  };
}

describe("resolvePostThumbnail — 카드", () => {
  it("단색 배경은 그 색과 잉크, 훅 문구를 낸다", () => {
    expect(
      resolvePostThumbnail(
        card({ type: "solid", color: "#f2d6c4", imageUrl: null, text: "dark", dim: 40, x: 50, y: 50 }),
      ),
    ).toEqual({ kind: "solid", color: "#f2d6c4", ink: "dark", text: HOOK, video: false });
  });

  it("이미지 배경은 주소·위치·어둡기·잉크를 그대로 넘긴다", () => {
    expect(
      resolvePostThumbnail(
        card({ type: "image", color: null, imageUrl: "https://cdn.test/bg.webp", text: "light", dim: 55, x: 30, y: 70 }),
      ),
    ).toEqual({
      kind: "image",
      src: "https://cdn.test/bg.webp",
      x: 30,
      y: 70,
      dim: 55,
      ink: "light",
      text: HOOK,
      video: false,
    });
  });

  it("배경이 NULL인 옛 게시물은 기본 종이색·어두운 잉크다", () => {
    expect(resolvePostThumbnail(card(null))).toEqual({
      kind: "solid",
      color: null,
      ink: "dark",
      text: HOOK,
      video: false,
    });
  });

  it("이미지형인데 주소가 없으면 CardBackgroundSurface와 같은 단색으로 떨어진다", () => {
    expect(
      resolvePostThumbnail(
        card({ type: "image", color: null, imageUrl: null, text: "light", dim: 40, x: 50, y: 50 }),
      ),
    ).toEqual({ kind: "solid", color: "var(--post-navy)", ink: "light", text: HOOK, video: false });
    expect(
      resolvePostThumbnail(
        card({ type: "image", color: null, imageUrl: null, text: "dark", dim: 40, x: 50, y: 50 }),
      ),
    ).toEqual({ kind: "solid", color: null, ink: "dark", text: HOOK, video: false });
  });

  it("훅이 비어 있으면 text는 null이다", () => {
    expect(resolvePostThumbnail(card(null, "   ")).text).toBeNull();
    expect(resolvePostThumbnail(card(null, null)).text).toBeNull();
  });
});

describe("resolvePostThumbnail — 영상", () => {
  it("유튜브는 i.ytimg.com 썸네일이다", () => {
    expect(
      resolvePostThumbnail(video({ source_type: "youtube", youtube_id: "abcdefghijk", video_path: null })),
    ).toEqual({
      kind: "image",
      src: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
      x: 50,
      y: 50,
      dim: 0,
      ink: "light",
      text: null,
      video: true,
    });
  });

  it("업로드는 poster_path를 그대로 쓴다", () => {
    expect(resolvePostThumbnail(video({ poster_path: "https://cdn.test/v/poster.jpg" }))).toMatchObject({
      kind: "image",
      src: "https://cdn.test/v/poster.jpg",
      dim: 0,
      video: true,
      text: null,
    });
  });

  it("포스터 없는 옛 업로드는 도서 표지로 떨어진다", () => {
    expect(resolvePostThumbnail(video({}, "https://cdn.test/cover.jpg"))).toMatchObject({
      kind: "image",
      src: "https://cdn.test/cover.jpg",
      video: true,
    });
  });

  it("포스터도 표지도 없으면 종이색 위에 도서 제목을 쓴다", () => {
    expect(resolvePostThumbnail(video({}))).toEqual({
      kind: "solid",
      color: null,
      ink: "dark",
      text: "테스트 산책",
      video: true,
    });
  });
});
