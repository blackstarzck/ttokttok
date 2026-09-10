import { createClient } from "@/lib/supabase/server";
import type { FeedBook } from "@ttokttok/shared/feed";
import { BOOK_SELECT } from "@ttokttok/shared/book-fields";

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
 *
 * `failed`를 함께 주는 이유는 `getNotifications`와 같다(§11-55) — 빈 배열
 * 하나로는 "아직 읽은 책이 없다"와 "불러오다 실패했다"를 화면이 구분할 수
 * 없고, 구분하지 않으면 실패가 곧 "없음"이라는 거짓말이 된다. 여기서는
 * 특히 나쁜데, 사용자가 실제로 읽던 책이 사라진 것처럼 보인다.
 */
export async function getReadingProgress(): Promise<{
  reading: ReadingItem[];
  finished: ReadingItem[];
  failed: boolean;
}> {
  const db = await createClient();
  const { data, error } = await db
    .from("reading_progress")
    .select(`percent, completed_at, books ( ${BOOK_SELECT} )`)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("getReadingProgress:", error.message);
    return { reading: [], finished: [], failed: true };
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
    failed: false,
  };
}

/** 찜한 도서. `failed`의 이유는 getReadingProgress와 같다. */
export async function getBookmarks(): Promise<{
  books: FeedBook[];
  failed: boolean;
}> {
  const db = await createClient();
  const { data, error } = await db
    .from("bookmarks")
    .select(`books ( ${BOOK_SELECT} )`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getBookmarks:", error.message);
    return { books: [], failed: true };
  }
  return {
    books: (data ?? [])
      .map((row) => row.books as unknown as FeedBook)
      .filter(Boolean),
    failed: false,
  };
}
