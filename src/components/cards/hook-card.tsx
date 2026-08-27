import { z } from "zod";
import { BookCover } from "@/components/feed/book-cover";
import type { FeedBook } from "@/lib/feed";

/** 템플릿 a — 커버 + 훅 문구. 카드 게시물의 기본형(항상 첫 장). */
export const hookCardSchema = z.object({
  "title-01": z.string().min(1),
  "description-01": z.string().optional(),
});

export function HookCard({
  body,
  book,
}: {
  body: z.infer<typeof hookCardSchema>;
  book: FeedBook;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-8">
      <BookCover book={book} className="w-36" />

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-muted-foreground text-xs">{book.category}</span>
        <h2 className="text-lg leading-snug font-medium break-keep">
          {book.title}
        </h2>
        <p className="text-muted-foreground text-xs">
          {book.author}
          {book.translator ? ` · ${book.translator} 옮김` : ""}
          {book.publisher ? ` · ${book.publisher}` : ""}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-xl leading-snug font-bold break-keep">
          {body["title-01"]}
        </p>
        {body["description-01"] ? (
          <p className="text-muted-foreground text-sm leading-relaxed break-keep">
            {body["description-01"]}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** 어드민 폼이 그릴 슬롯 정의. 스키마와 같은 파일에 둬 어긋나지 않게 한다. */
export const hookCardSlots = [
  { key: "title-01", label: "훅 헤드라인", type: "text", required: true },
  { key: "description-01", label: "부연 설명", type: "textarea", required: false },
] as const;
