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

/**
 * 홈 피드 한 페이지.
 *
 * 정렬은 get_feed RPC가 담당한다 (가중 랜덤 × 인기 × 신선도).
 * seed가 같으면 순서가 재현되므로, 페이지네이션 시 같은 seed를 넘겨야
 * 다음 페이지가 어긋나지 않는다.
 */
export async function getFeed(
  seed: string,
  limit = 10,
  offset = 0,
): Promise<FeedPost[]> {
  const db = await createClient();

  const { data, error } = await db
    .rpc("get_feed", { p_seed: seed, p_limit: limit, p_offset: offset })
    .select(SELECT);

  if (error) {
    console.error("getFeed:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as FeedPost[]).map((post) => ({
    ...post,
    post_cards: [...post.post_cards].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  }));
}

/** 카드를 sort_order 순으로 정렬한다. 조인 결과의 순서는 보장되지 않는다. */
function sortCards(post: FeedPost): FeedPost {
  return {
    ...post,
    post_cards: [...post.post_cards].sort((a, b) => a.sort_order - b.sort_order),
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
