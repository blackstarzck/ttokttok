import type { ComponentType } from "react";
import type { FeedBook } from "@ttokttok/shared/feed";
import {
  biblioRegion,
  coverRegion,
  descRegion,
  genreRegion,
  hookRegion,
} from "@ttokttok/ui/cards/regions";

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
  /**
   * compact — 홈 카드 안에 놓였는지(TemplateCard variant="card").
   * 지금은 커버 영역만 쓴다. 카드 본문 상자는 고정 비율이 아니라 내용에
   * 맞춰 늘어나므로(post-card.tsx) 예전처럼 "상자를 넘친다"는 문제는
   * 아니지만, 큰 커버(w-36)를 그대로 두면 카드 하나가 유난히 길어져
   * 스크롤 비용이 커진다 — 그래서 카드 모드에서는 작은 커버(w-24)를
   * 쓴다. (예전에 상자를 4:5로 고정했을 때는 큰 커버가 상자를 넘고,
   * 넘치는 대신 flex가 커버를 눌러 **책 표지가 찌그러졌다** — 216→175px,
   * 2:3 → 0.82:1로 실측. 그 상자를 버린 이유이기도 하다.) 나머지 영역은
   * 이 값을 무시해도 된다.
   */
  component: ComponentType<{
    book: FeedBook;
    text?: string;
    compact?: boolean;
  }>;
};

export type RegionEntry = {
  label: string;
  /** 관리자 텍스트 입력 종류. null이면 도서에서 자동으로 채워진다. */
  input: "text" | "textarea" | null;
  /** input이 있는 영역만 의미가 있다. */
  required: boolean;
  /**
   * 글자 수 상한 (String.length 기준 — 브라우저 maxLength와 같은 단위라
   * 편집기와 서버가 어긋나지 않는다).
   *
   * 오버레이 전환으로 카드 본문 가용 폭이 22% 줄고 overflow-hidden이
   * 붙어서, 넘친 텍스트가 스크롤 없이 잘려 사라진다. 근거와 실측은
   * docs/superpowers/specs/2026-09-01-card-text-length-limits-design.md.
   *
   * input이 있는 영역만 의미가 있다.
   */
  maxLength?: number;
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
