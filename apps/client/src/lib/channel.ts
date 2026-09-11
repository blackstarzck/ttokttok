import { createClient } from "@/lib/supabase/server";

/**
 * 채널 하나. slug로 찾는다.
 *
 * 채널 페이지(`/channel/[slug]`)와 채널 스코프 릴스 뷰어
 * (`/channel/[slug]/reels`) 둘 다 쓴다 — 슬러그로 채널을 찾는 로직이
 * 두 곳에 복제되지 않도록 여기 하나로 둔다. 뷰어는 `id`·`name`만
 * 쓰지만 select 컬럼 목록은 채널 페이지 것 그대로 둔다(갈라두면 한쪽만
 * 고쳐지는 전례가 있었다 — chrome.ts/card-chrome.ts).
 */
export async function getChannel(slug: string) {
  const db = await createClient();
  const { data, error } = await db
    .from("channels")
    .select("id, name, slug, genre, description, avatar_url, cover_url")
    .eq("slug", slug)
    .maybeSingle();

  // error를 삼키면 조회 실패가 그대로 notFound()로 흘러가, 멀쩡히 있는
  // 채널을 **"없는 채널"이라고 거짓말**한다 — 영상을 누르고 들어온
  // 사용자가 막다른 길에 갇힌다. 화면이 두 경우에 다른 말을 할 수 있도록
  // 나눠 준다 (§11-55의 getFeed·getNotifications와 같은 규약).
  if (error) {
    console.error("getChannel:", error.message);
    return { channel: null, failed: true };
  }
  return { channel: data, failed: false };
}

/**
 * 채널의 발행 게시물 수와 그중 영상 수.
 *
 * 그리드에 실린 목록(`getChannelPosts`, 최대 30건 — §11-58)으로 세면
 * 30건을 넘는 채널에서 "게시물 30"으로 틀리고, 영상이 전부 31번째
 * 뒤에 있으면 "영상 이어보기"가 사라진다. 그래서 head count 두 번을
 * 병렬로 던진다 — 행을 받지 않으니 비용은 카운트 쿼리 두 개다.
 *
 * `failed`면 화면은 "게시물 –"를 그리고 "영상 이어보기"를 숨긴다 —
 * 영상 0건 채널의 뷰어는 `notFound()`로 답하므로, 모르는 채로 링크를
 * 살려두면 막다른 길이 된다 (설계 문서 §1.2).
 */
export async function getChannelCounts(
  channelId: string,
): Promise<{ total: number; videos: number; failed: boolean }> {
  const db = await createClient();
  const published = () =>
    db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .eq("status", "published");

  const [all, videos] = await Promise.all([
    published(),
    published().eq("type", "video"),
  ]);

  const error = all.error ?? videos.error;
  if (error) {
    console.error("getChannelCounts:", error.message);
    return { total: 0, videos: 0, failed: true };
  }
  return { total: all.count ?? 0, videos: videos.count ?? 0, failed: false };
}
