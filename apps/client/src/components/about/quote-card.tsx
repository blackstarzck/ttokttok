import { AssetSlot } from "@/components/about/asset-slot";
import type { Quote } from "@/components/about/quotes";
import { cn } from "@ttokttok/ui/utils";

/** 후기 카드 모양의 작품 문장 — 아바타 자리 · 저자 · 작품 · 문장. */
export function QuoteCard({
  quote,
  className,
}: {
  quote: Quote;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "border-border/60 bg-card rounded-[1.75rem] border p-6 md:p-7",
        className,
      )}
    >
      <figcaption className="flex items-center gap-4">
        <AssetSlot className="size-16 rounded-full" />
        <div>
          <p className="text-xl font-medium">{quote.author}</p>
          <p className="text-muted-foreground text-sm">
            「{quote.work}」 ·{" "}
            <span className="text-foreground">{quote.year}</span>
          </p>
        </div>
      </figcaption>
      <blockquote className="text-muted-foreground mt-6 leading-relaxed break-keep">
        {quote.text}
      </blockquote>
    </figure>
  );
}
