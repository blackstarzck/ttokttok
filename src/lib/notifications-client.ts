import { createClient } from "@/lib/supabase/client";

/**
 * 목록 상한. notifications.ts(서버)와 이 파일(클라이언트) 둘 다 써야 해서
 * 여기 둔다 — notifications.ts는 `@/lib/supabase/server`(next/headers)를
 * 물고 있어 unread-badge.tsx 같은 클라이언트 컴포넌트가 그 값 하나만
 * 가져오려 해도 서버 전용 코드가 클라이언트 번들에 딸려 들어가 빌드가
 * 깨진다. 이 파일은 원래도 브라우저 Supabase 클라이언트만 참조하므로
 * 상수를 두기에 안전하고, notifications.ts는 여기서 값을 다시 가져와
 * 쓴다(반대 방향은 문제 없다 — 서버가 클라이언트 세이프 모듈을 참조하는
 * 것이지 그 반대가 아니다).
 */
export const NOTIFICATION_LIMIT = 50;

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
