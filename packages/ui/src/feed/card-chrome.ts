/**
 * 카드 표면(홈 카드) 액션 줄의 공통 클래스.
 *
 * chrome.ts가 오버레이 크롬(전면 피드) 쪽 상수를 모아 둔 것과 대응하는
 * 카드 쪽 모음이다. chrome.ts의 주석이 남긴 교훈이 여기서 또 재현됐다 —
 * "예전에는 같은 문자열이 action-bar와 like-button에 복제돼 있었다"는데,
 * 이번엔 같은 문자열이 card-actions.tsx와 like-button.tsx(surface 변형)에
 * 다시 복제돼 있었다. 한 곳만 고치면 카드 위에서 좋아요 버튼만 댓글·공유
 * 버튼과 색이 갈린다.
 *
 * **주의**: 이 파일은 chrome.ts를 import하지 않는다. chrome.ts의 흰색
 * 고정 예외는 오버레이 크롬 전용이고(DESIGN.md Colors), 카드는 밑에
 * 깔리는 것이 불투명 card 표면이라 판독성을 걱정할 이유가 없다 — 항상
 * 시맨틱 토큰만 쓴다.
 */

/** 카드 액션 줄 버튼(좋아요·댓글·공유) 공통 껍데기. 44×44 터치 타깃을 보장한다. */
export const CARD_ACTION =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none";

/** 카운트 숫자. */
export const CARD_COUNT = "text-xs tabular-nums";
