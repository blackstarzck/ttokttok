import type { ComponentType } from "react";
import type { FeedBook, FeedCardLayout } from "@/lib/feed";
import {
  biblioRegion,
  coverRegion,
  descRegion,
  genreRegion,
  hookRegion,
} from "@/components/cards/regions";

/**
 * 게시물 템플릿 · 영역 레지스트리 (FRONTEND.md §3).
 *
 * 게시물 본문은 페이지네이션 없는 한 장이고, 그 한 장은 영역(region)의
 * 세로 조합이다. 2단계 구조:
 *
 *   POST_TEMPLATES  — 게시물 템플릿: 어떤 영역이 어떤 순서로 들어가는지
 *                     **고정**한다. 관리자는 순서를 못 바꾼다.
 *   REGION_REGISTRY — 영역: UI 유형(variant)들을 가진다. 관리자가
 *                     게시물마다 영역별 유형을 고른다.
 *
 * DB(post_cards)에는 템플릿 키와 { 영역키: { variant, text } }만 저장된다.
 * 도서에서 오는 값(커버·장르·서지)은 렌더 시점에 book에서 읽는다.
 *
 * 인용구·상세정보는 여기 없다 — 게시물이 아니라 도서의 메타정보라서
 * 도서 상세 시트(BookSheet)가 보여준다 (PRD §5.12).
 *
 * 유형 추가: ① regions.tsx의 해당 영역에 variant 추가 → ② PRD §5.2 표 갱신
 * 템플릿 추가: ① POST_TEMPLATES에 영역 순서 정의 → ② PRD §5.2 표 갱신
 */

export type RegionVariant = {
  /** 어드민에서 고를 때 보이는 이름 */
  label: string;
  component: ComponentType<{ book: FeedBook; text?: string }>;
};

export type RegionEntry = {
  label: string;
  /** 관리자 텍스트 입력 종류. null이면 도서에서 자동으로 채워진다. */
  input: "text" | "textarea" | null;
  /** input이 있는 영역만 의미가 있다. */
  required: boolean;
  /** 저장된 variant가 사라졌을 때 여기로 폴백한다. */
  defaultVariant: string;
  variants: Record<string, RegionVariant>;
};

export const REGION_REGISTRY: Record<string, RegionEntry> = {
  cover: coverRegion,
  genre: genreRegion,
  biblio: biblioRegion,
  hook: hookRegion,
  desc: descRegion,
};

export type PostTemplate = {
  label: string;
  /** 영역 구성과 순서. 템플릿이 고정하며 관리자는 못 바꾼다. */
  regions: readonly string[];
};

export const POST_TEMPLATES: Record<string, PostTemplate> = {
  // 기존 훅 카드의 분해 — 전 영역 variant a면 이전 화면과 같다.
  a: {
    label: "커버 중심",
    regions: ["cover", "genre", "biblio", "hook", "desc"],
  },
  // 커버 없는 텍스트 중심 — 하단 도서 바가 커버를 이미 보여준다.
  b: {
    label: "텍스트 중심",
    regions: ["genre", "hook", "desc", "biblio"],
  },
};

/** 필수 텍스트가 아직 빈 영역들. 미리보기 자리표시와 발행 검증이 같이 쓴다. */
export function missingRequiredInputs(layout: FeedCardLayout): string[] {
  const template = POST_TEMPLATES[layout.template];
  if (!template) return [];

  return template.regions.filter((key) => {
    const entry = REGION_REGISTRY[key];
    if (!entry?.input || !entry.required) return false;
    const text = layout.regions?.[key]?.text;
    return typeof text !== "string" || text.trim() === "";
  });
}

/**
 * 이 카드가 사용자 화면에 나갈 수 있는가.
 *
 * 알 수 없는 템플릿이거나 필수 입력이 비면 피드에서 스킵된다 — 카드
 * 하나 때문에 피드 전체를 죽이지 않는다는 규약(FRONTEND.md §3)의 새 형태.
 */
export function isRenderableCard(layout: FeedCardLayout | null): boolean {
  if (!layout || !(layout.template in POST_TEMPLATES)) return false;
  return missingRequiredInputs(layout).length === 0;
}
