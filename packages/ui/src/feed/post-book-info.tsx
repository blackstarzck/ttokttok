import type { ComponentProps } from "react";
import { BookCover } from "./book-cover";
import { formatByline } from "@ttokttok/shared/format";
import type { FeedBook } from "@ttokttok/shared/feed";

export function PostBookInfo({
  book,
  ...props
}: { book: FeedBook } & ComponentProps<"button">) {
  const byline = formatByline(book);
  return (
    <button
      {...props}
      type="button"
      aria-label={`${book.title} 도서 정보`}
      className="focus-visible:ring-ring flex w-full items-center gap-3 px-3 pb-3 text-left focus-visible:ring-2 focus-visible:outline-none"
    >
      <BookCover book={book} className="w-9 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium break-keep">
          {book.title}
        </span>
        <span className="text-muted-foreground truncate text-xs">{byline}</span>
      </span>
    </button>
  );
}
