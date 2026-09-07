import { createClient } from "@/lib/supabase/server";
import { BOOK_SELECT } from "@/lib/book-fields";

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
  books ( ${BOOK_SELECT} ),
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
 *
 * token에는 점수뿐 아니라 **점수의 시간 기준점(as_of)**도 들어 있다
 * (`<점수>|<as_of>`, 마이그레이션 20260907000001, PRD §11-59). 그래서 이
 * 값은 단순한 페이지 경계가 아니라 "이 페이지네이션이 어느 시점의 세상을
 * 보고 있는가"이기도 하다 — 다른 페이지네이션의 커서를 섞어 쓰거나 오래
 * 들고 있던 커서를 재사용하면 그 시점의 점수로 계산된다. 여기서도
 * 해석하지 않는다.
 */
export type FeedCursor = { token: string; id: string };

export type FeedPage = {
  posts: FeedPost[];
  /** 다음 페이지 요청에 그대로 넘긴다. null이면 끝. */
  nextCursor: FeedCursor | null;
  /**
   * RPC·본문 조회가 실패했는가 (notifications.ts의 getNotifications와
   * 같은 이유로 둔다). posts가 빈 배열인 경우가 "정말 게시물이 없다"와
   * "불러오다 실패했다" 둘 다일 수 있는데, 실패를 빈 배열로 감추면 화면이
   * 사용자에게 거짓말을 한다 — 카드 목록이 있어야 할 자리가 그냥 백지가
   * 된다. 호출부(page.tsx·feed-actions.tsx)가 이 값으로 두 경우를
   * 구분해 다른 문구를 보여준다.
   */
  failed: boolean;
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

/** 게시물 유형. posts.type의 체크 제약과 같은 값이다. */
export type PostType = "cards" | "video";

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
  // 널이면 전 유형을 섞는다 — 개편이 끝나기 전까지 홈이 기존 동작을
  // 유지해야 하기 때문이다 (IA 개편 결정 12).
  type: PostType | null = null,
): Promise<FeedPage> {
  const db = await createClient();

  // 1) 순서와 커서를 정한다.
  const { data: ranked, error: rankError } = await db.rpc("get_feed_v4", {
    p_seed: seed,
    p_session_id: sessionId,
    p_limit: limit,
    p_cursor: cursor?.token ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_type: type,
  });

  if (rankError) {
    console.error("get_feed_v4:", rankError.message);
    return { posts: [], nextCursor: null, failed: true };
  }

  const rows = (ranked ?? []) as { id: string; cursor_token: string }[];
  // 진짜 빈 피드다 — RPC가 성공했고 그냥 더 줄 게 없다는 뜻이라 failed가
  // 아니다.
  if (rows.length === 0) return { posts: [], nextCursor: null, failed: false };

  // 2) 그 id들의 본문을 가져온다.
  const { data, error } = await db
    .from("posts")
    .select(SELECT)
    .in("id", rows.map((r) => r.id));

  if (error) {
    console.error("getFeed:", error.message);
    return { posts: [], nextCursor: null, failed: true };
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
    failed: false,
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
    // published_at만으로는 동점(같은 밀리초에 발행) 시 행 순서가
    // 불특정이다 — id를 2차 키로 둬 채널 그리드와 뷰어(getChannelVideos)가
    // 항상 같은 순서로 정렬되게 고정한다. 오늘은 발행이 매번 새 밀리초
    // 타임스탬프를 찍어 동점이 나지 않지만, 대비하지 않을 이유가 없다.
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getChannelPosts:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FeedPost[];
}

/**
 * 채널 하나의 발행된 **영상** 게시물. 채널 스코프 릴스 뷰어가 쓴다.
 *
 * 랭킹(get_feed_v4)을 타지 않고 채널 그리드와 같은 발행 역순으로 준다 —
 * 사용자가 그리드에서 본 순서 그대로 위아래로 넘기게 하려는 것이고,
 * 그래야 "탭한 게시물에서 시작"이 목록 안의 단순한 인덱스가 된다.
 * 랭킹을 쓰면 커서·점수 때문에 임의 위치에서 시작하는 것이 어려워진다
 * (결정 10이 급상승에서 피한 문제와 같다).
 */
export async function getChannelVideos(
  channelId: string,
  limit = 30,
): Promise<FeedPost[]> {
  const db = await createClient();

  const { data, error } = await db
    .from("posts")
    .select(SELECT)
    .eq("channel_id", channelId)
    .eq("status", "published")
    .eq("type", "video")
    // getChannelPosts와 같은 2차 키(id)를 쓴다 — 동점이 생기면 그리드와
    // 뷰어 정렬이 서로 다른 순서를 고를 수 있고, 30개 경계에서는 그리드엔
    // 보이는데 뷰어 목록엔 없는 영상이 생겨 "탭한 게시물에서 시작"의
    // start가 조용히 못 찾는 사고로 이어진다.
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getChannelVideos:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FeedPost[];
}
