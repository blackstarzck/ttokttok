"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { DarkButton } from "@/components/about/primitives";
import { cn } from "@ttokttok/ui/utils";

export type Step = { title: string; body: string; cta: string; href: string };

/**
 * 이용 순서 — 참고 사이트의 Webflow 탭과 같은 규칙이다: 언제나 정확히 하나가
 * 열려 있고, 열린 항목을 눌러도 닫히지 않는다. 그래서 `<details>`가 아니라
 * 탭 버튼 + 패널이다(details는 열린 것을 누르면 닫혀 전부 닫힌 상태가 생긴다).
 *
 * 열린 항목은 회색 테두리 상자 안의 흰 카드로 그려지고, 닫힌 항목은 회색 알약.
 */
export function StepsAccordion({
  steps,
  className,
}: {
  steps: readonly Step[];
  className?: string;
}) {
  const [active, setActive] = useState(0);

  return (
    <div className={cn("grid content-start gap-4", className)}>
      {steps.map((step, i) => {
        const open = i === active;
        return (
          // 열린 카드는 lg에서 높이가 고정(17.5rem)이다 — 그래야 어떤 항목이 열려도
          // 목록 전체 높이가 같고, 오른쪽 이미지 자리가 그 높이에 맞춰 멈춰 있다.
          <div
            key={step.title}
            className={cn(
              "bg-muted rounded-[1.75rem]",
              open && "border-border/60 border p-2 lg:h-[17.5rem]",
            )}
          >
            <h3>
              <button
                type="button"
                id={`step-tab-${i}`}
                aria-expanded={open}
                aria-controls={`step-panel-${i}`}
                onClick={() => setActive(i)}
                className={cn(
                  "focus-visible:ring-ring flex w-full items-center gap-4 rounded-[1.5rem] px-5 py-5 text-left focus-visible:ring-2 focus-visible:outline-none",
                  open ? "bg-card cursor-default" : "hover:bg-accent transition-colors",
                )}
              >
                <span className="border-border/85 bg-card text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full border text-xs">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-xl font-medium break-keep md:text-2xl">
                  {step.title}
                </span>
                <span className="bg-foreground text-background grid size-6 shrink-0 place-items-center rounded-full">
                  {open ? (
                    <ChevronRight className="size-4" aria-hidden />
                  ) : (
                    <ChevronDown className="size-4" aria-hidden />
                  )}
                </span>
              </button>
            </h3>
            <div
              id={`step-panel-${i}`}
              role="region"
              aria-labelledby={`step-tab-${i}`}
              hidden={!open}
              className="bg-card -mt-3 rounded-b-[1.5rem] px-5 pt-8 pb-6 duration-300 motion-safe:animate-in motion-safe:fade-in md:pl-[4.25rem]"
            >
              <p className="text-muted-foreground leading-relaxed break-keep">
                {step.body}
              </p>
              <DarkButton href={step.href} className="mt-6 h-11 text-sm">
                {step.cta} <ArrowUpRight className="size-4" aria-hidden />
              </DarkButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
