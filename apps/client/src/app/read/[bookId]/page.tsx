import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderLoader } from "@/components/reader/reader-loader";
import { getReaderBook } from "@/lib/book";
import { getCurrentUser } from "@/lib/auth";

/**
 * EPUB 뷰어 (PRD §5.4). (main) 그룹 밖이라 GNB가 없는 풀스크린이다.
 *
 * 전문 도서만 열린다 — 링크형 도서로 들어오면 404다. 구매 안내는
 * 뷰어가 아니라 도서 상세 시트(§5.12)가 담당한다.
 */
export async function generateMetadata({
  params,
}: PageProps<"/read/[bookId]">): Promise<Metadata> {
  const { bookId } = await params;
  const book = await getReaderBook(bookId);
  return { title: book?.title ?? "읽기" };
}

export default async function ReadPage({ params }: PageProps<"/read/[bookId]">) {
  const { bookId } = await params;
  const book = await getReaderBook(bookId);

  if (!book) notFound();

  const user = await getCurrentUser();
  return <ReaderLoader book={book} isLoggedIn={user !== null} />;
}
