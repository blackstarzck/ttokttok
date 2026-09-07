/**
 * 게스트 조회 로깅 · 피드 seen_penalty용 세션 식별자 (FRONTEND.md §5).
 *
 * **쿠키에 둔다 — localStorage가 아니다.** 서버 컴포넌트가 피드 1페이지를
 * 그릴 때 이 값을 읽어야 하기 때문이다. localStorage에 있던 동안에는 서버가
 * 읽을 방법이 없어 1페이지를 `p_session_id = null`로 랭킹했고, 다음 페이지는
 * 클라이언트가 실제 id로 불러서 **점수 함수가 페이지마다 달랐다**.
 * seen_penalty(3일 내 본 게시물 ×0.25)가 한쪽에만 걸리니 같은 게시물이 두
 * 페이지에 모두 랭크됐다 — 실측: 카드 16개에서 2페이지 9행 중 3행이 1페이지와
 * 겹쳤다(널로 부르면 겹침 0). 중복 제거 가드가 걸러 주지만 그만큼 페이지가
 * 짧아지고, 눌리는 건 하필 방금 사용자가 머문 게시물들이다.
 *
 * 피드 seed(`feed-seed.ts`)가 같은 이유로 이미 쿠키에 있다 — 같은 처방이다.
 * 다만 seed는 방문마다 새로 뽑아야 해서 maxAge가 없는 세션 쿠키인 반면,
 * 이 값은 **지속돼야 한다**: seen_penalty가 3일을 돌아보는데 브라우저 세션은
 * 대개 그보다 짧아, 세션 쿠키로 두면 그 3일이 사실상 무의미해진다.
 *
 * 미들웨어가 없으면 심어 준다(`lib/supabase/middleware.ts`). 여기서 다시
 * 만드는 경로는 쿠키를 못 쓰는 환경(프라이빗 모드 등)을 위한 폴백이고,
 * 그때는 중복 집계 방지가 약해질 뿐 기능은 동작한다.
 */
export const SESSION_ID_COOKIE = "ttokttok.session-id";

/** 쿠키 수명. seen_penalty가 3일을 보므로 그보다 넉넉해야 한다. 400일은
 *  브라우저가 허용하는 상한이며, localStorage에 있을 때의 "사실상 영구"에
 *  가장 가깝다. */
export const SESSION_ID_MAX_AGE = 60 * 60 * 24 * 400;

/** 쿠키 문자열에서 세션 id를 뽑는다. 서버·클라이언트가 같은 파서를 쓰도록
 *  꺼내 뒀다 — 두 곳이 다르게 읽으면 페이지마다 점수가 갈리는 그 버그가
 *  다른 모습으로 돌아온다. */
export function readSessionId(cookieHeader: string): string | null {
  const match = cookieHeader.match(
    /(?:^|;\s*)ttokttok\.session-id=([^;]*)/,
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 클라이언트에서 세션 id를 읽는다.
 *
 * 미들웨어가 심어 두므로 보통은 그 값이 그대로 나온다. 서버가 1페이지를
 * 그릴 때 쓴 값과 **같아야** 하므로 여기서 임의로 새로 만들지 않는다 —
 * 쿠키가 없을 때만 폴백한다.
 */
export function getSessionId(): string {
  try {
    return readSessionId(document.cookie) ?? crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}
