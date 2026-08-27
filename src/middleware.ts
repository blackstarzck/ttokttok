import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // 어드민만 세션 갱신이 필요하다. 공개 화면은 게스트로 동작하므로
  // 미들웨어를 태우지 않아 피드 응답이 느려지지 않는다.
  matcher: ["/admin/:path*"],
};
