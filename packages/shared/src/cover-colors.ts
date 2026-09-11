/**
 * 이미지 템플릿의 이음새 색.
 *
 * 3D 책 모델은 이미지가 덮지 않는 부위가 있다 — 판 테두리, 둥근 모서리,
 * 책등판, 머리띠, 그리고 이미지를 올리지 않은 면의 바탕. 이 색을
 * 팔레트에서 고르게 하면 이미지와 어긋난다. 대신 **앞표지 이미지의
 * 바깥 테두리** 평균색을 그대로 쓴다 — 그림면과 판이 맞닿는 자리의
 * 색이 같은 값에서 나오므로 이음새가 보이지 않는다.
 *
 * DOM에 의존하지 않는다. 호출자가 `getImageData`로 픽셀을 뽑아 넘긴다.
 */

export type CoverColors = {
  /** 판·책등판·모서리·빈 면 바탕. `#rrggbb`. */
  base: string;
  /** 바탕 위 글자·광택 — 실제 색은 `--book-cover-image-ink-{light,dark}` 토큰. */
  ink: "light" | "dark";
  /** 머리띠·구분선. 바탕을 잉크 쪽으로 35% 섞은 값. `#rrggbb`. */
  accent: string;
};

/** 평균을 낼 테두리 폭 — 짧은 변 기준 비율. */
const RING = 0.08;
/** 이 상대 명도를 넘는 바탕에는 어두운 잉크. */
const LIGHT_BASE = 0.45;
const ACCENT_MIX = 0.35;

function hex(channels: number[]) {
  return `#${channels
    .map((value) =>
      Math.round(Math.max(0, Math.min(255, value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** sRGB 8비트 → 선형. 상대 명도(WCAG) 계산용. */
function linear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function deriveCoverColors(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): CoverColors {
  if (pixels.length !== width * height * 4)
    throw new Error("픽셀 버퍼 크기가 가로·세로와 맞지 않습니다.");
  const ring = Math.max(1, Math.round(Math.min(width, height) * RING));
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = 0; y < height; y++) {
    const edgeRow = y < ring || y >= height - ring;
    for (let x = 0; x < width; x++) {
      if (!edgeRow && x >= ring && x < width - ring) continue;
      const at = (y * width + x) * 4;
      sum[0] += pixels[at];
      sum[1] += pixels[at + 1];
      sum[2] += pixels[at + 2];
      count++;
    }
  }
  const base = sum.map((value) => value / count);
  const luminance =
    0.2126 * linear(base[0]) + 0.7152 * linear(base[1]) + 0.0722 * linear(base[2]);
  const ink = luminance > LIGHT_BASE ? "dark" : "light";
  const target = ink === "dark" ? 0 : 255;
  return {
    base: hex(base),
    ink,
    accent: hex(base.map((value) => value + (target - value) * ACCENT_MIX)),
  };
}
