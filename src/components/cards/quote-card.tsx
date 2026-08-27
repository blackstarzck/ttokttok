import { z } from "zod";
import { Quote } from "lucide-react";
import type { FeedBook } from "@/lib/feed";

/** 템플릿 c — 인용구. 이 서비스의 공유 단위이므로 가장 크게 읽힌다. */
export const quoteCardSchema = z.object({
  "description-01": z.string().min(1),
  "caption-01": z.string().optional(),
});

export function QuoteCard({
  body,
  book,
}: {
  body: z.infer<typeof quoteCardSchema>;
  book: FeedBook;
}) {
  return (
    // figure/figcaption을 쓴다 — <footer>는 게시물 푸터의 자리이고,
    // article 안에 두 개가 생기면 의미가 겹친다.
    <figure className="flex h-full flex-col items-center justify-center gap-6 px-8 py-8">
      <Quote className="text-muted-foreground size-6 shrink-0" aria-hidden />

      <blockquote className="text-xl leading-loose font-medium break-keep text-balance">
        {body["description-01"]}
      </blockquote>

      <figcaption className="text-muted-foreground flex flex-col items-center gap-1 text-xs">
        {body["caption-01"] ? <span>{body["caption-01"]}</span> : null}
        <cite className="not-italic">
          {book.title} · {book.author}
        </cite>
      </figcaption>
    </figure>
  );
}
