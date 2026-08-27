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
  access_type: "full" | "preview";
};

export type FeedChannel = {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
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
};

const SELECT = `
  id, type, like_count, comment_count, share_count, view_count,
  books ( id, title, author, translator, publisher, cover_url, category, isbn,
          page_count, pub_date_paper, pub_date_ebook, intro, toc, access_type ),
  channels ( id, name, slug, avatar_url ),
  post_cards ( sort_order, template_category, body )
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
