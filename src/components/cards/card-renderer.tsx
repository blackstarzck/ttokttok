import { CARD_REGISTRY } from "@/components/cards/registry";
import type { FeedBook, FeedCard } from "@/lib/feed";

/**
 * 카드 한 장을 렌더한다.
 *
 * 규약(FRONTEND.md §3): 알 수 없는 template_category나 스키마 검증에 실패한
 * 카드는 그 카드만 건너뛴다 — 피드 전체를 죽이지 않는다.
 */
export function CardRenderer({
  card,
  book,
}: {
  card: FeedCard;
  book: FeedBook;
}) {
  const entry = CARD_REGISTRY[card.template_category];

  if (!entry) {
    // 구버전 클라이언트가 신규 템플릿을 만난 경우. 조용히 건너뛴다.
    return null;
  }

  const parsed = entry.schema.safeParse(card.body);

  if (!parsed.success) {
    console.error(
      `카드 스키마 불일치 (template_category=${card.template_category}):`,
      parsed.error.issues,
    );
    return null;
  }

  const Card = entry.component;
  return <Card body={parsed.data} book={book} />;
}
