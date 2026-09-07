"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** 서버 액션이 결과를 알릴 때 쓰는 쿼리 키들(성공·안내 모두). 토스트를 띄운 뒤 지운다. */
const TOAST_KEYS = ["saved", "deleted", "done", "removed", "imported", "exists"];

/**
 * 어드민 알림 (PRD §5.10).
 *
 * 서버 액션이 리다이렉트 쿼리로 넘긴 메시지를 토스트로 띄우고 주소에서
 * 지운다. 쿼리에 남겨 두면 새로고침할 때마다 "삭제했습니다."가 다시
 * 뜬다 — 이미 끝난 일이 화면에 계속 남는다.
 *
 * `variant`로 "성공"과 "안내"를 가른다. `exists`(이미 등록된 문서라
 * 기존 도서를 연다)처럼 액션이 **일어나지 않은** 경우까지 초록색 성공
 * 토스트로 보이면 관리자가 방금 임포트가 됐다고 오해한다 — 그래서 이
 * 경로는 variant="info"로 sonner의 중립 톤을 쓴다. 기본값은 success로
 * 두어 기존 호출부(저장·삭제 등)는 그대로 성공 토스트를 받는다.
 *
 * 오류는 반대다. 관리자가 고칠 때까지 읽을 수 있어야 하므로 AdminNotice
 * 배너로 남긴다.
 *
 * 주소 정리는 history.replaceState로 한다. router.replace를 쓰면 지우는
 * 것만으로 서버 왕복이 한 번 더 생긴다. variant와 무관하게 모든 키에서
 * 똑같이 동작해야 한다 — 안 지우면 새로고침마다 안내 토스트도 다시 뜬다.
 */
export function AdminToast({
  message,
  variant = "success",
}: {
  message?: string;
  variant?: "success" | "info";
}) {
  // StrictMode에서 이펙트가 두 번 돌아 토스트가 겹치는 걸 막는다.
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message || shownRef.current === message) return;
    shownRef.current = message;

    if (variant === "info") {
      toast.info(message, { duration: 3000 });
    } else {
      toast.success(message, { duration: 3000 });
    }

    const url = new URL(window.location.href);
    const had = TOAST_KEYS.filter((key) => url.searchParams.has(key));
    if (had.length === 0) return;

    had.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [message, variant]);

  return null;
}
