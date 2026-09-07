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
  const { data } = await db
    .from("channels")
    .select("id, name, slug, genre, description, avatar_url")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}
