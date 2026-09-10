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
    .select("id, name, slug, genre, description, avatar_url")
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
