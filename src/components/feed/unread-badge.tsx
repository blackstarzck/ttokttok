"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { NOTIFICATION_LIMIT } from "@/lib/notifications-client";

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
 * 전체 안 읽음 개수가 아니라 목록과 같은 최신 NOTIFICATION_LIMIT개
 * 창에서만 센다 — notifications.ts(getNotifications)는 목록을 50개로
 * 자르고 더보기·전체읽음이 없다. 배지가 전체 안 읽음 수(예: 62)를 보여주면
 * 사용자는 화면에 보이는 50개를 전부 읽어도 배지가 12로 남고, 그 12개는
 * 새 알림이 쌓일수록 점점 더 목록 밖으로 밀려나 영원히 닿을 수 없는 곳으로
 * 간다 — 사용자가 절대 지울 수 없는 배지는, 실제보다 적게 세더라도 항상
 * 지울 수 있는 배지보다 나쁘다. 숫자가 이 기능이 가진 유일한 신뢰 신호이기
 * 때문이다. 목록과 같은 창을 세면 "보이는 걸 다 읽으면 배지가 0"이 항상
 * 성립한다.
 */
export function UnreadBadge() {
  const { data } = useQuery({
    queryKey: ["unread-count"],
    queryFn: async () => {
      // count: "exact"로 전체 개수를 세지 않는다 — 목록(getNotifications)이
      // 보여주는 것과 똑같이 최신 NOTIFICATION_LIMIT개만 골라 그 안에서
      // read_at이 null인 것만 센다. 내용은 배지에 필요 없으므로 id·read_at만
      // 받는다.
      const { data: rows, error } = await createClient()
        .from("notifications")
        .select("id, read_at")
        .order("created_at", { ascending: false })
        .limit(NOTIFICATION_LIMIT);
      if (error) return 0;
      return (rows ?? []).filter((r) => r.read_at === null).length;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!data) return null;

  return (
    <span className="absolute -top-0.5 -right-0.5 flex min-h-4.5 min-w-4.5 items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-[#111111] tabular-nums">
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
