"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * 안 읽은 알림 수 (결정 14).
 *
 * 60초 폴링 + 창 포커스로 갱신한다. 릴스형 피드는 사용자가 라우트를 안
 * 바꾸고 계속 스크롤하므로 진입 시 조회만으로는 배지가 계속 0으로 보인다.
 * Realtime을 쓰지 않는 이유: 하루 몇 건 볼륨에 WebSocket 상주가 과하고
 * 이 저장소에 Realtime 선례가 없다.
 *
 * 전역 기본값이 refetchOnWindowFocus: false라 여기서만 켠다.
 * RLS(notifications_select_own)가 본인 행만 주므로 recipient 조건이 없다.
 *
 * **전체 안 읽음 수를 센다.** 예전에는 목록과 같은 최신 50개 창에서만
 * 셌는데, 그건 목록이 50개에서 잘리고 더 보기가 없던 시절의 처방이었다 —
 * 전체 수(예: 62)를 보여주면 화면에 보이는 50개를 다 읽어도 배지가 12로
 * 남고, 그 12개는 새 알림이 쌓일수록 목록 밖으로 더 밀려나 **영원히 닿을
 * 수 없었다.** 지울 수 없는 배지보다는 적게 세는 배지가 낫다고 봤다.
 *
 * 이제 그 전제가 없다(§11-63): 목록에 더 보기가 생겨 51번째 이후에도
 * 닿을 수 있고, "모두 읽음"이 한 번에 지운다. 닿을 수 있으면 정직한 수가
 * 낫다 — 창으로 좁히면 이번엔 배지가 실제보다 **적게** 세어 사용자가
 * 놓친 알림을 모르게 된다.
 *
 * 색은 시맨틱 토큰(`destructive`)이다 — 예전에는 `bg-white`/`text-[#111111]`
 * 고정값이었는데, 그건 `TopBar`가 임의의 콘텐츠 픽셀 위 오버레이였을 때
 * 얘기다(IA 결정 기록 §11-53로 구조적 헤더가 됨). 지금 이 배지가 앉는
 * 면은 `bg-background`인 카드 표면이라, 흰색 고정을 그대로 두면 라이트
 * 테마에서 배지가 배경과 거의 같은 명도라 로고와 같은 흰색-위-흰색
 * 문제가 재현된다.
 */
export function UnreadBadge() {
  const { data } = useQuery({
    queryKey: ["unread-count"],
    queryFn: async () => {
      // head: true라 행 본문을 받지 않는다 — 배지에 필요한 건 수뿐이다.
      // 예전에는 최신 50개를 받아 그 안에서 셌는데, 이제 전체를 센다(위 주석).
      const { count, error } = await createClient()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!data) return null;

  return (
    <span className="bg-destructive text-destructive-foreground ring-background absolute -top-0.5 -right-0.5 flex min-h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-xs font-bold ring-2 tabular-nums">
      {/* 이 span은 태그를 안 붙이면 role="generic"인데, ARIA 스펙은
          generic role에 이름을 붙이는 것 자체를 금지한다 — aria-label을
          여기 달면 브라우저·스크린리더마다 처리가 갈려 이식성이 없다
          (Chrome은 우연히 읽어주지만 보장된 동작이 아니다). 그래서 숫자는
          시각 전용으로 감추고, 전체 문구는 별도의 sr-only 텍스트로
          제공한다 — 둘 다 읽히면 "2 읽지 않은 알림 2개"처럼 중복
          낭독되므로 시각 숫자는 aria-hidden으로 뺀다. 부모 Link의
          aria-label="알림"은 그대로다: 조상에 aria-label이 있으면
          접근 가능한 이름 계산에서 하위 텍스트는 무시되므로 이 sr-only
          문구가 "알림"이라는 이름을 바꾸지 않는다 — 다만 가상 커서로
          훑는 스크린리더는 이름과 별개로 하위 텍스트 노드를 그대로
          읽어주므로 안 읽은 개수는 여전히 announce된다. */}
      <span aria-hidden>{data > 99 ? "99+" : data}</span>
      <span className="sr-only">읽지 않은 알림 {data}개</span>
    </span>
  );
}
