import { z } from "zod";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FeedBook } from "@/lib/feed";

/** 템플릿 b — 상세 정보 + 목차. 슬롯은 섹션 제목뿐이고 나머지는 도서에서 온다. */
export const detailCardSchema = z.object({
  "title-01": z.string().min(1),
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="text-muted-foreground w-16 shrink-0">{label}</dt>
      <dd className="break-keep">{value}</dd>
    </div>
  );
}

export function DetailCard({
  body,
  book,
}: {
  body: z.infer<typeof detailCardSchema>;
  book: FeedBook;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "카테고리", value: book.category },
    ...(book.publisher ? [{ label: "출판사", value: book.publisher }] : []),
    ...(book.page_count
      ? [{ label: "페이지", value: `${book.page_count}p` }]
      : []),
    ...(book.pub_date_paper
      ? [{ label: "출간일", value: book.pub_date_paper }]
      : []),
  ];

  return (
    <div className="flex h-full flex-col gap-4 px-6 py-8">
      <h2 className="text-lg font-bold break-keep">{body["title-01"]}</h2>

      <dl className="flex flex-col gap-2">
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
        {book.isbn ? (
          <div className="flex gap-3 text-sm">
            <dt className="text-muted-foreground w-16 shrink-0">ISBN</dt>
            <dd className="font-mono">{book.isbn}</dd>
          </div>
        ) : null}
      </dl>

      {book.toc.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium">목차</h3>
          <ScrollArea className="min-h-0 flex-1">
            <ol className="flex flex-col gap-2 pr-4">
              {book.toc.map((item, i) => (
                <li key={`${i}-${item}`} className="text-sm break-keep">
                  {item}
                </li>
              ))}
            </ol>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
