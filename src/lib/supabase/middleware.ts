import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { FEED_SEED_COOKIE } from "@/lib/feed-seed";
import { SESSION_ID_COOKIE, SESSION_ID_MAX_AGE } from "@/lib/session-id";

/**
 * 세션 토큰 갱신 + /admin 접근 제어.
 *
 * @supabase/ssr은 만료된 토큰을 미들웨어에서 갱신해 쿠키에 다시 심어야
 * 서버 컴포넌트가 로그인 상태를 볼 수 있다.
 *
 * 여기서 role까지 확인하지는 않는다 — 미들웨어는 DB를 때리지 않고
 * "로그인했는가"만 본다. role=admin 확인은 어드민 레이아웃이 한다.
 * 최종 방어선은 어차피 RLS다 (FRONTEND.md §5).
 *
 * 그래서 **로그인 화면을 건너뛰는 판단은 여기서 하지 않는다**. 예전에는
 * "로그인했으면 /admin으로 보낸다"를 여기 두었는데, role을 모르는 층이
 * 권한 판단을 내린 셈이라 권한 없는 로그인 사용자가
 * /admin → (레이아웃) /admin/login → (여기) /admin 으로 무한히 튕겼다.
 * 그 판단은 role을 아는 로그인 페이지가 한다 (admin/login/page.tsx).
 */
export async function updateSession(request: NextRequest) {
  // 피드 seed는 응답보다 먼저 요청에 심어야 한다 — NextResponse.next는
  // 만들어지는 시점의 요청 헤더를 스냅숏으로 들고 가므로, 나중에 넣으면
  // 이번 요청을 처리하는 서버 컴포넌트는 그 값을 보지 못한다.
  const hasSeed = request.cookies.has(FEED_SEED_COOKIE);
  const seed = request.cookies.get(FEED_SEED_COOKIE)?.value ?? crypto.randomUUID();
  if (!hasSeed) request.cookies.set(FEED_SEED_COOKIE, seed);

  // 세션 id도 같은 이유로 여기서 심는다 — 서버 컴포넌트가 피드 1페이지를
  // 랭킹할 때 읽어야 하는데, localStorage에 있던 동안에는 읽을 방법이 없어
  // 1페이지만 seen_penalty가 빠진 점수로 계산됐다(session-id.ts 주석).
  const hasSessionId = request.cookies.has(SESSION_ID_COOKIE);
  const sessionId =
    request.cookies.get(SESSION_ID_COOKIE)?.value ?? crypto.randomUUID();
  if (!hasSessionId) request.cookies.set(SESSION_ID_COOKIE, sessionId);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser()를 호출해야 토큰이 갱신된다. getSession()은 갱신하지 않는다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/admin/login";

  if (pathname.startsWith("/admin") && !isLoginPage && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // supabase의 setAll이 response를 갈아 끼우므로 여기서 심는다.
  // maxAge를 주지 않아 브라우저를 닫으면 순서가 새로 뽑힌다.
  if (!hasSeed) {
    response.cookies.set(FEED_SEED_COOKIE, seed, { path: "/", sameSite: "lax" });
  }

  // seed와 달리 maxAge를 준다 — seen_penalty가 3일을 돌아보는데 브라우저
  // 세션은 대개 그보다 짧아, 세션 쿠키로 두면 그 3일이 무의미해진다.
  // httpOnly를 주지 않는 이유: 클라이언트가 record_view·다음 페이지 요청에
  // 같은 값을 실어 보내야 한다(session-id.ts).
  if (!hasSessionId) {
    response.cookies.set(SESSION_ID_COOKIE, sessionId, {
      path: "/",
      sameSite: "lax",
      maxAge: SESSION_ID_MAX_AGE,
      // 지속 식별자가 매 요청에 실려 나가므로 프로덕션에서는 평문으로 보내지
      // 않는다. 로컬은 http라 secure를 주면 아예 안 심긴다.
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
