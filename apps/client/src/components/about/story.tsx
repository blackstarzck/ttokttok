"use client";

import { useEffect, useState } from "react";
import { AssetSlot } from "@/components/about/asset-slot";
import { cn } from "@ttokttok/ui/utils";

/**
 * 참고 사이트의 스토리형 카드(Swiper autoplay 5s + 진행 막대). 5초마다 다음
 * 슬라이드로 넘어가고, 활성 막대는 그 5초 동안 왼쪽에서 채워진다.
 */
export function useStoryIndex(count: number, intervalMs = 5000) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs]);
  return index;
}

export function StoryBars({
  count,
  index,
  tone = "dark",
  className,
}: {
  count: number;
  index: number;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("grid gap-3", className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1 overflow-hidden rounded-full",
            tone === "dark" ? "bg-background/25" : "bg-foreground/15",
          )}
        >
          {/* 활성 막대는 index마다 key가 바뀌어 다시 마운트되고, 그래서 채움 애니메이션이 처음부터 돈다. */}
          <div
            key={i === index ? `active-${index}` : "idle"}
            className={cn(
              "h-full origin-left rounded-full",
              tone === "dark" ? "bg-background" : "bg-foreground",
              i < index && "scale-x-100",
              i > index && "scale-x-0",
              i === index &&
                "motion-safe:animate-story-fill motion-reduce:scale-x-100",
            )}
          />
        </div>
      ))}
    </div>
  );
}

/** 막대만 도는 스토리 — 슬라이드가 전부 에셋 자리라 넘어가는 것은 막대로만 보인다. */
export function StoryBarsAuto({
  count,
  tone,
  className,
}: {
  count: number;
  tone?: "dark" | "light";
  className?: string;
}) {
  const index = useStoryIndex(count);
  return <StoryBars count={count} index={index} tone={tone} className={className} />;
}

export type ShowcaseSlide = { line1: string; line2: string; caption: string };

/** 대표 작품 큰 카드 — 막대와 함께 문장이 5초마다 바뀐다(참고 사이트의 케이스 스와이퍼). */
export function ShowcaseStory({ slides }: { slides: readonly ShowcaseSlide[] }) {
  const index = useStoryIndex(slides.length);
  const slide = slides[index];
  return (
    <>
      <StoryBars count={slides.length} index={index} />
      <AssetSlot tone="dark" className="mx-auto mt-14 size-14 rounded-2xl" />
      <div
        key={index}
        className="mt-8 text-center duration-500 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
      >
        <p className="text-3xl leading-tight font-medium break-keep md:text-4xl">
          {slide.line1}
          <br />
          {slide.line2}
        </p>
        <p className="text-background/60 mt-3 text-sm">{slide.caption}</p>
      </div>
    </>
  );
}
