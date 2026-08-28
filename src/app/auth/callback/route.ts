import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 소셜로그인 콜백 (PRD §5.8).
 *
 * 구글·카카오 → Supabase → 여기로 돌아온다. 인가 코드를 세션으로 바꿔
 * 쿠키에 심고, 로그인을 시작했던 화면으로 되돌린다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // 사용자가 동의를 취소하면 code 없이 error가 온다.
  const error = searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const db = await createClient();
  const { error: exchangeError } = await db.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("OAuth 코드 교환 실패:", exchangeError.message);
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // 열린 리다이렉트를 막는다 — 같은 출처의 경로만 허용한다.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
