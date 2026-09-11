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
  const { data: exchangeData, error: exchangeError } =
    await db.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("OAuth 코드 교환 실패:", exchangeError.message);
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // 관리자 계정으로는 서비스를 이용할 수 없다 (설계 §6).
  //
  // 관리자는 profiles 행을 갖지 않으므로 그대로 두면 "독자"로 보이다가
  // 댓글을 쓰는 순간 FK 위반으로 깨진다 — 조용한 고장이다. 여기서 끊으면
  // 앞으로 추가될 모든 관리자에게 자동으로 적용된다.
  //
  // 합성 이메일(@ttokttok.local) 덕분에 새 관리자에게는 소셜 로그인 경로가
  // 애초에 열리지 않지만, 누군가 실수로 진짜 이메일을 ID로 쓰더라도 막힌다.
  //
  // exchangeCodeForSession이 이미 user를 돌려주므로 getUser()를 다시
  // 부르지 않는다 — 토큰 교환 응답 자체가 인증 서버의 최신 응답이다.
  const { data: adminAccount } = await db
    .from("admin_accounts")
    .select("id")
    .eq("id", exchangeData.user.id)
    .maybeSingle();

  if (adminAccount) {
    await db.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=admin_account`);
  }

  // 열린 리다이렉트를 막는다 — 같은 출처의 경로만 허용한다.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
