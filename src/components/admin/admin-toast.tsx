"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** 서버 액션이 성공을 알릴 때 쓰는 쿼리 키들. 토스트를 띄운 뒤 지운다. */
const SUCCESS_KEYS = ["saved", "deleted", "done", "removed", "imported", "exists"];

/**
 * 어드민 성공 알림 (PRD §5.10).
 *
 * 서버 액션이 리다이렉트 쿼리로 넘긴 메시지를 토스트로 띄우고 주소에서
 * 지운다. 쿼리에 남겨 두면 새로고침할 때마다 "삭제했습니다."가 다시
 * 뜬다 — 이미 끝난 일이 화면에 계속 남는다.
 *
 * 오류는 반대다. 관리자가 고칠 때까지 읽을 수 있어야 하므로 AdminNotice
 * 배너로 남긴다.
 *
 * 주소 정리는 history.replaceState로 한다. router.replace를 쓰면 지우는
 * 것만으로 서버 왕복이 한 번 더 생긴다.
 */
export function AdminToast({ message }: { message?: string }) {
  // StrictMode에서 이펙트가 두 번 돌아 토스트가 겹치는 걸 막는다.
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message || shownRef.current === message) return;
    shownRef.current = message;

    toast.success(message, { duration: 3000 });

    const url = new URL(window.location.href);
    const had = SUCCESS_KEYS.filter((key) => url.searchParams.has(key));
    if (had.length === 0) return;

    had.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [message]);

  return null;
}
