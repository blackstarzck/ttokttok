import { REGION_REGISTRY } from '@ttokttok/ui/cards/registry';
import { POST_TEMPLATES, missingRequiredInputs } from '@ttokttok/shared/cards';
import { CardBackgroundSurface } from "@ttokttok/ui/cards/card-background";
import { CardPlaceholder } from "@ttokttok/ui/cards/card-placeholder";
import { CHROME_SAFE_AREA } from "@ttokttok/ui/feed/chrome";
import { cn } from "@ttokttok/ui/utils";
import type { FeedBook, FeedCardLayout } from "@ttokttok/shared/feed";

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
export function TemplateCard(props: Parameters<typeof TemplateContent>[0]) {
  if (!props.preview) {
    if (!props.layout || !POST_TEMPLATES[props.layout.template]) return null;
    if (missingRequiredInputs(props.layout).length) {
      console.error(`필수 입력이 빈 카드 (template=${props.layout.template}) — 렌더하지 않습니다.`);
      return null;
    }
  }
  return (
    <CardBackgroundSurface background={props.layout?.background}>
      <TemplateContent {...props} />
    </CardBackgroundSurface>
  );
}

function TemplateContent({
  layout,
  book,
  preview = false,
  variant = "fullscreen",
}: {
  layout: FeedCardLayout | null;
  book: FeedBook;
  preview?: boolean;
  /**
   * 이 본문이 놓이는 상자.
   *
   * fullscreen — 전면 피드(릴스·상세·어드민 미리보기). 크롬이 컨텐츠 위에
   *   얹히므로 본문이 CHROME_SAFE_AREA로 스스로 피한다.
   * card — 홈 카드. 피할 크롬이 없다. 세이프존 대신 평범한 카드 패딩을
   *   쓰고, 상자가 낮아 넘칠 수 있으므로 넘침 처리를 카드 쪽에 맡긴다.
   */
  variant?: "fullscreen" | "card";
}) {
  const template = layout ? POST_TEMPLATES[layout.template] : undefined;

  if (!layout || !template) {
    return preview ? <CardPlaceholder layout={layout} variant={variant} /> : null;
  }

  if (missingRequiredInputs(layout).length > 0) {
    if (preview) return <CardPlaceholder layout={layout} variant={variant} />;
    console.error(
      `필수 입력이 빈 카드 (template=${layout.template}) — 렌더하지 않습니다.`,
    );
    return null;
  }

  return (
    // 높이를 고정하지 않아 긴 문장과 작은 화면에서도 본문이 늘어난다.
    <div
      className={cn(
        "flex grow flex-col justify-center gap-6",
        variant === "card" ? "px-6 py-10" : CHROME_SAFE_AREA,
      )}
    >
      {template.regions.map((key) => {
        const entry = REGION_REGISTRY[key];
        if (!entry) return null;

        const value = layout.regions?.[key] ?? {};
        // regionVariant — 바깥 variant prop(카드/전면)과 이름이 겹치면
        // 루프 안에서 카드 모드를 참조할 수 없다.
        const regionVariant =
          entry.variants[value.variant ?? ""] ??
          entry.variants[entry.defaultVariant];
        const Region = regionVariant.component;

        return (
          <Region
            key={key}
            book={book}
            text={value.text ?? undefined}
            compact={variant === "card"}
          />
        );
      })}
    </div>
  );
}
