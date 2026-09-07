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
    // 카드 모드에서는 커버가 작다(registry.ts의 compact, w-24) — 이유는
    // 상자 자체가 아니라 폭·글자 수 조합에 있다. 375px·훅 60자·부연설명
    // 90자(registry.ts maxLength 꽉 채움)를 (예전) 4:5 상자(468.75px)
    // 기준으로 재면 큰 커버(w-36)는 509.5px로 넘치고 작은 커버(w-24)는
    // 437.5px로 들어갔었는데, 폭을 320~480px 전 구간으로 쓸어 보니
    // **4:5를 어떤 값으로 고정해도 전 구간을 만족시키지 못했다**
    // (post-card.tsx 참고 — 344px는 −55.8, 480px는 +164.5). 그래서 상자를
    // 고정 비율 대신 내용에 맞춰 늘어나게 했다(post-card.tsx의
    // data-card-body). compact 커버는 그와 별개로 유지한다 — 큰 커버는
    // 상자가 짧을 때 차지하는 비중이 커서 카드가 유난히 길어지기 때문이다.
    //
    // **넘침이 눈에 안 보인다는 점이 상자를 고정 비율로 두면 안 되는 진짜
    // 이유다.** (예전) 4:5에 큰 커버를 넣으면 글자가 잘리는 대신 flex가
    // 커버를 눌러 흡수했다 — 216→175px, 2:3이 0.82:1로 찌그러진다. 오버플로
    // 수치는 0으로 나오는데 표지가 망가진다. `BookCover`에 준 `shrink-0`
    // (regions.tsx)은 이 압축 자체를 막는 두 번째 방어선이다 — 상자가
    // auto라 정상적으로는 압축될 이유가 없지만, 무언가가 다시 높이 제약을
    // 붙이더라도 커버만은 비율을 지킨 채 형제 영역이 밀려나는 쪽을 택한다.
    //
    // **측정 방법에 두 번 걸렸다.** ① 이 루트는 h-full이라 높이를 고정한
    // 상자 안에서 scrollHeight를 재면 내용이 짧든 길든 상자 높이가 나온다
    // — "정확히 꽉 찼다"로 오독된다. 높이를 제약하지 않은 부모에 넣어야
    // (h-full이 auto로 풀린다) 진짜 내용 높이가 나온다. ② 영역들이 전부
    // break-keep이라 **띄어쓰기 없는 더미 텍스트는 줄바꿈이 안 되고 가로로
    // 넘쳐** 높이가 실제보다 짧게 나온다. 어절이 있는 문장으로 재야 한다.
    //
    // 카드가 전면보다 넓다는 점이 그나마 여유를 만든다: 전면은 px-15라 본문
    // 폭이 255px인데 카드는 p-4라 343px다. 글자 수 상한의 "375px에서 5줄"
    // 실측은 255px 기준이므로, 카드에서는 같은 글자가 더 적은 줄을 쓴다.
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
