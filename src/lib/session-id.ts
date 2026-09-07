/**
 * 게스트 조회 로깅 · 피드 seen_penalty용 세션 식별자 (FRONTEND.md §5).
 *
 * **쿠키에 둔다 — localStorage가 아니다.** 서버 컴포넌트가 피드 1페이지를
 * 그릴 때 이 값을 읽어야 하기 때문이다. localStorage에 있던 동안에는 서버가
 * 읽을 방법이 없어 1페이지를 `p_session_id = null`로 랭킹했고, 다음 페이지는
 * 클라이언트가 실제 id로 불러서 **점수 함수가 페이지마다 달랐다**.
 * seen_penalty(3일 내 본 게시물 ×0.25)가 한쪽에만 걸리니 같은 게시물이 두
 * 페이지에 모두 랭크됐다 — 실측: 세션에 시청 이력이 있을 때 1페이지 5행,
 * 2페이지 5행 중 **3행이 1페이지와 겹쳤다**. 양쪽을 같은 id로 부르면 2페이지가
 * 3행에 겹침 0이 된다(총 8건이라 3이 맞는 값이다). 중복 제거 가드가 걸러
 * 주지만 그만큼 페이지가 짧아지고, 눌리는 건 하필 방금 사용자가 머문 게시물들이다.
 *
 * **다만 이걸로 중복이 다 없어지지는 않는다.** 남는 경로가 하나 있다:
 * 이력이 없는 첫 방문자는 1페이지가 널과 같은 점수로 계산되는데, 그 1페이지를
 * **보는 동안** record_view가 쌓여 seen_penalty가 1.0에서 0.25로 바뀐다.
 * 그러면 이미 본 게시물의 점수가 4배 떨어져 커서(`score < p_cursor`) 아래로
 * 내려가고, 2페이지에 다시 들어온다 — 롤백 트랜잭션으로 확인: 바로 부르면
 * 겹침 0, 1페이지 5건을 record_view한 뒤 부르면 2~4. 근본 원인은 세션 id가
 * 아니라 **점수 함수가 시간에 따라 변한다는 것**이고, 키셋 페이지네이션과
 * 원리적으로 어긋난다. 제대로 고치려면 페널티를 페이지네이션 동안 고정해야
 * 한다(예: seed를 뽑은 시각을 기준으로). CardFeed의 중복 제거 가드가 화면을
 * 지켜 주므로 별건으로 남긴다.
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

/**
 * 쿠키 수명 30일.
 *
 * 이 값이 지켜야 하는 것은 `seen_penalty`의 **3일** 회고뿐이다. 넉넉하게
 * 잡되 필요 이상으로 길게 두지 않는다 — 이건 모든 요청에 실려 나가는
 * 지속 식별자라, 수명이 길수록 추적 표면만 커지고 얻는 것은 없다.
 * (localStorage 시절의 "사실상 영구"를 굳이 재현할 이유는 없었다.)
 */
export const SESSION_ID_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * 쿠키 문자열에서 세션 id를 뽑는다. 순수 함수라 단위 테스트 대상이다.
 *
 * 이름을 정규식에 박지 않고 상수에서 만든다 — 박아 두면 SESSION_ID_COOKIE를
 * 바꿨을 때 클라이언트 읽기만 조용히 실패한다.
 */
export function readSessionId(cookieHeader: string): string | null {
  const name = SESSION_ID_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 클라이언트에서 세션 id를 읽는다.
 *
 * 미들웨어가 심어 두므로 보통은 그 값이 그대로 나온다. 서버가 1페이지를
 * 그릴 때 쓴 값과 **같아야** 하므로 여기서 임의로 새로 만들지 않는다 —
 * 쿠키가 없을 때만 폴백한다.
 */
/** 쿠키를 못 쓸 때의 폴백을 이 탭 안에서 고정한다. 호출마다 새로 만들면
 *  record_view의 (게시물, 세션) 10분 중복 제거가 리마운트마다 깨진다. */
let fallbackId: string | null = null;

export function getSessionId(): string {
  try {
    const fromCookie = readSessionId(document.cookie);
    if (fromCookie) return fromCookie;
  } catch {
    // document 접근 자체가 막힌 환경 — 아래 폴백으로 간다.
  }
  fallbackId ??= crypto.randomUUID();
  return fallbackId;
}
