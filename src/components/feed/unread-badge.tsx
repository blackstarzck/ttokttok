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
 */
export function UnreadBadge() {
  const { data } = useQuery({
    queryKey: ["unread-count"],
    queryFn: async () => {
      const { count } = await createClient()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!data) return null;

  return (
    <span
      aria-label={`읽지 않은 알림 ${data}개`}
      className="absolute -top-0.5 -right-0.5 flex min-h-4.5 min-w-4.5 items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-[#111111] tabular-nums"
    >
      {data > 99 ? "99+" : data}
    </span>
  );
}
