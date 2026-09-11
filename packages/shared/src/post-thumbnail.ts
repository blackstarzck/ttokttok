import { resolveCardBackground } from "./card-background";
import type { FeedBook, FeedCardLayout, FeedPost } from "./feed";

/**
 * 채널 그리드 타일이 그릴 것 (설계: 2026-09-11-channel-home-redesign §1.3).
 *
 * 화면(`PostTile`)은 이 결과만 보고 그린다 — 어디서 이미지가 오는지
 * (카드 배경·영상 포스터·유튜브·도서 표지)는 여기서 끝난다. 순수 함수라
 * vitest로 여섯 갈래를 고정한다.
 *
 * `video`는 재생 글리프를 그릴지다. 포스터 없는 옛 업로드가 `solid`로
 * 떨어져도 글리프는 남아야 하므로 두 변형이 모두 갖는다.
 */
export type PostThumbnail =
  | {
      kind: "image";
      src: string;
      /** object-position 퍼센트. 카드 배경은 저장값, 그 외는 50/50. */
      x: number;
      y: number;
      /** 어둡기 0~100. 영상·표지는 0 — 위에 글자를 얹지 않는다. */
      dim: number;
      ink: "light" | "dark";
      text: string | null;
      video: boolean;
    }
  | {
      kind: "solid";
      /** CSS 색. null이면 화면이 `var(--post-paper)`를 쓴다. */
      color: string | null;
      ink: "light" | "dark";
      text: string | null;
      video: boolean;
    };

export type ThumbnailSource = Pick<FeedPost, "type" | "post_cards" | "post_videos"> & {
  books: Pick<FeedBook, "title" | "cover_url">;
};

/** 유튜브 기본 썸네일. `next.config.ts` remotePatterns가 `i.ytimg.com/vi/**`를 허용한다. */
export function youtubeThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

function hookText(layout: FeedCardLayout | null): string | null {
  const text = layout?.regions?.hook?.text;
  return typeof text === "string" && text.trim().length > 0 ? text : null;
}

function image(src: string, video: boolean): PostThumbnail {
  return { kind: "image", src, x: 50, y: 50, dim: 0, ink: "light", text: null, video };
}

export function resolvePostThumbnail(post: ThumbnailSource): PostThumbnail {
  if (post.type === "video") {
    const v = post.post_videos;
    if (v?.source_type === "youtube" && v.youtube_id) return image(youtubeThumbnailUrl(v.youtube_id), true);
    if (v?.poster_path) return image(v.poster_path, true);
    if (post.books.cover_url) return image(post.books.cover_url, true);
    return { kind: "solid", color: null, ink: "dark", text: post.books.title, video: true };
  }

  const bg = resolveCardBackground(post.post_cards?.background);
  const text = hookText(post.post_cards);
  if (bg.type === "image" && bg.imageUrl) {
    return { kind: "image", src: bg.imageUrl, x: bg.x, y: bg.y, dim: bg.dim, ink: bg.text, text, video: false };
  }
  // 이미지형인데 주소가 없으면 CardBackgroundSurface와 같은 규칙으로 단색을 고른다
  // — 밝은 잉크는 navy 위에, 어두운 잉크는 종이색 위에.
  const color = bg.type === "image" ? (bg.text === "light" ? "var(--post-navy)" : null) : bg.color;
  return { kind: "solid", color, ink: bg.text, text, video: false };
}
