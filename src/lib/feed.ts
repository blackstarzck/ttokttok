import { createClient } from "@/lib/supabase/server";

/** 영역 하나의 저장값. variant가 없으면 레지스트리 defaultVariant로 폴백. */
export type FeedRegionValue = {
  variant?: string | null;
  text?: string | null;
};

/**
 * 카드 게시물 본문 한 장 (PRD §5.2).
 * 템플릿 키가 영역 구성·순서를 정하고, regions에는 영역별 유형·텍스트만
 * 담긴다 — 도서에서 오는 값은 렌더 시점에 books에서 읽는다.
 */
export type FeedCardLayout = {
  template: string;
  regions: Record<string, FeedRegionValue>;
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
  /** 대표 인용구 — 도서 시트 2번째 섹션 (PRD §5.12). 없으면 섹션 생략. */
  quote: string | null;
  quote_source: string | null;
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
  /** 카드 게시물일 때만 채워진다 (post_id가 PK인 1:1 상세 테이블). */
  post_cards: FeedCardLayout | null;
  /** 영상 게시물일 때만 채워진다 (PRD §5.3). */
  post_videos: FeedVideo | null;
};

const SELECT = `
  id, type, like_count, comment_count, share_count, view_count,
  books ( id, title, author, translator, publisher, cover_url, category, isbn,
          page_count, pub_date_paper, pub_date_ebook, intro, quote, quote_source,
          toc, epub_path, purchase_links ),
  channels ( id, name, slug, avatar_url ),
  post_cards ( template, regions ),
  post_videos ( source_type, video_path, youtube_id, duration_sec )
`;

/**
 * 페이지 경계 (get_feed_v4).
 *
 * token은 해석하지 않는다 — DB가 만든 문자열을 그대로 돌려보내기만 하는
 * 불투명 값이다. 점수를 숫자로 주고받으면 JSON 직렬화에서 자릿수가 깎여
 * 페이지가 겹치거나 게시물이 통째로 건너뛰어진다 (마이그레이션
 * 20260828000002).
 *
 * id는 점수가 같은 게시물의 동점을 가른다 — 없으면 둘 중 하나가 영영
 * 나오지 않는다.
 */
export type FeedCursor = { token: string; id: string };

export type FeedPage = {
  posts: FeedPost[];
  /** 다음 페이지 요청에 그대로 넘긴다. null이면 끝. */
  nextCursor: FeedCursor | null;
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
 * 정렬은 get_feed_v4가 한다 — 가중 랜덤 × 인기 × 신선도 × 시청 이력.
 * seed가 같으면 순서가 재현되므로 다음 페이지도 같은 seed를 넘겨야 한다.
 * 커서는 (점수, id)라, 사이에 새 글이 발행돼도 페이지가 밀리지 않는다.
 */
export async function getFeed(
  seed: string,
  sessionId: string | null,
  limit = 10,
  cursor: FeedCursor | null = null,
): Promise<FeedPage> {
  const db = await createClient();

  // 1) 순서와 커서를 정한다.
  // p_type: null — 유형 필터 없이 전체를 섞는다 (지금까지의 홈 동작 그대로).
  const { data: ranked, error: rankError } = await db.rpc("get_feed_v4", {
    p_seed: seed,
    p_session_id: sessionId,
    p_limit: limit,
    p_cursor: cursor?.token ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_type: null,
  });

  if (rankError) {
    console.error("get_feed_v4:", rankError.message);
    return { posts: [], nextCursor: null };
  }

  const rows = (ranked ?? []) as { id: string; cursor_token: string }[];
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
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  // 커서는 재배열 전 점수 순서의 마지막이다 — spreadByBook은 화면에
  // 보이는 순서만 바꾸고 페이지 경계와는 무관하다.
  const last = rows[rows.length - 1];

  return {
    posts: spreadByBook(posts),
    nextCursor:
      rows.length < limit ? null : { token: last.cursor_token, id: last.id },
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
  return data ? (data as unknown as FeedPost) : null;
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
  return (data ?? []) as unknown as FeedPost[];
}
