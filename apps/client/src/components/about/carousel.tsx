"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BLEED, CONTAINER } from "@/components/about/primitives";
import { cn } from "@ttokttok/ui/utils";

/**
 * 제목 + 화살표 한 줄, 그 아래 가로 스크롤러. 카드는 컨테이너 왼쪽 선에서
 * 시작해 오른쪽 화면 끝까지 밀려 나간다 (참고 사이트의 bleed).
 *
 * 스크롤은 브라우저 네이티브(`overflow-x-auto` + snap)이고, 화살표만 한 카드
 * 폭씩 `scrollBy`한다 — 그래서 이 파일만 클라이언트다.
 */
export function Carousel({
  heading,
  children,
  className,
}: {
  heading: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className={className}>
      <div className={cn(CONTAINER, "flex items-center justify-between gap-6")}>
        {heading}
        <div className="flex shrink-0 gap-2">
          <ArrowButton onClick={() => scroll(-1)} label="이전">
            <ChevronLeft className="size-4" />
          </ArrowButton>
          <ArrowButton onClick={() => scroll(1)} label="다음">
            <ChevronRight className="size-4" />
          </ArrowButton>
        </div>
      </div>
      <div
        ref={ref}
        className={cn(
          "mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          BLEED,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ArrowButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-border/85 bg-card hover:bg-muted focus-visible:ring-ring grid size-11 place-items-center rounded-2xl border transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
    >
      {children}
    </button>
  );
}
