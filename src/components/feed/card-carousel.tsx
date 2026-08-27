"use client";

import { useRef, useState } from "react";
import { CardRenderer } from "@/components/cards/card-renderer";
import { CARD_REGISTRY } from "@/components/cards/registry";
import { cn } from "@/lib/utils";
import type { FeedBook, FeedCard } from "@/lib/feed";

/** 게시물 안에서 카드를 좌우로 넘기는 캐러셀. CSS 스크롤 스냅 기반. */
export function CardCarousel({
  cards,
  book,
}: {
  cards: FeedCard[];
  book: FeedBook;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // 렌더 못 하는 카드(미등록 템플릿)는 인디케이터에서도 빠져야 한다.
  const renderable = cards.filter((c) => CARD_REGISTRY[c.template_category]);

  if (renderable.length === 0) return null;

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    setIndex((prev) => (prev === next ? prev : next));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {renderable.map((card) => (
          <div
            key={`${card.sort_order}-${card.template_category}`}
            className="h-full w-full shrink-0 snap-center snap-always"
          >
            <CardRenderer card={card} book={book} />
          </div>
        ))}
      </div>

      {renderable.length > 1 ? (
        <div
          className="flex shrink-0 justify-center gap-1.5 py-3"
          role="tablist"
          aria-label="카드 넘기기"
        >
          {renderable.map((card, i) => (
            <span
              key={`dot-${card.sort_order}`}
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1}번째 카드`}
              className={cn(
                "size-1.5 rounded-full transition-opacity duration-200",
                i === index ? "bg-foreground" : "bg-muted-foreground/40",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
