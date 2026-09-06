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
    //
    // card 변형에는 피할 크롬이 없어 CHROME_SAFE_AREA 대신 평범한 카드
    // 패딩을 쓴다. gap-4 → gap-3: 상자가 낮아지므로 영역 사이 간격을
    // 줄여 본문이 들어갈 여지를 만든다. cn이 뒤 값을 이기므로 순서가
    // 중요하다.
    //
    // 실측(375px 폭, 4:5 상자=469px, 훅·부연설명을 registry.ts의
    // maxLength까지 꽉 채운 합성 데이터, 실제 어절 간격 포함): 템플릿 a
    // (커버+텍스트4) 본문 469px, 템플릿 b(텍스트4) 본문 469px — 둘 다
    // 오버플로 0으로 정확히 들어찬다. 다만 여유가 전혀 없다 — 도서 제목이
    // 두 줄로 넘어가는 등 biblio/genre 쪽 실제 데이터가 이 프로브보다
    // 조금이라도 길면 넘칠 수 있다(도서 필드는 이 태스크의 글자 수 상한
    // 대상이 아니라 DB에 길이 제약이 없다). Task 2/3에서 실제 데이터로
    // 재확인 필요.
    <div
      className={cn(
        "flex h-full min-h-0 flex-col justify-center gap-4",
        variant === "card" ? "gap-3 p-4" : CHROME_SAFE_AREA,
      )}
    >
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
