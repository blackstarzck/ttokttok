import { createClient } from "@/lib/supabase/server";
import type { FeedBook } from "@/lib/feed";

const BOOK_FIELDS = `
  id, title, author, translator, publisher, cover_url, category, isbn,
  page_count, pub_date_paper, pub_date_ebook, intro, toc,
  epub_path, purchase_links
`;

export type ReadingItem = {
  book: FeedBook;
  percent: number;
  completedAt: string | null;
};

/**
 * 프로필의 서재 (PRD §5.7).
 *
 * RLS가 본인 행만 주므로 user_id 조건 없이도 내 것만 온다.
 * 학습 중·완독은 전문 도서만 대상이다 — 링크형은 진행률이 없다.
 */
export async function getReadingProgress(): Promise<{
  reading: ReadingItem[];
  finished: ReadingItem[];
}> {
  const db = await createClient();
  const { data, error } = await db
    .from("reading_progress")
    .select(`percent, completed_at, books ( ${BOOK_FIELDS} )`)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("getReadingProgress:", error.message);
    return { reading: [], finished: [] };
  }

  const items = (data ?? [])
    .map((row) => ({
      book: row.books as unknown as FeedBook,
      percent: Number(row.percent ?? 0),
      completedAt: row.completed_at as string | null,
    }))
    .filter((i) => i.book);

  return {
    reading: items.filter((i) => !i.completedAt),
    finished: items.filter((i) => i.completedAt),
  };
}

export async function getBookmarks(): Promise<FeedBook[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("bookmarks")
    .select(`books ( ${BOOK_FIELDS} )`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getBookmarks:", error.message);
    return [];
  }
  return (data ?? [])
    .map((row) => row.books as unknown as FeedBook)
    .filter(Boolean);
}
