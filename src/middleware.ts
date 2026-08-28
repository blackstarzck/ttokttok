import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * 어드민뿐 아니라 일반 화면도 태운다 — 소셜로그인이 붙으면서 서버
   * 컴포넌트가 로그인 상태를 봐야 하고, 만료된 토큰은 미들웨어에서
   * 갱신해 쿠키에 다시 심어야 하기 때문이다.
   *
   * 정적 자산과 이미지 최적화 경로는 뺀다 — 세션과 무관하고 요청 수가 많다.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|epub)$).*)",
  ],
};
