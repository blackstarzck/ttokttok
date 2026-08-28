import { createClient } from "@/lib/supabase/server";

export type FeedCard = {
  sort_order: number;
  template_category: string;
  body: Record<string, unknown>;
};

export type FeedBook = {
  id: string;
  title: string;
  author: string;
  translator: string | null;
  publisher: string | null;
  cover_url: string | null;
  category: string;
  isbn: string | null;
  page_count: number | null;
  pub_date_paper: string | null;
  pub_date_ebook: string | null;
  intro: string | null;
  toc: string[];
  /** 전문 도서 판별 (PRD §11-29). NOT NULL이면 뷰어 대상, NULL이면 링크형. */
  epub_path: string | null;
  purchase_links: Record<string, string> | null;
};

export type FeedChannel = {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
};

export type FeedVideo = {
  source_type: "upload" | "youtube";
  video_path: string | null;
  youtube_id: string | null;
  duration_sec: number | null;
};

export type FeedPost = {
  id: string;
  type: "cards" | "video";
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  books: FeedBook;
  channels: FeedChannel;
  post_cards: FeedCard[];
  /** 영상 게시물일 때만 채워진다 (PRD §5.3). */
  post_videos: FeedVideo | null;
};

const SELECT = `
  id, type, like_count, comment_count, share_count, view_count,
  books ( id, title, author, translator, publisher, cover_url, category, isbn,
          page_count, pub_date_paper, pub_date_ebook, intro, toc,
          epub_path, purchase_links ),
  channels ( id, name, slug, avatar_url ),
  post_cards ( sort_order, template_category, body ),
  post_videos ( source_type, video_path, youtube_id, duration_sec )
`;

/** 카드를 sort_order 순으로 정렬한다. 조인 결과의 순서는 보장되지 않는다. */
function sortCards(post: FeedPost): FeedPost {
  return {
    ...post,
    post_cards: [...post.post_cards].sort((a, b) => a.sort_order - b.sort_order),
  };
}

export type FeedPage = {
  posts: FeedPost[];
  /** 다음 페이지 요청에 그대로 넘긴다. null이면 끝. */
  nextCursor: number | null;
};

/**
 * 같은 도서의 게시물이 연속으로 오지 않게 재배열한다 (PRD §5.1).
 *
 * 점수 순서를 최대한 지키되, 직전과 같은 도서면 다음 후보와 자리를
 * 바꾼다. 전부 같은 도서면 그대로 둔다 — 무한 루프를 만들지 않는다.
 */
function spreadByBook(posts: FeedPost[]): FeedPost[] {
  const out: FeedPost[] = [];
  const pending = [...posts];

  while (pending.length > 0) {
    const lastBook = out.at(-1)?.books.id;
    let pick = pending.findIndex((p) => p.books.id !== lastBook);
    if (pick === -1) pick = 0; // 남은 게 전부 같은 도서
    out.push(pending.splice(pick, 1)[0]);
  }
  return out;
}

/**
 * 홈 피드 한 페이지 (PRD §5.1).
 *
 * 정렬은 get_feed_v2가 한다 — 가중 랜덤 × 인기 × 신선도 × 시청 이력.
 * seed가 같으면 순서가 재현되므로 다음 페이지도 같은 seed를 넘겨야 한다.
 * 커서는 점수라, 사이에 새 글이 발행돼도 페이지가 밀리지 않는다.
 */
export async function getFeed(
  seed: string,
  sessionId: string | null,
  limit = 10,
  cursor: number | null = null,
): Promise<FeedPage> {
  const db = await createClient();

  // 1) 순서와 커서를 정한다.
  const { data: ranked, error: rankError } = await db.rpc("get_feed_v2", {
    p_seed: seed,
    p_session_id: sessionId,
    p_limit: limit,
    p_cursor: cursor,
  });

  if (rankError) {
    console.error("get_feed_v2:", rankError.message);
    return { posts: [], nextCursor: null };
  }

  const rows = (ranked ?? []) as { id: string; score: number }[];
  if (rows.length === 0) return { posts: [], nextCursor: null };

  // 2) 그 id들의 본문을 가져온다.
  const { data, error } = await db
    .from("posts")
    .select(SELECT)
    .in("id", rows.map((r) => r.id));

  if (error) {
    console.error("getFeed:", error.message);
    return { posts: [], nextCursor: null };
  }

  // in() 결과는 순서를 보장하지 않는다 — 점수 순으로 되돌린다.
  const order = new Map(rows.map((r, i) => [r.id, i]));
  const posts = ((data ?? []) as unknown as FeedPost[])
    .map(sortCards)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    posts: spreadByBook(posts),
    nextCursor: rows.length < limit ? null : rows[rows.length - 1].score,
  };
}

/**
 * 게시물 하나. 공유 딥링크(/p/[postId])의 랜딩에 쓴다.
 * 발행되지 않은 글은 RLS가 막으므로 null이 된다.
 */
export async function getPost(postId: string): Promise<FeedPost | null> {
  const db = await createClient();

  const { data, error } = await db
    .from("posts")
    .select(SELECT)
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    console.error("getPost:", error.message);
    return null;
  }
  return data ? sortCards(data as unknown as FeedPost) : null;
}

/** 채널 하나의 발행 게시물. 채널 페이지에서 쓴다. */
export async function getChannelPosts(
  channelId: string,
  limit = 30,
): Promise<FeedPost[]> {
  const db = await createClient();

  const { data, error } = await db
    .from("posts")
    .select(SELECT)
    .eq("channel_id", channelId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getChannelPosts:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as FeedPost[]).map(sortCards);
}
