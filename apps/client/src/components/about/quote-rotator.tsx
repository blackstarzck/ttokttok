"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AssetSlot } from "@/components/about/asset-slot";
import { ArrowButton } from "@/components/about/carousel";
import type { Quote } from "@/components/about/quotes";
import { cn } from "@ttokttok/ui/utils";

/** 참고 사이트의 고객 후기 카드(화살표로 넘김) 자리에 작품의 문장을 둔다. */
export function QuoteRotator({
  quotes,
  className,
}: {
  quotes: readonly Quote[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const quote = quotes[index];
  const step = (dir: -1 | 1) =>
    setIndex((i) => (i + dir + quotes.length) % quotes.length);

  return (
    <figure
      className={cn(
        "border-border/60 bg-card rounded-[1.75rem] border p-6 md:p-7",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* key가 바뀌면 다시 마운트되어 오른쪽에서 밀려 들어온다 — 참고 사이트 리뷰 스와이퍼의 600ms 슬라이드. */}
        <figcaption
          key={index}
          className="flex items-center gap-4 duration-500 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4"
        >
          <AssetSlot className="size-16 rounded-full" />
          <div>
            <p className="text-xl font-medium">{quote.author}</p>
            <p className="text-muted-foreground text-sm">
              「{quote.work}」 ·{" "}
              <span className="text-foreground">{quote.year}</span>
            </p>
          </div>
        </figcaption>
        <div className="flex shrink-0 gap-2">
          <ArrowButton onClick={() => step(-1)} label="이전 문장">
            <ChevronLeft className="size-4" />
          </ArrowButton>
          <ArrowButton onClick={() => step(1)} label="다음 문장">
            <ChevronRight className="size-4" />
          </ArrowButton>
        </div>
      </div>
      <blockquote
        key={`q-${index}`}
        className="text-muted-foreground mt-6 text-lg leading-relaxed break-keep duration-500 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4"
      >
        {quote.text}
      </blockquote>
    </figure>
  );
}
