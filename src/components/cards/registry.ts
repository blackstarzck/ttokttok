import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { FeedBook } from "@/lib/feed";
import { HookCard, hookCardSchema } from "@/components/cards/hook-card";
import { QuoteCard, quoteCardSchema } from "@/components/cards/quote-card";
import { DetailCard, detailCardSchema } from "@/components/cards/detail-card";

/**
 * 카드 템플릿 레지스트리 (FRONTEND.md §3).
 *
 * template_category(DB) → { 컴포넌트, body 슬롯 스키마 }.
 * 템플릿은 프론트에 고정되고, DB에는 카테고리 키와 슬롯 값만 저장된다.
 *
 * 템플릿 추가: ① 컴포넌트+스키마 작성 → ② 여기 등록 →
 *              ③ 어드민 폼에 슬롯 입력 UI → ④ PRD §5.2 표 갱신
 */
type CardEntry = {
  // 스키마가 통과시킨 body만 컴포넌트에 들어가므로 여기서는 넓게 받는다.
  // 실제 좁히기는 renderCard의 safeParse가 담당한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<{ body: any; book: FeedBook }>;
  schema: ZodType;
};

export const CARD_REGISTRY: Record<string, CardEntry> = {
  a: { component: HookCard, schema: hookCardSchema },
  b: { component: DetailCard, schema: detailCardSchema },
  c: { component: QuoteCard, schema: quoteCardSchema },
};
