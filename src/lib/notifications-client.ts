import { createClient } from "@/lib/supabase/client";

/**
 * 한 페이지 크기. 여기 두는 이유: notifications.ts는
 * `@/lib/supabase/server`(next/headers)를 물고 있어, 클라이언트 컴포넌트가
 * 값 하나만 가져오려 해도 서버 전용 코드가 클라이언트 번들에 딸려 들어가
 * 빌드가 깨진다. 이 파일은 원래도 브라우저 Supabase 클라이언트만 참조하므로
 * 안전하다(서버가 클라이언트 세이프 모듈을 참조하는 방향은 문제 없다).
 *
 * 예전 이름은 `NOTIFICATION_LIMIT`이었다 — "목록이 여기까지"라는 뜻이었고,
 * 그래서 51번째부터는 목록에도 배지에도 영영 나타나지 않았다. 이제 더 보기가
 * 있어 상한이 아니라 **페이지 크기**다(§11-63).
 */
export const NOTIFICATION_PAGE_SIZE = 50;

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

/**
 * 안 읽은 알림을 **전부** 읽음 처리한다.
 *
 * §11-47은 "읽음은 개별 탭으로만"이라고 정했는데, 그건 **목록 진입 시
 * 자동 일괄 처리**를 막은 것이다 — 훑고 지나간 알림까지 사라져 무엇을 못
 * 봤는지 알 수 없게 되기 때문이다. 사용자가 직접 누르는 버튼은 그 우려에
 * 해당하지 않는다: 사라지는 것을 사용자가 고른 것이다. 오히려 이 버튼이
 * 있어야 "배지는 항상 지울 수 있다"는 §11-47의 다른 약속이 밀린 알림이
 * 많을 때도 성립한다(개별 탭으로 200개를 지울 수는 없다).
 *
 * id 목록을 받지 않는 이유: 화면에 안 보이는 페이지의 알림도 대상이다.
 * `is("read_at", null)`로 조건만 주면 RLS(notifications_update_own)가
 * 내 행으로 좁히고, 컬럼 권한이 read_at 하나로 좁혀져 있다(§11-45).
 */
export async function markAllRead() {
  const { error } = await createClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw new Error(error.message);
}
