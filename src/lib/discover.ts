import { createClient } from "@/lib/supabase/server";
import type { FeedBook } from "@/lib/feed";

/** 탐색 화면이 쓰는 도서 요약. 시트를 열어야 하므로 FeedBook 전체가 필요하다. */
export type DiscoverBook = FeedBook;

const BOOK_FIELDS = `
  id, title, author, translator, publisher, cover_url, category, isbn,
  page_count, pub_date_paper, pub_date_ebook, intro, toc,
  epub_path, purchase_links
`;

/** 오늘의 추천 — 어드민이 지정한 도서 (PRD §5.6-2). */
export async function getFeaturedBooks(): Promise<DiscoverBook[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("featured_books")
    .select(`sort_order, books ( ${BOOK_FIELDS} )`)
    .eq("active", true)
    .order("sort_order");

  if (error) {
    console.error("getFeaturedBooks:", error.message);
    return [];
  }
  return (data ?? [])
    .map((row) => row.books as unknown as DiscoverBook)
    .filter(Boolean);
}

/** 장르 칩 — 실제 도서가 있는 카테고리만 (PRD §5.6-3). */
export async function getCategories(): Promise<string[]> {
  const db = await createClient();
  const { data, error } = await db.from("books").select("category");

  if (error) {
    console.error("getCategories:", error.message);
    return [];
  }
  return [...new Set((data ?? []).map((r) => r.category))].sort();
}

export type TrendingPost = {
  id: string;
  view_count: number;
  books: DiscoverBook;
};

/**
 * 급상승 — 최근 7일 조회수 상위 (PRD §5.6-4).
 *
 * view_logs를 세는 게 정확하지만, 로그가 쌓이기 전에는 결과가 비어 있다.
 * 누적 조회수(posts.view_count)로 대신 정렬하고, 로그가 충분해지면
 * 기간 집계로 바꾼다.
 */
export async function getTrendingPosts(limit = 12): Promise<TrendingPost[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("posts")
    .select(`id, view_count, books ( ${BOOK_FIELDS} )`)
    .eq("status", "published")
    .order("view_count", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getTrendingPosts:", error.message);
    return [];
  }
  return (data ?? []) as unknown as TrendingPost[];
}

export type SearchResults = {
  books: DiscoverBook[];
  channels: { id: string; name: string; slug: string; genre: string }[];
};

/**
 * 검색 (PRD §5.6-1) — 도서 제목·저자, 채널명.
 * trigram 인덱스가 깔려 있어 ILIKE 부분 일치로 충분하다.
 */
export async function search(query: string): Promise<SearchResults> {
  const term = query.trim();
  if (!term) return { books: [], channels: [] };

  const db = await createClient();
  const like = `%${term}%`;

  const [books, channels] = await Promise.all([
    db
      .from("books")
      .select(BOOK_FIELDS)
      .or(`title.ilike.${like},author.ilike.${like}`)
      .order("title")
      .limit(20),
    db
      .from("channels")
      .select("id, name, slug, genre")
      .ilike("name", like)
      .limit(10),
  ]);

  if (books.error) console.error("search books:", books.error.message);
  if (channels.error) console.error("search channels:", channels.error.message);

  return {
    books: (books.data ?? []) as unknown as DiscoverBook[],
    channels: channels.data ?? [],
  };
}

/** 장르 칩을 눌렀을 때 — 해당 카테고리 도서. */
export async function getBooksByCategory(
  category: string,
): Promise<DiscoverBook[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("books")
    .select(BOOK_FIELDS)
    .eq("category", category)
    .order("title");

  if (error) {
    console.error("getBooksByCategory:", error.message);
    return [];
  }
  return (data ?? []) as unknown as DiscoverBook[];
}
