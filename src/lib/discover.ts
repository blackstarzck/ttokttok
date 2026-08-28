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

export type TrendingSource = "recent" | "cumulative";

export type Trending = {
  posts: TrendingPost[];
  /** 기간 집계인지, 로그가 부족해 누적으로 대체했는지 */
  source: TrendingSource;
};

/**
 * 급상승 — 최근 7일 조회수 상위 (PRD §5.6-4).
 *
 * get_trending_posts가 view_logs를 기간으로 집계한다. 다만 서비스 초기나
 * 로그를 비운 직후에는 결과가 비는데, 그때 화면에서 영역이 통째로
 * 사라지면 탐색 탭이 휑해진다 — 누적 조회수로 대체해 채운다.
 */
export async function getTrendingPosts(limit = 12): Promise<Trending> {
  const db = await createClient();

  const { data: ranked, error } = await db.rpc("get_trending_posts", {
    p_days: 7,
    p_limit: limit,
  });
  if (error) console.error("get_trending_posts:", error.message);

  const rows = (ranked ?? []) as { post_id: string; recent_views: number }[];

  if (rows.length > 0) {
    const { data } = await db
      .from("posts")
      .select(`id, view_count, books ( ${BOOK_FIELDS} )`)
      .in("id", rows.map((r) => r.post_id));

    const order = new Map(rows.map((r, i) => [r.post_id, i]));
    const posts = ((data ?? []) as unknown as TrendingPost[]).sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    return { posts, source: "recent" };
  }

  // 폴백 — 기간 로그가 없을 때만.
  const { data } = await db
    .from("posts")
    .select(`id, view_count, books ( ${BOOK_FIELDS} )`)
    .eq("status", "published")
    .order("view_count", { ascending: false })
    .limit(limit);

  return {
    posts: (data ?? []) as unknown as TrendingPost[],
    source: "cumulative",
  };
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
