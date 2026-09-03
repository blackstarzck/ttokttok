import { createClient } from "@/lib/supabase/client";

/**
 * 알림을 읽음 처리한다. 묶인 좋아요는 묶음이 덮는 id 전부를 한 번에 넘긴다.
 *
 * read_at 외의 컬럼은 권한이 없어 애초에 쓸 수 없다(Task 1의 grant).
 * 파일이 나뉜 이유는 서버·클라이언트 Supabase 클라이언트 혼용 금지다.
 */
export async function markRead(ids: string[]) {
  if (!ids.length) return;
  const { error } = await createClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
}
