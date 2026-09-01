import {
  POST_TEMPLATES,
  REGION_REGISTRY,
  missingRequiredInputs,
} from "@/components/cards/registry";
import { CHROME_SAFE_AREA } from "@/components/feed/chrome";
import { cn } from "@/lib/utils";
import type { FeedCardLayout } from "@/lib/feed";

/**
 * 미리보기 전용 자리표시 카드 (PRD §5.10).
 *
 * 실제 피드에서는 필수 입력이 빈 카드를 조용히 스킵한다 (FRONTEND.md §3).
 * 그런데 관리자가 편집하는 동안에는 훅이 비어 있는 게 정상이라, 같은
 * 규칙을 그대로 적용하면 미리보기가 텅 비어 고장처럼 보인다.
 *
 * 그래서 미리보기에서만 이 자리표시를 대신 그린다. 점선으로 두는 이유는
 * 실제 출력물과 헷갈리지 않게 하기 위해서다 — 이건 결과가 아니라 안내고,
 * 동시에 "지금 발행하면 이 게시물은 피드에 안 나간다"는 경고다.
 */
export function CardPlaceholder({ layout }: { layout: FeedCardLayout | null }) {
  const template = layout ? POST_TEMPLATES[layout.template] : undefined;
  const missing = layout
    ? missingRequiredInputs(layout).map(
        (key) => REGION_REGISTRY[key]?.label ?? key,
      )
    : [];

  return (
    // 세이프존: 어드민 미리보기도 실제 피드와 같은 크롬 위에 얹히므로
    // TemplateCard와 동일한 CHROME_SAFE_AREA를 쓴다 (chrome.ts).
    <div className={cn("flex h-full flex-col items-center justify-center", CHROME_SAFE_AREA)}>
      <div className="border-border flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-5 py-8 text-center">
        <span className="text-muted-foreground text-xs">
          {template?.label ?? "알 수 없는 템플릿"}
        </span>

        {template ? (
          <>
            <p className="text-sm font-medium break-keep">
              {missing.join(" · ")} 입력이 필요합니다
            </p>
            <p className="text-muted-foreground text-xs break-keep">
              채워지면 여기에 실제 화면이 그려집니다.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm break-keep">
            등록되지 않은 템플릿이라 사용자 화면에 나오지 않습니다.
          </p>
        )}
      </div>
    </div>
  );
}
