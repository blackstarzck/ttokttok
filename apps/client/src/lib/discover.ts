import { createClient } from "@/lib/supabase/server";
import type { FeedBook } from "@ttokttok/shared/feed";
import { BOOK_SELECT } from "@ttokttok/shared/book-fields";

/** 탐색 화면이 쓰는 도서 요약. 시트를 열어야 하므로 FeedBook 전체가 필요하다. */
export type DiscoverBook = FeedBook;

/** 오늘의 추천 — 어드민이 지정한 도서 (PRD §5.6-2). */
export async function getFeaturedBooks(): Promise<{
  books: DiscoverBook[];
  failed: boolean;
}> {
  const db = await createClient();
  const { data, error } = await db
    .from("featured_books")
    .select(`sort_order, books ( ${BOOK_SELECT} )`)
    .eq("active", true)
    .order("sort_order");

  if (error) {
    console.error("getFeaturedBooks:", error.message);
    return { books: [], failed: true };
  }
  return {
    books: (data ?? [])
      .map((row) => row.books as unknown as DiscoverBook)
      .filter(Boolean),
    failed: false,
  };
}

/** 장르 칩 — 실제 도서가 있는 카테고리만 (PRD §5.6-3). */
export async function getCategories(): Promise<{
  categories: string[];
  failed: boolean;
}> {
  const db = await createClient();
  const { data, error } = await db.from("books").select("category");

  if (error) {
    console.error("getCategories:", error.message);
    return { categories: [], failed: true };
  }
  return {
    categories: [...new Set((data ?? []).map((r) => r.category))].sort(),
    failed: false,
  };
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
  /**
   * 본문 조회가 실패했는가.
   *
   * RPC(`get_trending_posts`) 실패는 여기 안 센다 — 그때는 누적 조회수로
   * 폴백해 **실제 데이터를 보여주고**, 제목도 "많이 본 글"로 정확히
   * 바뀐다(source). 반면 본문 조회가 실패하면 목록이 통째로 비어 "급상승이
   * 없다"는 거짓말이 된다.
   */
  failed: boolean;
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
    const { data, error: bodyError } = await db
      .from("posts")
      .select(`id, view_count, books ( ${BOOK_SELECT} )`)
      .in("id", rows.map((r) => r.post_id));

    const order = new Map(rows.map((r, i) => [r.post_id, i]));
    const posts = ((data ?? []) as unknown as TrendingPost[]).sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    if (bodyError) console.error("getTrendingPosts:", bodyError.message);
    return { posts, source: "recent", failed: Boolean(bodyError) };
  }

  // 폴백 — 기간 로그가 없을 때만.
  const { data, error: fallbackError } = await db
    .from("posts")
    .select(`id, view_count, books ( ${BOOK_SELECT} )`)
    .eq("status", "published")
    .order("view_count", { ascending: false })
    .limit(limit);

  if (fallbackError) console.error("getTrendingPosts fallback:", fallbackError.message);
  return {
    posts: (data ?? []) as unknown as TrendingPost[],
    source: "cumulative",
    failed: Boolean(fallbackError),
  };
}

export type SearchResults = {
  books: DiscoverBook[];
  channels: { id: string; name: string; slug: string; genre: string }[];
  /**
   * 둘 중 **하나라도** 실패했는가.
   *
   * 나눠서 알리지 않는 이유: 화면이 두 결과를 한 덩어리("검색 결과 없음")로
   * 다루므로, 어느 쪽이 실패했는지는 사용자가 할 수 있는 일을 바꾸지
   * 않는다. 어느 쪽이 실패했는지는 서버 로그에 남는다.
   */
  failed: boolean;
};

/**
 * 검색 (PRD §5.6-1) — 도서 제목·저자, 채널명.
 * trigram 인덱스가 깔려 있어 ILIKE 부분 일치로 충분하다.
 */
export async function search(query: string): Promise<SearchResults> {
  const term = query.trim();
  if (!term) return { books: [], channels: [], failed: false };

  const db = await createClient();
  const like = `%${term}%`;

  const [books, channels] = await Promise.all([
    db
      .from("books")
      .select(BOOK_SELECT)
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
    failed: Boolean(books.error || channels.error),
  };
}

/** 장르 칩을 눌렀을 때 — 해당 카테고리 도서. */
export async function getBooksByCategory(
  category: string,
): Promise<{ books: DiscoverBook[]; failed: boolean }> {
  const db = await createClient();
  const { data, error } = await db
    .from("books")
    .select(BOOK_SELECT)
    .eq("category", category)
    .order("title");

  if (error) {
    console.error("getBooksByCategory:", error.message);
    return { books: [], failed: true };
  }
  return { books: (data ?? []) as unknown as DiscoverBook[], failed: false };
}
