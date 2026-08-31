import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { FEED_SEED_COOKIE } from "@/lib/feed-seed";

/**
 * 세션 토큰 갱신 + /admin 접근 제어.
 *
 * @supabase/ssr은 만료된 토큰을 미들웨어에서 갱신해 쿠키에 다시 심어야
 * 서버 컴포넌트가 로그인 상태를 볼 수 있다.
 *
 * 여기서 role까지 확인하지는 않는다 — 미들웨어는 DB를 때리지 않고
 * "로그인했는가"만 본다. role=admin 확인은 어드민 레이아웃이 한다.
 * 최종 방어선은 어차피 RLS다 (FRONTEND.md §5).
 */
export async function updateSession(request: NextRequest) {
  // 피드 seed는 응답보다 먼저 요청에 심어야 한다 — NextResponse.next는
  // 만들어지는 시점의 요청 헤더를 스냅숏으로 들고 가므로, 나중에 넣으면
  // 이번 요청을 처리하는 서버 컴포넌트는 그 값을 보지 못한다.
  const hasSeed = request.cookies.has(FEED_SEED_COOKIE);
  const seed = request.cookies.get(FEED_SEED_COOKIE)?.value ?? crypto.randomUUID();
  if (!hasSeed) request.cookies.set(FEED_SEED_COOKIE, seed);

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

  if (isLoginPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // supabase의 setAll이 response를 갈아 끼우므로 여기서 심는다.
  // maxAge를 주지 않아 브라우저를 닫으면 순서가 새로 뽑힌다.
  if (!hasSeed) {
    response.cookies.set(FEED_SEED_COOKIE, seed, { path: "/", sameSite: "lax" });
  }

  return response;
}
