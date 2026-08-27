import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import type { DiscoverBook } from "@/lib/discover";

/**
 * 도서 그리드. 항목을 누르면 도서 상세 시트가 열린다 —
 * 탐색의 검색 결과·장르 결과가 모두 같은 시트로 모인다 (PRD §5.12).
 */
export function BookGrid({ books }: { books: DiscoverBook[] }) {
  return (
    <ul className="grid grid-cols-3 gap-3">
      {books.map((book) => (
        <li key={book.id}>
          <BookSheet book={book}>
            <button
              type="button"
              className="focus-visible:ring-ring flex w-full flex-col gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
            >
              <BookCover book={book} className="w-full" />
              <span className="line-clamp-2 text-xs leading-snug break-keep">
                {book.title}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {book.author}
              </span>
            </button>
          </BookSheet>
        </li>
      ))}
    </ul>
  );
}
