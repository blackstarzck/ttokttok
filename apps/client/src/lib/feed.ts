import type { FeedPost, FeedCursor, FeedPage, PostType } from '@ttokttok/shared/feed';
import { createClient } from "@/lib/supabase/server";
import { BOOK_SELECT } from "@ttokttok/shared/book-fields";

const SELECT = `
  id, type, like_count, comment_count, share_count, view_count,
  books ( ${BOOK_SELECT} ),
  channels ( id, name, slug, avatar_url ),
  post_cards ( template, regions, background ),
  post_videos ( source_type, video_path, youtube_id, duration_sec )
`;

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
  // 널이면 전 유형을 섞는다 — 개편이 끝나기 전까지 홈이 기존 동작을
  // 유지해야 하기 때문이다 (IA 개편 결정 12).
  type: PostType | null = null,
): Promise<FeedPage> {
  const db = await createClient();

  // 1) 순서와 커서를 정한다.
  const { data: ranked, error: rankError } = await db.rpc("get_feed_v4", {
    p_seed: seed,
    p_session_id: sessionId ?? undefined,
    p_limit: limit,
    p_cursor: cursor?.token,
    p_cursor_id: cursor?.id,
    p_type: type ?? undefined,
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

/**
 * 채널 하나의 발행 게시물. 채널 페이지에서 쓴다.
 *
 * `failed`는 getFeed와 같은 규약이다(§11-55) — 빈 배열 하나로는 "아직
 * 게시물이 없는 채널"과 "불러오다 실패했다"를 화면이 구분할 수 없다.
 */
export async function getChannelPosts(
  channelId: string,
  limit = 30,
): Promise<{ posts: FeedPost[]; failed: boolean }> {
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
    return { posts: [], failed: true };
  }
  return { posts: (data ?? []) as unknown as FeedPost[], failed: false };
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
): Promise<{ posts: FeedPost[]; failed: boolean }> {
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
    return { posts: [], failed: true };
  }
  return { posts: (data ?? []) as unknown as FeedPost[], failed: false };
}
