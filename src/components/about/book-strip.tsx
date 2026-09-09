import Link from "next/link";
import { BookCover } from "@/components/feed/book-cover";
import type { DiscoverBook } from "@/lib/discover";

/**
 * 색이 들어오는 자리다 (설계 결정 3) — 면은 무채색이고 실제 도서 커버가
 * 유일한 색이다.
 *
 * 가로 스크롤은 이 컨테이너 안에만 있다. 페이지 레벨 가로 스크롤은 0이어야
 * 한다.
 *
 * 빈 배열이면 `null` — "추천 도서가 없습니다"는 소개 페이지에서 정보가
 * 아니라 흠이다 (FRONTEND.md §5).
 *
 * 제목·저자에 `truncate`를 두는 이유: 여기 오는 값은 DB의 실제 도서명이고,
 * 띄어쓰기가 없는 긴 제목은 `break-keep`만으로는 끊을 자리가 없어 칸을
 * 넘친다. 한 줄로 자르면 폭이 어떻든 칸 안에 있다.
 */
export function BookStrip({ books }: { books: DiscoverBook[] }) {
  if (books.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
      <h2 className="text-2xl font-bold tracking-tight text-balance break-keep md:text-3xl">
        지금 읽을 수 있는 책
      </h2>

      <ul className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {books.map((book) => (
          <li key={book.id} className="w-28 shrink-0 snap-start sm:w-32 md:w-40">
            <BookCover book={book} />
            <p className="mt-2 truncate text-sm font-medium break-keep">
              {book.title}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {book.author}
            </p>
          </li>
        ))}
      </ul>

      <Link
        href="/discover"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-8 inline-flex min-h-11 items-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        도서 목록 보기
      </Link>
    </section>
  );
}
