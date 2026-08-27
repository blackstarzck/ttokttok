import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { FeedBook } from "@/lib/feed";
import {
  HookCard,
  hookCardSchema,
  hookCardSlots,
} from "@/components/cards/hook-card";
import {
  QuoteCard,
  quoteCardSchema,
  quoteCardSlots,
} from "@/components/cards/quote-card";
import {
  DetailCard,
  detailCardSchema,
  detailCardSlots,
} from "@/components/cards/detail-card";

/**
 * 카드 템플릿 레지스트리 (FRONTEND.md §3).
 *
 * template_category(DB) → { 컴포넌트, body 슬롯 스키마, 어드민 폼 정의 }.
 * 템플릿은 프론트에 고정되고, DB에는 카테고리 키와 슬롯 값만 저장된다.
 *
 * 어드민 폼이 쓸 슬롯 정의(slots)도 여기 함께 둔다 — 따로 두면 스키마와
 * 어긋나서 "폼에는 있는데 검증에서 떨어지는" 슬롯이 생긴다.
 *
 * 템플릿 추가: ① 컴포넌트 + 스키마 + 슬롯 정의 작성 → ② 여기 등록 →
 *              ③ PRD §5.2 표 갱신
 */
export type CardSlot = {
  readonly key: string;
  readonly label: string;
  readonly type: "text" | "textarea";
  readonly required: boolean;
};

type CardEntry = {
  /** 어드민에서 고를 때 보이는 이름 */
  label: string;
  // 스키마가 통과시킨 body만 컴포넌트에 들어가므로 여기서는 넓게 받는다.
  // 실제 좁히기는 CardRenderer의 safeParse가 담당한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<{ body: any; book: FeedBook }>;
  schema: ZodType;
  slots: readonly CardSlot[];
};

export const CARD_REGISTRY: Record<string, CardEntry> = {
  a: {
    label: "커버 + 훅",
    component: HookCard,
    schema: hookCardSchema,
    slots: hookCardSlots,
  },
  b: {
    label: "상세정보 · 목차",
    component: DetailCard,
    schema: detailCardSchema,
    slots: detailCardSlots,
  },
  c: {
    label: "인용구",
    component: QuoteCard,
    schema: quoteCardSchema,
    slots: quoteCardSlots,
  },
};
