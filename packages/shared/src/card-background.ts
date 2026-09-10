export type CardBackground = {
  type: "solid" | "image";
  color: string | null;
  imageUrl: string | null;
  text: "light" | "dark";
  dim: number;
  x: number;
  y: number;
};

export const DEFAULT_CARD_BACKGROUND: CardBackground = {
  type: "solid", color: null, imageUrl: null, text: "dark", dim: 40, x: 50, y: 50,
};

export const BACKGROUND_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const BACKGROUND_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** 서버 입력 검증. 이미지 주소는 폼 값을 사용하지 않고 업로드 결과/기존 행에서 정한다. */
export function parseCardBackground(value: unknown): CardBackground {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("배경 설정을 확인해 주세요.");
  const v = value as Record<string, unknown>;
  if (v.type !== "solid" && v.type !== "image") throw new Error("배경 종류를 선택해 주세요.");
  if (v.color !== null && (typeof v.color !== "string" || !/^#[0-9a-f]{6}$/i.test(v.color)))
    throw new Error("배경색을 확인해 주세요.");
  if (v.text !== "light" && v.text !== "dark") throw new Error("글자색을 선택해 주세요.");
  for (const key of ["dim", "x", "y"] as const) {
    if (typeof v[key] !== "number" || !Number.isFinite(v[key]) || v[key] < 0 || v[key] > 100)
      throw new Error("이미지 위치와 어둡기는 0~100 사이여야 합니다.");
  }
  return { type: v.type, color: v.color, text: v.text, dim: v.dim as number,
    x: v.x as number, y: v.y as number, imageUrl: null };
}

/** 배경이 없는 기존 게시물도 같은 기본 디자인을 사용한다. */
export function resolveCardBackground(value: unknown): CardBackground {
  if (value == null) return { ...DEFAULT_CARD_BACKGROUND };
  try {
    const background = parseCardBackground(value);
    const url = (value as Record<string, unknown>).imageUrl;
    if (typeof url === "string" && /^(https?:\/\/|blob:)/.test(url)) background.imageUrl = url;
    return background;
  } catch {
    return { ...DEFAULT_CARD_BACKGROUND };
  }
}
