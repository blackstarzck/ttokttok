import type { ReactNode } from "react";
import { cn } from "@ttokttok/ui/utils";

/**
 * 끝없이 흐르는 띠 — 참고 사이트의 로고 줄·칩 줄(textloop / reverseloop).
 * 내용을 두 번 그리고 트랙을 절반(-50%)만 밀면 이음새 없이 돈다. 복제본은
 * 낭독기에서 뺀다. 속도는 `[--marquee-duration:20s]`처럼 인스턴스가 정한다
 * (기본 50s). `motion-safe:`라 감속 설정에서는 첫 벌이 멈춰 있다.
 *
 * `itemsClassName`은 두 벌 모두에 붙는다 — 이음새 간격이 항목 간격과 같아야
 * 하므로 `gap-6 pr-6`처럼 gap과 같은 pr을 함께 준다.
 */
export function Marquee({
  children,
  reverse = false,
  fade = false,
  className,
  itemsClassName,
}: {
  children: ReactNode;
  reverse?: boolean;
  fade?: boolean;
  className?: string;
  itemsClassName?: string;
}) {
  return (
    // min-w-0: 그리드 셀 안에 놓이면 min-width:auto가 w-max 트랙 폭(수천 px)을
    // 셀 폭으로 삼아 페이지가 가로로 넘친다(375px 실측 scrollWidth 1228).
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden",
        fade &&
          "[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-max",
          reverse
            ? "motion-safe:animate-marquee-reverse"
            : "motion-safe:animate-marquee",
        )}
      >
        <div className={cn("flex shrink-0 items-center", itemsClassName)}>
          {children}
        </div>
        <div
          aria-hidden
          className={cn("flex shrink-0 items-center", itemsClassName)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
