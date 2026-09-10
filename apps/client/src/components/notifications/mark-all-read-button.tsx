"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { markAllRead } from "@/lib/notifications-client";

/**
 * "모두 읽음" (§11-63).
 *
 * §11-47이 "읽음은 개별 탭으로만"이라 정한 것은 **목록 진입 시 자동 일괄
 * 처리**를 막은 것이다 — 훑고 지나간 알림까지 사라져 무엇을 못 봤는지 알
 * 수 없게 되기 때문이다. 사용자가 직접 누르는 버튼은 그 우려에 해당하지
 * 않는다. 오히려 이게 있어야 §11-47의 다른 약속("배지는 항상 지울 수
 * 있다")이 밀린 알림이 많을 때도 성립한다 — 개별 탭으로 200개를 지울 수는
 * 없다.
 *
 * 실패하면 되돌린다. NotificationRow는 실패해도 롤백하지 않는데, 그건 그
 * 행이 곧바로 router.push로 언마운트되기 때문이다(누른 사람이 이미 화면을
 * 떠났다). 여기는 화면에 남으므로, 안 지워졌는데 지워진 척하면 사용자가
 * 읽지 않은 알림을 잃었다고 믿는다.
 */
export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();

  if (unreadCount === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          setFailed(false);
          markAllRead()
            .then(() => {
              // 배지와 목록 둘 다 갱신한다 — 배지는 TanStack Query가,
              // 목록은 서버 컴포넌트라 router.refresh()가 다시 그린다.
              void qc.invalidateQueries({ queryKey: ["unread-count"] });
              router.refresh();
            })
            .catch(() => setFailed(true))
            .finally(() => setPending(false));
        }}
        // 이름이 상태에 따라 바뀌면 안 된다 — 스크린리더 사용자가 같은
        // 버튼을 다른 것으로 읽는다. 진행 상태는 aria-busy로 알린다.
        aria-busy={pending}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring min-h-11 shrink-0 rounded-md px-2 text-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        모두 읽음
      </button>
      {failed ? (
        <span className="text-muted-foreground text-xs break-keep" role="alert">
          처리하지 못했어요.
        </span>
      ) : null}
    </div>
  );
}
