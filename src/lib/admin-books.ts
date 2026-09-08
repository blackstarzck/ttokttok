import type { BookOption } from "@/components/admin/book-select";
import { createClient } from "@/lib/supabase/server";

/**
 * 게시물 폼의 도서 선택지 — 도서마다 이미 달린 게시물 수를 함께 센다.
 *
 * 중복을 막지는 않고 경고만 띄운다 (PRD §5.10). 카운트는 임시저장까지
 * 포함한다 — 발행 전 초안도 "이미 만든 것"이므로 관리자가 알아야 한다.
 */
export async function getBookOptions(): Promise<BookOption[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("books")
    .select("id, title, author, posts(count)")
    .order("title");

  // 삼키면 도서 셀렉트가 텅 빈 채로 뜨고, 관리자는 도서를 먼저 등록해야
  // 하는 줄 안다 — 게시물 폼은 도서 없이는 아무것도 못 만드는 화면이라
  // 그 오해가 곧 막다른 길이다. 던지면 호출부(posts/new·posts/[postId])가
  // 그대로 에러 화면이 된다. 관용구는 admin/reports/page.tsx 참고.
  if (error) throw new Error(error.message);

  return (data ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    // PostgREST의 집계는 [{ count: n }] 형태로 온다.
    postCount:
      (b.posts as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}
