import {
  POST_TEMPLATES,
  REGION_REGISTRY,
  missingRequiredInputs,
} from "@/components/cards/registry";
import { CardPlaceholder } from "@/components/cards/card-placeholder";
import { CHROME_SAFE_AREA } from "@/components/feed/chrome";
import { cn } from "@/lib/utils";
import type { FeedBook, FeedCardLayout } from "@/lib/feed";

/**
 * 게시물 본문 한 장 (PRD §5.2).
 *
 * 템플릿이 정한 순서대로 영역을 세로로 쌓는다. 캐러셀·인디케이터 없음 —
 * 게시물 본문은 페이지 하나다.
 *
 * 규약(FRONTEND.md §3): 알 수 없는 템플릿이나 필수 입력이 빈 카드는
 * 조용히 스킵한다 — 피드 전체를 죽이지 않는다. 알 수 없는 variant는
 * 스킵하지 않고 defaultVariant로 폴백한다: 유형이 코드에서 사라졌다고
 * 게시물이 통째로 사라지는 것보다 기본 모양이 낫다.
 *
 * preview는 어드민 미리보기 전용 (PRD §5.10). 편집 중에는 훅이 비어 있는
 * 게 정상이라 스킵 대신 자리표시를 그리고, console.error도 남기지 않는다
 * — 타건마다 실패하므로 진짜 오류가 그 안에 묻힌다.
 */
export function TemplateCard({
  layout,
  book,
  preview = false,
}: {
  layout: FeedCardLayout | null;
  book: FeedBook;
  preview?: boolean;
}) {
  const template = layout ? POST_TEMPLATES[layout.template] : undefined;

  if (!layout || !template) {
    return preview ? <CardPlaceholder layout={layout} /> : null;
  }

  if (missingRequiredInputs(layout).length > 0) {
    if (preview) return <CardPlaceholder layout={layout} />;
    console.error(
      `필수 입력이 빈 카드 (template=${layout.template}) — 렌더하지 않습니다.`,
    );
    return null;
  }

  return (
    // 세이프존: 분할이 만들던 여백을 이제 패딩이 만든다. 값의 근거는
    // CHROME_SAFE_AREA(chrome.ts) 주석 참고 — card-placeholder.tsx와
    // post-item.tsx의 영상 폴백 분기도 같은 상수를 쓴다.
    <div className={cn("flex h-full min-h-0 flex-col justify-center gap-4", CHROME_SAFE_AREA)}>
      {template.regions.map((key) => {
        const entry = REGION_REGISTRY[key];
        if (!entry) return null;

        const value = layout.regions?.[key] ?? {};
        const variant =
          entry.variants[value.variant ?? ""] ??
          entry.variants[entry.defaultVariant];
        const Region = variant.component;

        return <Region key={key} book={book} text={value.text ?? undefined} />;
      })}
    </div>
  );
}
