"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { cn } from "@ttokttok/ui/utils";

/**
 * 참고 사이트의 두 칸 토글(Launching / Scaling). 고른 값이 어디로도 가지
 * 않는다 — 두 선택지가 모두 같은 피드로 이어지기 때문에, 이 토글은 방문자가
 * 자기 상황을 고르며 읽게 하는 장치다.
 */
export function ToggleChips({
  label,
  options,
  className,
}: {
  label: string;
  options: readonly [string, string];
  className?: string;
}) {
  const [selected, setSelected] = useState(0);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "border-border/85 bg-card inline-flex rounded-full border p-1",
        className,
      )}
    >
      {options.map((option, i) => {
        const active = i === selected;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSelected(i)}
            className={cn(
              "focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? <CircleCheck className="size-4" aria-hidden /> : null}
            {option}
          </button>
        );
      })}
    </div>
  );
}
