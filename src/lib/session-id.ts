const KEY = "ttokttok.session-id";

/**
 * 게스트 조회 로깅용 세션 식별자 (FRONTEND.md §5).
 * localStorage를 못 쓰는 환경(프라이빗 모드 등)에서는 매번 새 값을 준다 —
 * 중복 집계 방지가 약해질 뿐 기능은 동작한다.
 */
export function getSessionId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;

    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}
